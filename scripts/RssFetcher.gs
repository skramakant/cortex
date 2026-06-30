/**
 * RssFetcher.gs
 * Polls RSS feeds, generates tweet drafts via Gemini, and queues them
 * as pending rows in the auto_tweets sheet for manual approval in the UI.
 *
 * Setup:
 *   1. Set GEMINI_API_KEY in Script Properties.
 *   2. Create a time-based trigger: Triggers → Add Trigger → pollRssFeeds
 *      Run every 1 hour (or every 2 hours to stay well within free-tier limits).
 *   3. Run testPollRssFeeds() manually from the editor to verify everything works.
 */

/** RSS sources to poll. Add more entries to expand coverage. */
var RSS_SOURCES = [
  // Industry news & drama
  { name: 'Hacker News',            url: 'https://hnrss.org/best' },
  { name: 'The Verge',              url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'TechCrunch',             url: 'https://feeds.feedburner.com/TechCrunch' },
  { name: 'VentureBeat',            url: 'https://venturebeat.com/feed/' },
  // Deep technical content
  { name: 'Pragmatic Engineer',     url: 'https://newsletter.pragmaticengineer.com/feed' },
  { name: 'Martin Fowler',          url: 'https://martinfowler.com/feed.atom' },
  { name: 'All Things Distributed', url: 'https://www.allthingsdistributed.com/atom.xml' },
  { name: 'Marc Brooker',           url: 'https://brooker.co.za/blog/rss.xml' },
  // Database & backend engineering
  { name: 'PostgreSQL News',        url: 'https://www.postgresql.org/news.rss' },
  { name: 'PlanetScale Blog',       url: 'https://planetscale.com/blog/rss.xml' },
  { name: 'Timescale Blog',         url: 'https://blog.timescale.com/blog/rss/' },
  { name: 'Percona Blog',           url: 'https://www.percona.com/blog/feed/' },
  { name: 'High Scalability',       url: 'https://highscalability.com/rss/' },
  { name: 'Redis Blog',             url: 'https://redis.io/blog/feed/' },
];

/** Max new articles to queue per source per run (keeps Gemini usage low). */
var MAX_NEW_PER_SOURCE = 1;

/**
 * Minimum delay between Groq API calls in milliseconds.
 * Groq free tier allows 30 RPM for llama-3.3-70b — 2 seconds keeps us safely under.
 */
var GEMINI_CALL_DELAY_MS = 2000;

// ============================================================
// Main entry points
// ============================================================

/**
 * Main trigger function — polls all RSS sources and queues new articles.
 *
 * Execution strategy (to stay within GAS 6-minute limit):
 *   1. Fetch all RSS feeds in ONE parallel batch
 *   2. Parse feeds, collect new articles across all sources
 *   3. Fetch all article texts in ONE parallel batch (not per-source)
 *   4. Call Groq sequentially with delay for each article
 *
 * Wire this up as a time-based trigger (every 2 hours).
 */
function pollRssFeeds() {
  var sheet = getOrCreateAutoTweetSheet();

  // ── Step 1: fetch all RSS feeds in parallel ──────────────────────────────
  var feedRequests = RSS_SOURCES.map(function(source) {
    return { url: source.url, muteHttpExceptions: true };
  });

  var feedResponses;
  try {
    feedResponses = UrlFetchApp.fetchAll(feedRequests);
  } catch (e) {
    Logger.log('[RssFetcher] Failed to fetch RSS feeds: ' + e.message);
    return;
  }

  // ── Step 2: parse each feed, collect new unseen articles ─────────────────
  var allNewItems = []; // { sourceName, title, link }

  RSS_SOURCES.forEach(function(source, i) {
    var resp = feedResponses[i];
    if (!resp || resp.getResponseCode() !== 200) {
      Logger.log('[RssFetcher] HTTP ' + (resp ? resp.getResponseCode() : 'null') + ' for ' + source.name);
      return;
    }

    var items = _parseRssItems(resp.getContentText());
    Logger.log('[RssFetcher] ' + source.name + ': ' + items.length + ' items in feed');

    var count = 0;
    for (var j = 0; j < items.length && count < MAX_NEW_PER_SOURCE; j++) {
      if (!items[j].title || !items[j].link) continue;
      if (isArticleAlreadySeen(sheet, items[j].link)) {
        Logger.log('[RssFetcher] Already seen: ' + items[j].title);
        continue;
      }
      allNewItems.push({ sourceName: source.name, title: items[j].title, link: items[j].link });
      count++;
    }
  });

  if (allNewItems.length === 0) {
    Logger.log('[RssFetcher] No new articles across all sources.');
    return;
  }

  Logger.log('[RssFetcher] ' + allNewItems.length + ' new article(s) to process across all sources.');

  // ── Step 3: generate tweet drafts sequentially ────────────────────────────
  // Description comes from the RSS/Atom feed itself — no article URL fetching needed.
  var queued = 0;
  for (var k = 0; k < allNewItems.length; k++) {
    var item = allNewItems[k];

    var gen = generateTweetWithGemini(item.title, item.description || '');
    if (gen.error) {
      Logger.log('[RssFetcher] Groq error for "' + item.title + '": ' + gen.error + ' — skipping.');
    } else {
      addPendingArticle(sheet, item.link, item.sourceName, item.title, gen.tweet, gen.category || '');
      Logger.log('[RssFetcher] Queued [' + item.sourceName + ']: ' + item.title);
      queued++;
    }

    if (k < allNewItems.length - 1) Utilities.sleep(GEMINI_CALL_DELAY_MS);
  }

  Logger.log('[RssFetcher] Done. Queued ' + queued + ' new article(s) total.');
}

