/**
 * RssFetcher.gs
 * Polls RSS feeds, generates tweet drafts via Groq, and queues them
 * as pending rows in the auto_tweets sheet for manual approval in the UI.
 *
 * Feed sources are managed in the "rss_feeds" sheet tab (FeedSheet.gs).
 * Enable/disable individual feeds from the Feeds tab in the UI.
 *
 * Setup:
 *   1. Set GEMINI_API_KEY (Groq key) in Script Properties.
 *   2. Triggers → Add Trigger → pollRssFeeds → Time-driven → every 2 hours.
 *   3. Run testPollRssFeeds() manually to verify the pipeline.
 */

/** Minimum delay between Groq API calls — 2 seconds keeps us under 30 RPM free tier. */
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
  var sheet     = getOrCreateAutoTweetSheet();
  var feedSheet = getOrCreateFeedSheet();
  var sources   = getEnabledFeeds(feedSheet);

  if (sources.length === 0) {
    Logger.log('[RssFetcher] No enabled feeds. Add feeds in the Feeds tab.');
    return;
  }
  Logger.log('[RssFetcher] Polling ' + sources.length + ' enabled feed(s).');

  // ── Step 1: fetch all RSS feeds in parallel ──────────────────────────────
  var feedRequests = sources.map(function(source) {
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
  var allNewItems = []; // { sourceName, title, link, description }

  sources.forEach(function(source, i) {
    var resp = feedResponses[i];
    if (!resp || resp.getResponseCode() !== 200) {
      Logger.log('[RssFetcher] HTTP ' + (resp ? resp.getResponseCode() : 'null') + ' for ' + source.name);
      return;
    }

    var items = _parseRssItems(resp.getContentText());
    Logger.log('[RssFetcher] ' + source.name + ': ' + items.length + ' items in feed');

    var count = 0;
    for (var j = 0; j < items.length && count < source.maxNew; j++) {
      if (!items[j].title || !items[j].link) continue;
      if (isArticleAlreadySeen(sheet, items[j].link)) {
        Logger.log('[RssFetcher] Already seen: ' + items[j].title);
        continue;
      }
      allNewItems.push({
        sourceName:         source.name,
        title:              items[j].title,
        link:               items[j].link,
        description:        source.skipDescription ? '' : (items[j].description || ''),
        fetchFullArticle:   source.fetchFullArticle,
        tweetLength:        source.tweetLength,
        promptStyle:        source.promptStyle
      });
      count++;
    }
  });

  if (allNewItems.length === 0) {
    Logger.log('[RssFetcher] No new articles across all sources.');
    return;
  }

  Logger.log('[RssFetcher] ' + allNewItems.length + ' new article(s) to process across all sources.');

  // ── Step 3: fetch full article HTML for items that have fetchFullArticle=true ──
  var itemsNeedingFetch = allNewItems.filter(function(item) { return item.fetchFullArticle; });
  if (itemsNeedingFetch.length > 0) {
    Logger.log('[RssFetcher] Fetching full article text for ' + itemsNeedingFetch.length + ' item(s) in parallel…');
    var articleRequests = itemsNeedingFetch.map(function(item) {
      return {
        url:                item.link,
        method:             'GET',
        muteHttpExceptions: true,
        followRedirects:    true,
        headers:            { 'User-Agent': 'Mozilla/5.0 (compatible; RSS-reader/1.0)' }
      };
    });
    try {
      var articleResponses = UrlFetchApp.fetchAll(articleRequests);
      itemsNeedingFetch.forEach(function(item, idx) {
        var resp = articleResponses[idx];
        if (resp && resp.getResponseCode() === 200) {
          var extracted = _extractText(resp.getContentText());
          if (extracted) {
            item.description = extracted;
            Logger.log('[RssFetcher] Full article: ' + extracted.length + ' chars for: ' + item.title);
          }
        } else {
          Logger.log('[RssFetcher] Could not fetch article for: ' + item.title + ' — using RSS description');
        }
      });
    } catch (e) {
      Logger.log('[RssFetcher] fetchAll for articles failed: ' + e.message + ' — falling back to RSS description');
    }
  }

  // ── Step 4: generate tweet drafts sequentially ────────────────────────────
  var queued = 0;
  for (var k = 0; k < allNewItems.length; k++) {
    var item = allNewItems[k];

    var gen = generateTweetWithGemini(item.title, item.description || '', item.tweetLength, item.promptStyle);
    if (gen.error) {
      Logger.log('[RssFetcher] Groq error for "' + item.title + '": ' + gen.error + ' — skipping.');
    } else {
      addPendingArticle(sheet, item.link, item.sourceName, item.title, gen.tweet, gen.category || '');
      Logger.log('[RssFetcher] Queued [' + item.sourceName + '] desc:' + (item.description || '').length + 'ch: ' + item.title);
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
      // content:encoded namespace (used by WordPress and many RSS feeds)
      var contentNs = XmlService.getNamespace('http://purl.org/rss/1.0/modules/content/');

      channel.getChildren('item').forEach(function(item) {
        var title = _childText(item, 'title');
        var link  = _childText(item, 'link');

        // Prefer content:encoded (full article) over description (usually a short excerpt)
        var encoded     = _childTextNs(item, 'encoded', contentNs);
        var raw         = encoded || _childText(item, 'description');
        var description = _stripHtml(raw).substring(0, 1200);

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
      // Try with namespace first, then without — feeds vary
      var title   = _childTextNs(entry, 'title',   atomNs) || _childText(entry, 'title');
      var summary = _childTextNs(entry, 'summary', atomNs) || _childText(entry, 'summary') ||
                    _childTextNs(entry, 'content', atomNs) || _childText(entry, 'content');
      var description = _stripHtml(summary).substring(0, 1200);

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

/**
 * Strips HTML tags and decodes common entities, returns first 1500 chars.
 * Used when fetchFullArticle = true to extract readable text from article HTML.
 * @param {string} html
 * @returns {string}
 */
function _extractText(html) {
  if (!html) return '';
  try {
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    html = html.replace(/<style[\s\S]*?<\/style>/gi,   ' ');
    html = html.replace(/<nav[\s\S]*?<\/nav>/gi,       ' ');
    html = html.replace(/<header[\s\S]*?<\/header>/gi, ' ');
    html = html.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
    var text = html.replace(/<[^>]+>/g, ' ')
                   .replace(/&amp;/g,  '&')
                   .replace(/&lt;/g,   '<')
                   .replace(/&gt;/g,   '>')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g,  "'")
                   .replace(/&nbsp;/g, ' ')
                   .replace(/\s+/g,    ' ')
                   .trim();
    return text.substring(0, 1500);
  } catch (e) {
    return '';
  }
}

// ============================================================
// Gemini AI tweet generation
// ============================================================

/**
 * Calls the Groq API (llama-3.3-70b) to generate a tweet draft.
 * Supports two prompt styles:
 *   "short_take"   — opinionated 3-line hot take (default, max ~280 chars)
 *   "educational"  — long-form teaching tweet with real-world examples
 *
 * @param {string} title        Article headline
 * @param {string} articleText  Description or full article content (may be empty)
 * @param {number} tweetLength  Max characters for the tweet (default 280)
 * @param {string} promptStyle  "short_take" or "educational" (default "short_take")
 * @returns {{ tweet: string, category: string } | { error: string }}
 */
function generateTweetWithGemini(title, articleText, tweetLength, promptStyle) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY not set in Script Properties.' };
  }

  tweetLength = tweetLength || 280;
  promptStyle = promptStyle || 'short_take';

  var contextBlock = articleText && articleText.trim()
    ? 'Article content (excerpt):\n' + articleText.trim() + '\n\n'
    : '';

  var prompt;

  if (promptStyle === 'educational') {
    prompt =
      'You are an expert software engineer and tech educator. Your tweets make complex technical topics easy to understand through real-world examples from companies everyone knows.\n\n' +
      'Write an educational tweet based on this article. Your tweet should:\n' +
      '- Start with a specific real-world use case from a well-known company (Uber, Netflix, Amazon, Google, Meta, etc.) that immediately shows WHY this concept matters\n' +
      '- Explain the core concept step by step in plain language a mid-level developer can follow\n' +
      '- Give 3–4 concrete examples from different well-known companies showing how they use this in production\n' +
      '- Include a short "how to identify if you need this" or practical takeaway at the end\n' +
      '- Use blank lines between sections for readability\n' +
      '- Sound like a knowledgeable engineer sharing hard-won knowledge, not a textbook\n' +
      '- No URLs, no hashtags, no markdown headers\n' +
      '- Target length: ' + tweetLength + ' characters\n\n' +
      'Also classify the article into exactly one category:\n' +
      '"AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
      'Respond with valid JSON only:\n' +
      '{"tweet": "...", "category": "..."}\n\n' +
      'Article title: ' + title + '\n\n' +
      contextBlock;
  } else {
    prompt =
      'You are a tech industry insider — a senior engineer with 15 years of experience who has strong opinions and does not sugarcoat things.\n\n' +
      'Your job: write one tweet based on the article. Use this exact 3-line structure:\n\n' +
      'Line 1: A provocative statement or surprising fact from the article — the hook. Make someone stop scrolling. (1 sentence)\n' +
      'Line 2: The context or why it matters — add the detail that makes line 1 credible. (1–2 sentences)\n' +
      'Line 3: The implication or your take — what this means for developers, companies, or the industry. (1 sentence)\n\n' +
      'Separate each line with a newline character. Total length between 200 and ' + tweetLength + ' characters.\n\n' +
      'Voice: confident, plain, no hype words, no corporate speak.\n\n' +
      'Hard rules:\n' +
      '- No URLs, links, or hashtags\n' +
      '- Do NOT start with "I just", "Just", "Breaking:", "Hot take:"\n' +
      '- Do NOT end with "what\'s next?", "thoughts?", "the future is here"\n' +
      '- Do NOT mention the news source or publication name (e.g. VentureBeat, TechCrunch, HackerNews)\n' +
      '- DO use model names, product names, company names, and technical specs — they are the point\n\n' +
      'Also classify the article into exactly one category:\n' +
      '"AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
      'Example JSON output:\n\n' +
      '{"tweet": "Google laid off 12,000 engineers and then hired 12,000 more for AI.\n\nThe jobs did not disappear — they were reclassified. If you are not learning AI tooling right now, you are being quietly replaced.\n\nThe transition is already happening. Most people just have not noticed.", "category": "Tech Industry"}\n\n' +
      'Now write for this article:\n' +
      'Article title: ' + title + '\n\n' +
      contextBlock;
  }

  // Scale max_tokens with tweet length: ~4 chars per token + 200 buffer
  var maxTokens = Math.max(320, Math.ceil(tweetLength / 4) + 200);

  var url     = 'https://api.groq.com/openai/v1/chat/completions';
  var payload = {
    model:           'llama-3.3-70b-versatile',
    messages:        [{ role: 'user', content: prompt }],
    max_tokens:      maxTokens,
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
