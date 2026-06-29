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
  { name: 'Hacker News', url: 'https://hnrss.org/best' }
];

/** Max new articles to queue per source per run (keeps Gemini usage low). */
var MAX_NEW_PER_SOURCE = 5;

/**
 * Minimum delay between Gemini API calls in milliseconds.
 * Gemini 2.0 Flash free tier allows 15 requests/min = 4 sec minimum.
 * Using 5 sec to stay comfortably under the limit.
 */
var GEMINI_CALL_DELAY_MS = 5000;

// ============================================================
// Main entry points
// ============================================================

/**
 * Main trigger function — polls all RSS sources and queues new articles.
 * Wire this up as a time-based trigger (every 1–2 hours).
 */
function pollRssFeeds() {
  var sheet = getOrCreateAutoTweetSheet();

  RSS_SOURCES.forEach(function(source) {
    try {
      fetchAndQueueFromFeed(sheet, source.name, source.url);
    } catch (e) {
      Logger.log('[RssFetcher] Error processing ' + source.name + ': ' + e.message);
    }
  });
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
 * Fetches one RSS feed, filters new articles, generates tweet drafts,
 * and appends pending rows to the sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} sourceName
 * @param {string} feedUrl
 */
function fetchAndQueueFromFeed(sheet, sourceName, feedUrl) {
  var response = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    Logger.log('[RssFetcher] HTTP ' + response.getResponseCode() + ' fetching ' + feedUrl);
    return;
  }

  var items = _parseRssItems(response.getContentText());
  Logger.log('[RssFetcher] ' + sourceName + ': ' + items.length + ' items in feed');

  var queued = 0;
  for (var i = 0; i < items.length && queued < MAX_NEW_PER_SOURCE; i++) {
    var item  = items[i];
    var title = item.title;
    var link  = item.link;

    if (!title || !link) continue;
    if (isArticleAlreadySeen(sheet, link)) {
      Logger.log('[RssFetcher] Already seen: ' + title);
      continue;
    }

    // Fetch article content for richer context — fall back to title-only if it fails
    var articleText = fetchArticleText(link);
    Logger.log('[RssFetcher] Article text length: ' + articleText.length + ' chars for: ' + title);

    // Generate tweet draft via Groq
    var gen = generateTweetWithGemini(title, articleText);
    if (gen.error) {
      Logger.log('[RssFetcher] Gemini error for "' + title + '": ' + gen.error + ' — skipping, will retry next run.');
      // Don't queue articles with no draft — they'll be picked up on the next run
      // once the rate limit window resets.
      if (queued < MAX_NEW_PER_SOURCE - 1) {
        Utilities.sleep(GEMINI_CALL_DELAY_MS);
      }
      continue;
    }

    addPendingArticle(sheet, link, sourceName, title, gen.tweet, gen.category || '');
    Logger.log('[RssFetcher] Queued: ' + title);
    queued++;

    // Delay between Gemini calls to stay under the 15 RPM free-tier limit
    if (queued < MAX_NEW_PER_SOURCE && i < items.length - 1) {
      Utilities.sleep(GEMINI_CALL_DELAY_MS);
    }
  }

  Logger.log('[RssFetcher] Queued ' + queued + ' new article(s) from ' + sourceName);
}

/**
 * Parses RSS 2.0 XML and returns an array of { title, link } objects.
 * @param {string} xmlText
 * @returns {Array<{title: string, link: string}>}
 */
function _parseRssItems(xmlText) {
  var items = [];
  try {
    var doc     = XmlService.parse(xmlText);
    var root    = doc.getRootElement();
    var channel = root.getChild('channel');
    if (!channel) return items;

    var rawItems = channel.getChildren('item');
    rawItems.forEach(function(item) {
      var title = _childText(item, 'title');
      var link  = _childText(item, 'link');
      if (title && link) {
        items.push({ title: title.trim(), link: link.trim() });
      }
    });
  } catch (e) {
    Logger.log('[RssFetcher] XML parse error: ' + e.message);
  }
  return items;
}

/**
 * Safely reads the text of a named child element.
 * @param {GoogleAppsScript.XML.Element} parent
 * @param {string} name
 * @returns {string}
 */
function _childText(parent, name) {
  var child = parent.getChild(name);
  return child ? (child.getText() || '') : '';
}

/**
 * Fetches the article at the given URL and returns the first ~1500 characters
 * of visible text content (scripts, styles and HTML tags stripped).
 * Returns an empty string on any error — caller falls back to title-only.
 * @param {string} url
 * @returns {string}
 */
function fetchArticleText(url) {
  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects:    true,
      headers:            { 'User-Agent': 'Mozilla/5.0 (compatible; RSS-reader/1.0)' }
    });
    if (response.getResponseCode() !== 200) return '';

    var html = response.getContentText();

    // Remove script, style, nav, header, footer blocks entirely
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    html = html.replace(/<style[\s\S]*?<\/style>/gi,   ' ');
    html = html.replace(/<nav[\s\S]*?<\/nav>/gi,       ' ');
    html = html.replace(/<header[\s\S]*?<\/header>/gi, ' ');
    html = html.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

    // Strip remaining HTML tags
    var text = html.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&')
               .replace(/&lt;/g,  '<')
               .replace(/&gt;/g,  '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g,  "'")
               .replace(/&nbsp;/g, ' ');

    // Collapse whitespace and trim
    text = text.replace(/\s+/g, ' ').trim();

    return text.substring(0, 1500);
  } catch (e) {
    Logger.log('[RssFetcher] fetchArticleText failed for ' + url + ': ' + e.message);
    return '';
  }
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
    'Your job: write one tweet based on the article. The tweet must reflect the actual content and give readers a real insight.\n\n' +
    'Tweet writing rules:\n' +
    '- Write in natural, flowing prose — full sentences, not compressed summaries\n' +
    '- Confident and direct — no hype words, no corporate speak\n' +
    '- Strong statements beat weak questions\n' +
    '- No URLs, links, or hashtags\n' +
    '- Do NOT start with "I just", "Just", "Breaking:", "Hot take:", "Same "\n' +
    '- Do NOT end with "what\'s next?", "thoughts?", "the future is here"\n' +
    '- Do NOT mention the source, publication, or website name\n' +
    '- Between 180 and 280 characters — use the space to be specific and insightful\n\n' +
    'Also classify the article into exactly one of these categories:\n' +
    '"AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
    'Respond with valid JSON only. Here are two examples of the exact format and prose style expected:\n\n' +
    '{"tweet": "Copy-pasting from Stack Overflow was always a workaround for bad documentation. AI did not make developers lazier — it just made the workaround faster and more personal.", "category": "Tech Industry"}\n\n' +
    '{"tweet": "An ATS that scores the same resume differently on every run is not a hiring tool — it is a random number generator with a UI. Automating bias is easy. Automating fairness is the hard part nobody is working on.", "category": "Software Engineering"}\n\n' +
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
