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

    // Generate tweet draft via Gemini
    var gen = generateTweetWithGemini(title);
    if (gen.error) {
      Logger.log('[RssFetcher] Gemini error for "' + title + '": ' + gen.error + ' — skipping, will retry next run.');
      // Don't queue articles with no draft — they'll be picked up on the next run
      // once the rate limit window resets.
      if (queued < MAX_NEW_PER_SOURCE - 1) {
        Utilities.sleep(GEMINI_CALL_DELAY_MS);
      }
      continue;
    }

    addPendingArticle(sheet, link, sourceName, title, gen.tweet);
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

// ============================================================
// Gemini AI tweet generation
// ============================================================

/**
 * Calls the Groq API (llama-3.3-70b) to generate a human-sounding tweet
 * from an article title. API key stored as GEMINI_API_KEY in Script Properties.
 *
 * @param {string} title  Article headline
 * @returns {{ tweet: string } | { error: string }}
 */
function generateTweetWithGemini(title) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY not set in Script Properties.' };
  }

  var prompt =
    'You are a senior software engineer and tech enthusiast with strong opinions about AI and technology.\n' +
    'Write a single tweet based on this article title.\n\n' +
    'Rules:\n' +
    '- Write in first person, like a real person sharing a genuine thought — not a news summary\n' +
    '- Sound opinionated, direct, and human — never robotic, corporate, or AI-generated\n' +
    '- No URLs, no links of any kind, no hashtags\n' +
    '- No phrases like "AI says", "according to", "I just read", "breaking:", "new article", "this article"\n' +
    '- Do NOT mention the source, website, or publication name at all\n' +
    '- One punchy idea only — do not try to summarise the whole article\n' +
    '- Can be a hot take, a surprising insight, a genuine reaction, or a thought-provoking question\n' +
    '- Maximum 260 characters — strictly enforce this\n' +
    '- Return ONLY the tweet text — no quotes around it, no labels, no explanation\n\n' +
    'Article title: ' + title;

  var url     = 'https://api.groq.com/openai/v1/chat/completions';
  var payload = {
    model:       'llama-3.3-70b-versatile',
    messages:    [{ role: 'user', content: prompt }],
    max_tokens:  120,
    temperature: 0.85
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
    var text = body.choices &&
               body.choices[0] &&
               body.choices[0].message &&
               body.choices[0].message.content;

    if (!text) return { error: 'Empty response from Groq' };

    // Strip surrounding quotes the model sometimes adds
    text = text.trim().replace(/^["""''']+|["""''']+$/g, '').trim();

    return { tweet: text };

  } catch (e) {
    return { error: 'Groq call failed: ' + e.message };
  }
}