/**
 * Manual test — run from the Apps Script editor to verify the full pipeline.
 * Check Execution Logs and the auto_tweets sheet for results.
 */
function testPollRssFeeds() {
  Logger.log('[RssFetcher] Starting test run…');
  pollRssFeeds();
  Logger.log('[RssFetcher] Done. Check the auto_tweets sheet.');
}

// ============================================================
// RSS fetching & parsing
// ============================================================

/**
 * Parses an RSS 2.0 or Atom 1.0 feed and returns an array of
 * { title, link, description } objects.
 *
 * RSS 2.0: <channel><item> with <title>, <link>, <description>
 * Atom 1.0: <feed><entry> with <title>, <link href="">, <summary> or <content>
 *
 * @param {string} xmlText
 * @returns {Array<{title: string, link: string, description: string}>}
 */
function _parseRssItems(xmlText) {
  var items = [];
  try {
    var doc  = XmlService.parse(xmlText);
    var root = doc.getRootElement();

    // ── RSS 2.0 ──────────────────────────────────────────────────────────────
    var channel = root.getChild('channel');
    if (channel) {
      channel.getChildren('item').forEach(function(item) {
        var title       = _childText(item, 'title');
        var link        = _childText(item, 'link');
        var description = _stripHtml(_childText(item, 'description')).substring(0, 800);
        if (title && link) {
          items.push({ title: title.trim(), link: link.trim(), description: description });
        }
      });
      return items;
    }

    // ── Atom 1.0 ─────────────────────────────────────────────────────────────
    var atomNs  = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    var entries = root.getChildren('entry', atomNs);
    if (entries.length === 0) entries = root.getChildren('entry'); // fallback (no ns)

    entries.forEach(function(entry) {
      var title   = _childTextNs(entry, 'title',   atomNs);
      var summary = _childTextNs(entry, 'summary', atomNs) ||
                    _childTextNs(entry, 'content', atomNs);
      var description = _stripHtml(summary).substring(0, 800);

      // Atom <link> is a self-closing element with href attribute
      var linkEl  = entry.getChild('link', atomNs) || entry.getChild('link');
      var link    = '';
      if (linkEl) {
        var hrefAttr = linkEl.getAttribute('href');
        link = hrefAttr ? hrefAttr.getValue() : linkEl.getText();
      }

      if (title && link) {
        items.push({ title: title.trim(), link: link.trim(), description: description });
      }
    });

  } catch (e) {
    Logger.log('[RssFetcher] XML parse error: ' + e.message);
  }
  return items;
}

/**
 * Safely reads the text of a named child element, with optional namespace.
 * @param {GoogleAppsScript.XML.Element} parent
 * @param {string} name
 * @param {GoogleAppsScript.XML.Namespace} [ns]
 * @returns {string}
 */
function _childTextNs(parent, name, ns) {
  var child = ns ? parent.getChild(name, ns) : parent.getChild(name);
  return child ? (child.getText() || '') : '';
}

/**
 * Strips HTML tags and decodes common entities from a string.
 * @param {string} html
 * @returns {string}
 */
function _stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g,    ' ')
    .trim();
}

