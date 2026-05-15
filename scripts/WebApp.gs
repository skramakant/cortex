/**
 * WebApp.gs
 * Google Apps Script HTTP handler.
 *
 * The frontend is now hosted on GitHub Pages — doGet() is no longer used.
 * All requests come in as POST from the static frontend via fetch().
 *
 * Routing is action-based:
 *   { action: 'fetchPreview', tweetUrl }          → fetchTweetPreview()
 *   { action: 'submitTweet',  ...cloneParams }    → handleFormSubmit()
 *   { action: 'newTweet',     ...newTweetParams } → handleNewTweet()
 */

/**
 * HTTP POST handler — entry point for all frontend API calls.
 *
 * The frontend sends Content-Type: text/plain (a CORS "simple request" —
 * no preflight). GAS receives the raw JSON body in e.postData.contents.
 *
 * Parses the body, validates the API key, routes by action field.
 * @param {Object} e  The POST event object.
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var result;
  try {
    var params = JSON.parse(e.postData.contents);

    // --- API key validation ---
    var expectedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!expectedKey) {
      result = { success: false, error: 'Server misconfiguration: API_KEY not set.' };
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (params.apiKey !== expectedKey) {
      result = { success: false, error: 'Unauthorized.' };
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var action = params.action;

    if (action === 'fetchPreview') {
      result = fetchTweetPreview(params.tweetUrl);
    } else if (action === 'submitTweet') {
      result = handleFormSubmit(params);
    } else if (action === 'newTweet') {
      result = handleNewTweet(params);
    } else {
      result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: 'Server error: ' + err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Validates a tweet URL.
 * @param {string} url
 * @returns {string|null}  null if valid; an error string if invalid.
 */
function _validateTweetLink(url) {
  if (!url || !url.trim()) {
    return 'Tweet link is required.';
  }
  var pattern = /https?:\/\/(twitter\.com|x\.com)\/[^\/]+\/status\/\d+/;
  if (!pattern.test(url)) {
    return 'Tweet link must be a valid twitter.com or x.com status URL.';
  }
  return null;
}

/**
 * Returns the 1-based row index for the next empty row in the sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {number}
 */
function _getNewRowIndex(sheet) {
  return sheet.getLastRow() + 1;
}

/**
 * Fetches tweet data for preview without writing to the sheet.
 * @param {string} tweetUrl
 * @returns {{ success: boolean, text?: string, mediaUrls?: string[], error?: string }}
 */
function fetchTweetPreview(tweetUrl) {
  try {
    var linkError = _validateTweetLink(tweetUrl);
    if (linkError) {
      return { success: false, error: linkError };
    }

    var tweetId = extractTweetId(tweetUrl);
    if (!tweetId) {
      return { success: false, error: 'Could not extract tweet ID from URL.' };
    }

    var result = fetchTweetData(tweetId);
    if (result.error) {
      return { success: false, error: result.error };
    }

    return {
      success:   true,
      text:      result.text,
      mediaUrls: result.mediaUrls
    };
  } catch (e) {
    return { success: false, error: 'Unexpected error: ' + e.message };
  }
}

