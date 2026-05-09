/**
 * WebApp.gs
 * Google Apps Script Web App entry points and form submission handler.
 * Serves the Tweet Scheduler HTML form and processes tweet link submissions.
 */

/**
 * Serves the Tweet Scheduler HTML page.
 * @param {Object} e  The event object (unused).
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Tweet Scheduler');
}

/**
 * Handles HTTP POST requests from external clients.
 * Reads form parameters and delegates to handleFormSubmit().
 * @param {Object} e  The POST event object with e.parameter.
 * @returns {GoogleAppsScript.Content.TextOutput}  JSON response.
 */
function doPost(e) {
  var params = {
    tweetLink:      e.parameter.tweetLink,
    scheduleMode:   e.parameter.scheduleMode,
    cronExpression: e.parameter.cronExpression
  };
  var result = handleFormSubmit(params);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Validates a tweet URL.
 * @param {string} url  The URL to validate.
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
 * Called from the client before the user confirms submission.
 *
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
 * Main form submission handler. Validates inputs, writes a new row to the
 * tweet sheet, and (for "Send Now") posts using the user-edited title.
 *
 * @param {{ tweetLink: string, scheduleMode: string, title: string, resourceLinks: string, cronExpression?: string }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleFormSubmit(params) {
  try {
    var tweetLink      = params.tweetLink;
    var scheduleMode   = params.scheduleMode;
    var cronExpression = params.cronExpression;
    var title          = params.title || '';
    var resourceLinks  = params.resourceLinks || '';

    // --- Validate tweet link ---
    var linkError = _validateTweetLink(tweetLink);
    if (linkError) {
      return { success: false, error: linkError };
    }

    // --- Validate title ---
    if (!title || !title.trim()) {
      return { success: false, error: 'Tweet text is required.' };
    }

    // --- Validate cron expression (only in cron mode) ---
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

    // --- Write new row to sheet ---
    var sheet    = getOrCreateTweetSheet();
    var rowIndex = _getNewRowIndex(sheet);

    writeCell(sheet, rowIndex, COL_TWEET_LINK,     tweetLink);
    writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, resourceLinks);
    writeCell(sheet, rowIndex, COL_STATUS,         '');
    writeCell(sheet, rowIndex, COL_TITLE,          title);

    if (scheduleMode === 'now') {
      writeCell(sheet, rowIndex, COL_CRON, '');
    } else if (scheduleMode === 'cron') {
      writeCell(sheet, rowIndex, COL_CRON, cronExpression);
    }

    // --- Send Now: post using the user-edited title ---
    if (scheduleMode === 'now') {
      postTweetForRow(sheet, rowIndex, title, resourceLinks);

      var colCValue = sheet.getRange(rowIndex, COL_STATUS).getValue();
      if (String(colCValue).indexOf('error:') === 0) {
        return { success: false, error: colCValue };
      }

      return { success: true, message: 'Tweet sent successfully.' };
    }

    // --- Cron mode: row written, scheduler will handle posting ---
    if (scheduleMode === 'cron') {
      return { success: true, message: 'Tweet scheduled successfully.' };
    }

    // Fallback (unknown scheduleMode)
    return { success: false, error: 'Unknown schedule mode: ' + scheduleMode };

  } catch (e) {
    return { success: false, error: 'Unexpected error: ' + e.message };
  }
}

/**
 * Diagnostic function — run this directly from the Apps Script editor
 * to verify credentials and sheet access before using the web app.
 * Check the Execution Log for results.
 */
function diagnoseCreds() {
  // 1. Check Script Properties
  var props = PropertiesService.getScriptProperties();
  var keys = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET'];
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

  // 2. Check sheet access
  try {
    var sheet = getOrCreateTweetSheet();
    Logger.log('OK: Sheet found/created: ' + sheet.getName());
  } catch (e) {
    Logger.log('ERROR: Sheet access failed: ' + e.message);
    return;
  }

  // 3. Try a test API call (fetch tweet data without posting)
  try {
    var result = fetchTweetData('20'); // Twitter's first ever tweet ID
    if (result.error) {
      Logger.log('API ERROR: ' + result.error);
    } else {
      Logger.log('OK: API call succeeded. Tweet text: ' + result.text);
    }
  } catch (e) {
    Logger.log('ERROR: API call threw: ' + e.message);
  }

  // 4. Test buildOAuth1Header directly
  try {
    var header = buildOAuth1Header('GET', 'https://api.twitter.com/2/tweets/20', {});
    Logger.log('OK: OAuth header built: ' + header.substring(0, 40) + '...');
  } catch (e) {
    Logger.log('ERROR: buildOAuth1Header threw: ' + e.message);
  }
}

/**
 * TEMPORARY — Run once to set credentials, then delete this function.
 * Replace the placeholder values with your actual Twitter/X API credentials.
 */
function setCredentials() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    'TWITTER_API_KEY':             'PASTE_YOUR_API_KEY_HERE',
    'TWITTER_API_SECRET':          'PASTE_YOUR_API_SECRET_HERE',
    'TWITTER_ACCESS_TOKEN':        'PASTE_YOUR_ACCESS_TOKEN_HERE',
    'TWITTER_ACCESS_TOKEN_SECRET': 'PASTE_YOUR_ACCESS_TOKEN_SECRET_HERE'
  });
  Logger.log('Credentials saved. Run diagnoseCreds() to verify.');
}