/**
 * Safely reads the text of a named child element (no namespace).
 * @param {GoogleAppsScript.XML.Element} parent
 * @param {string} name
 * @returns {string}
 */
function _childText(parent, name) {
  var child = parent.getChild(name);
  return child ? (child.getText() || '') : '';
}

// ============================================================
// Gemini AI tweet generation
// ============================================================

/**
 * Calls the Groq API (llama-3.3-70b) to generate a human-sounding tweet
 * from an article title and its content excerpt.
 * API key stored as GEMINI_API_KEY in Script Properties.
 *
 * @param {string} title        Article headline
 * @param {string} articleText  First ~1500 chars of article body (may be empty)
 * @returns {{ tweet: string } | { error: string }}
 */
function generateTweetWithGemini(title, articleText) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY not set in Script Properties.' };
  }

  var contextBlock = articleText && articleText.trim()
    ? 'Article content (excerpt):\n' + articleText.trim() + '\n\n'
    : '';

  var prompt =
    'You are a tech industry insider — a senior engineer with 15 years of experience who has strong opinions and does not sugarcoat things.\n\n' +
    'Your job: write one tweet based on the article. Use this exact 3-line structure:\n\n' +
    'Line 1: A provocative statement or surprising fact from the article — the hook. Make someone stop scrolling. (1 sentence)\n' +
    'Line 2: The context or why it matters — add the detail that makes line 1 credible. (1–2 sentences)\n' +
    'Line 3: The implication or your take — what this means for developers, companies, or the industry. (1 sentence)\n\n' +
    'Separate each line with a newline character. Total length between 200 and 300 characters.\n\n' +
    'Voice: confident, plain, no hype words, no corporate speak.\n\n' +
    'Hard rules:\n' +
    '- No URLs, links, or hashtags\n' +
    '- Do NOT start with "I just", "Just", "Breaking:", "Hot take:"\n' +
    '- Do NOT end with "what\'s next?", "thoughts?", "the future is here"\n' +
    '- Do NOT mention the source or publication name\n' +
    '- Return the tweet text ONLY — no labels, no quotes, nothing else\n\n' +
    'Also classify the article into exactly one of these categories:\n' +
    '"AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
    'Example JSON output:\n\n' +
    '{"tweet": "Google laid off 12,000 engineers and then hired 12,000 more for AI.\n\nThe jobs did not disappear — they were reclassified. If you are not learning AI tooling right now, you are being quietly replaced.\n\nThe transition is already happening. Most people just have not noticed.", "category": "Tech Industry"}\n\n' +
    'Now write for this article:\n' +
    'Article title: ' + title + '\n\n' +
    contextBlock;

  var url     = 'https://api.groq.com/openai/v1/chat/completions';
  var payload = {
    model:           'llama-3.3-70b-versatile',
    messages:        [{ role: 'user', content: prompt }],
    max_tokens:      320,
    temperature:     0.85,
    response_format: { type: 'json_object' }
  };

  try {
    var response = UrlFetchApp.fetch(url, {
      method:             'POST',
      contentType:        'application/json',
      headers:            { 'Authorization': 'Bearer ' + apiKey },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return {
        error: 'Groq HTTP ' + response.getResponseCode() + ': ' +
               response.getContentText().substring(0, 300)
      };
    }

    var body = JSON.parse(response.getContentText());
    var raw  = body.choices &&
               body.choices[0] &&
               body.choices[0].message &&
               body.choices[0].message.content;

    if (!raw) return { error: 'Empty response from Groq' };

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fallback: if JSON mode fails for some reason, use raw text as tweet
      return { tweet: raw.trim().replace(/^["""''']+|["""''']+$/g, '').trim(), category: '' };
    }

    var tweet    = String(parsed.tweet    || '').trim().replace(/^["""''']+|["""''']+$/g, '').trim();
    var category = String(parsed.category || '').trim();

    if (!tweet) return { error: 'Empty tweet in Groq JSON response' };

    return { tweet: tweet, category: category };

  } catch (e) {
    return { error: 'Groq call failed: ' + e.message };
  }
}

/**
 * Weekly cleanup trigger — deletes rejected rows older than 7 days.
 * Set this up as a time-based trigger: every week (or every day if preferred).
 * Apps Script → Triggers → Add Trigger → weeklyCleanup → Week timer
 */
function weeklyCleanup() {
  cleanupOldRejectedRows(7);
}