/**
 * Handles submission of a cloned tweet (from an existing tweet URL).
 * Validates inputs, writes a new row, and posts immediately or schedules.
 *
 * @param {{ tweetLink: string, scheduleMode: string, title: string, resourceLinks: string, cronExpression?: string, maxCount?: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleFormSubmit(params) {
  try {
    var tweetLink      = params.tweetLink;
    var scheduleMode   = params.scheduleMode;
    var cronExpression = params.cronExpression;
    var title          = params.title || '';
    var resourceLinks  = params.resourceLinks || '';
    var maxCount       = parseInt(params.maxCount, 10) || 0;

    // Validate tweet link
    var linkError = _validateTweetLink(tweetLink);
    if (linkError) {
      return { success: false, error: linkError };
    }

    // Validate title
    if (!title || !title.trim()) {
      return { success: false, error: 'Tweet text is required.' };
    }

    // Validate cron expression (cron mode only)
    if (scheduleMode === 'cron') {
      if (!cronExpression || !cronExpression.trim()) {
        return { success: false, error: 'Cron expression is required.' };
      }
      var parsed = parseCronExpression(cronExpression);
      if (!parsed) {
        return {
          success: false,
          error: 'Cron expression is invalid. Use 5-field format: minute hour dom month dow.'
        };
      }
    }

    // Write new row to sheet
    var sheet    = getOrCreateTweetSheet();
    var rowIndex = _getNewRowIndex(sheet);

    writeCell(sheet, rowIndex, COL_TWEET_LINK,     tweetLink);
    writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, resourceLinks);
    writeCell(sheet, rowIndex, COL_STATUS,         '');
    writeCell(sheet, rowIndex, COL_TITLE,          title);
    writeCell(sheet, rowIndex, COL_MAX_COUNT,      maxCount);
    writeCell(sheet, rowIndex, COL_POST_COUNT,     0);
    writeCell(sheet, rowIndex, COL_CRON,           scheduleMode === 'cron' ? cronExpression : '');

    // Send Now: post immediately
    if (scheduleMode === 'now') {
      postTweetForRow(sheet, rowIndex, title, resourceLinks);

      var colCValue = sheet.getRange(rowIndex, COL_STATUS).getValue();
      if (String(colCValue).indexOf('error:') === 0) {
        return { success: false, error: colCValue };
      }
      return { success: true, message: 'Tweet sent successfully.' };
    }

    // Cron mode: row written, scheduler will handle posting
    return { success: true, message: 'Tweet scheduled successfully.' };

  } catch (e) {
    return { success: false, error: 'Unexpected error: ' + e.message };
  }
}

/**
 * Handles submission of a brand-new tweet (no source URL).
 *
 * @param {{ title: string, resourceLinks: string, scheduleMode: string, cronExpression?: string, maxCount?: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleNewTweet(params) {
  try {
    var title          = params.title || '';
    var resourceLinks  = params.resourceLinks || '';
    var scheduleMode   = params.scheduleMode;
    var cronExpression = params.cronExpression;
    var maxCount       = parseInt(params.maxCount, 10) || 0;

    // Validate title
    if (!title || !title.trim()) {
      return { success: false, error: 'Tweet text is required.' };
    }

    // Validate cron expression (cron mode only)
    if (scheduleMode === 'cron') {
      if (!cronExpression || !cronExpression.trim()) {
        return { success: false, error: 'Cron expression is required.' };
      }
      var parsed = parseCronExpression(cronExpression);
      if (!parsed) {
        return {
          success: false,
          error: 'Cron expression is invalid. Use 5-field format: minute hour dom month dow.'
        };
      }
    }

    // Write new row to sheet
    var sheet    = getOrCreateTweetSheet();
    var rowIndex = _getNewRowIndex(sheet);

    writeCell(sheet, rowIndex, COL_TWEET_LINK,     '');
    writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, resourceLinks);
    writeCell(sheet, rowIndex, COL_STATUS,         '');
    writeCell(sheet, rowIndex, COL_TITLE,          title);
    writeCell(sheet, rowIndex, COL_MAX_COUNT,      maxCount);
    writeCell(sheet, rowIndex, COL_POST_COUNT,     0);
    writeCell(sheet, rowIndex, COL_CRON,           scheduleMode === 'cron' ? cronExpression : '');

    // Send Now: post immediately
    if (scheduleMode === 'now') {
      postTweetForRow(sheet, rowIndex, title, resourceLinks);

      var colCValue = sheet.getRange(rowIndex, COL_STATUS).getValue();
      if (String(colCValue).indexOf('error:') === 0) {
        return { success: false, error: colCValue };
      }
      return { success: true, message: 'Tweet sent successfully.' };
    }

    // Cron mode: row written, scheduler will handle posting
    return { success: true, message: 'Tweet scheduled successfully.' };

  } catch (e) {
    return { success: false, error: 'Unexpected error: ' + e.message };
  }
}

/**
 * Diagnostic function — run from the Apps Script editor to verify
 * credentials and sheet access. Check the Execution Log for results.
 */
function diagnoseCreds() {
  var props = PropertiesService.getScriptProperties();
  var keys  = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET'];
  var missing = [];

  for (var i = 0; i < keys.length; i++) {
    var val = props.getProperty(keys[i]);
    if (!val) {
      missing.push(keys[i]);
      Logger.log('MISSING: ' + keys[i]);
    } else {
      Logger.log('OK: ' + keys[i] + ' = ' + val.substring(0, 6) + '...');
    }
  }

  if (missing.length > 0) {
    Logger.log('ERROR: Missing credentials: ' + missing.join(', '));
    return;
  }

  try {
    var sheet = getOrCreateTweetSheet();
    Logger.log('OK: Sheet found/created: ' + sheet.getName());
  } catch (e) {
    Logger.log('ERROR: Sheet access failed: ' + e.message);
    return;
  }

  try {
    var result = fetchTweetData('20');
    if (result.error) {
      Logger.log('API ERROR: ' + result.error);
    } else {
      Logger.log('OK: API call succeeded. Tweet text: ' + result.text);
    }
  } catch (e) {
    Logger.log('ERROR: API call threw: ' + e.message);
  }
}
