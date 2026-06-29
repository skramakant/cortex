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
    } else if (action === 'listTweets') {
      result = handleListTweets();
    } else if (action === 'updateTweet') {
      result = handleUpdateTweet(params);
    } else if (action === 'deleteTweet') {
      result = handleDeleteTweet(params);
    } else if (action === 'verifyPassword') {
      result = handleVerifyPassword(params);
    } else if (action === 'listPending') {
      result = handleListPending();
    } else if (action === 'approveTweet') {
      result = handleApproveTweet(params);
    } else if (action === 'rejectTweet') {
      result = handleRejectTweet(params);
    } else if (action === 'markApproved') {
      result = handleMarkApproved(params);
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

    // Write new row to sheet.
    // For scheduled (cron) clone tweets that have media URLs, save each image
    // to Drive now so Poster never needs to re-fetch from Twitter at post time.
    var storedResourceLinks = resourceLinks;
    if (scheduleMode === 'cron' && resourceLinks && resourceLinks !== 'none') {
      var urls = resourceLinks.split(',').map(function(u) { return u.trim(); }).filter(Boolean);
      var driveIds = [];
      for (var di = 0; di < urls.length; di++) {
        var dr = saveUrlImageToDrive(urls[di], 'media_' + Date.now() + '_' + di + '.jpg');
        if (!dr.error) {
          driveIds.push('drive:' + dr.fileId);
        } else {
          // Fall back to the original URL if Drive save fails
          driveIds.push(urls[di]);
          Logger.log('Drive save failed for ' + urls[di] + ': ' + dr.error);
        }
      }
      storedResourceLinks = driveIds.join(',');
    }

    var sheet    = getOrCreateTweetSheet();
    var rowIndex = _getNewRowIndex(sheet);

    writeCell(sheet, rowIndex, COL_TWEET_LINK,     tweetLink);
    writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, storedResourceLinks);
    writeCell(sheet, rowIndex, COL_STATUS,         '');
    writeCell(sheet, rowIndex, COL_TITLE,          title);
    writeCell(sheet, rowIndex, COL_MAX_COUNT,      maxCount);
    writeCell(sheet, rowIndex, COL_POST_COUNT,     0);
    writeCell(sheet, rowIndex, COL_CRON,           scheduleMode === 'cron' ? cronExpression : '');

    // Send Now: post immediately using original resourceLinks (no Drive needed for one-shot)
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
 * Accepts either a resourceLinks URL or a Base64-encoded image (imageBase64).
 * If imageBase64 is provided it is uploaded to Twitter directly; the resulting
 * media URL is stored in resourceLinks for the sheet row.
 *
 * @param {{ title: string, resourceLinks: string, imageBase64?: string,
 *           scheduleMode: string, cronExpression?: string, maxCount?: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleNewTweet(params) {
  try {
    var title          = params.title || '';
    var resourceLinks  = params.resourceLinks || '';
    var imageBase64    = params.imageBase64 || '';
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

    // If a Base64 image was uploaded, save it to Drive for durable storage.
    // Drive file ID is stored as "drive:<fileId>" in col B so Poster can
    // re-upload to Twitter at post time without hitting the Twitter API again.
    if (imageBase64) {
      var driveResult = saveBase64ImageToDrive(imageBase64, 'upload_' + Date.now() + '.jpg');
      if (driveResult.error) {
        return { success: false, error: 'Image save failed: ' + driveResult.error };
      }
      resourceLinks = 'drive:' + driveResult.fileId;
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

/**
 * Diagnostic: tests Drive access by creating the TweetScheduler_Media folder
 * (if it doesn't exist) and saving a tiny test file into it.
 * Run this from the Apps Script editor to confirm Drive integration works.
 * Check the Execution Log for results.
 */
function diagnoseDrive() {
  try {
    // 1. Locate or create the folder via the cached-ID helper
    var folder = _getOrCreateMediaFolder();
    Logger.log('OK: Folder ready — ' + folder.getName() + ' (id: ' + folder.getId() + ')');

    // 2. Save a tiny test file
    var testBlob = Utilities.newBlob('test', 'text/plain', 'drive_test.txt');
    var testFile = folder.createFile(testBlob);
    Logger.log('OK: Test file saved — id: ' + testFile.getId());

    // 3. Read it back
    var readBack = DriveApp.getFileById(testFile.getId());
    Logger.log('OK: Test file read back — name: ' + readBack.getName());

    // 4. Clean up
    testFile.setTrashed(true);
    Logger.log('OK: Test file deleted. Drive integration is working correctly.');

  } catch (e) {
    Logger.log('ERROR: Drive test failed — ' + e.message);
    Logger.log('Make sure the drive.file scope is in appsscript.json and you have re-authorized.');
  }
}

// ============================================================
// View / Edit / Delete tweet handlers
// ============================================================

/**
 * Returns all tweet rows as an array of objects with 1-based rowIndex values.
 * @returns {{ success: boolean, tweets?: Array<Object>, error?: string }}
 */
function handleListTweets() {
  try {
    var sheet  = getOrCreateTweetSheet();
    var rows   = getAllRows(sheet);
    var tweets = rows.map(function(row, index) {
      return {
        rowIndex:      index + 2,                       // +1 for header, +1 for 0→1 index
        tweetLink:     String(row[COL_TWEET_LINK     - 1] || ''),
        resourceLinks: String(row[COL_RESOURCE_LINKS - 1] || ''),
        status:        String(row[COL_STATUS         - 1] || ''),
        title:         String(row[COL_TITLE          - 1] || ''),
        cron:          String(row[COL_CRON           - 1] || ''),
        maxCount:      Number(row[COL_MAX_COUNT      - 1] || 0),
        postCount:     Number(row[COL_POST_COUNT     - 1] || 0),
      };
    });
    return { success: true, tweets: tweets };
  } catch (err) {
    return { success: false, error: 'Failed to list tweets: ' + err.message };
  }
}

/**
 * Updates editable fields of an existing tweet row.
 * Only fields present in params are written; others are left untouched.
 * @param {{ rowIndex: number, title?: string, resourceLinks?: string, cron?: string, maxCount?: number, status?: string }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleUpdateTweet(params) {
  try {
    var rowIndex = Number(params.rowIndex);
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid row index.' };
    }
    var sheet   = getOrCreateTweetSheet();
    var lastRow = sheet.getLastRow();
    if (rowIndex > lastRow) {
      return { success: false, error: 'Row does not exist.' };
    }

    if (params.title         !== undefined) writeCell(sheet, rowIndex, COL_TITLE,          params.title);
    if (params.resourceLinks !== undefined) writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, params.resourceLinks || 'none');
    if (params.cron          !== undefined) writeCell(sheet, rowIndex, COL_CRON,           params.cron);
    if (params.maxCount      !== undefined) writeCell(sheet, rowIndex, COL_MAX_COUNT,      Number(params.maxCount) || 0);
    if (params.status        !== undefined) writeCell(sheet, rowIndex, COL_STATUS,         params.status);

    return { success: true, message: 'Tweet updated successfully.' };
  } catch (err) {
    return { success: false, error: 'Failed to update tweet: ' + err.message };
  }
}

/**
 * Deletes a tweet row by its 1-based row index.
 * @param {{ rowIndex: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleDeleteTweet(params) {
  try {
    var rowIndex = Number(params.rowIndex);
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid row index.' };
    }
    var sheet   = getOrCreateTweetSheet();
    var lastRow = sheet.getLastRow();
    if (rowIndex > lastRow) {
      return { success: false, error: 'Row does not exist.' };
    }

    sheet.deleteRow(rowIndex);
    return { success: true, message: 'Tweet deleted successfully.' };
  } catch (err) {
    return { success: false, error: 'Failed to delete tweet: ' + err.message };
  }
}

/**
 * Verifies the submitted password against the APP_PASSWORD script property.
 * Called before the API key check is relevant — this is a separate gate
 * for the login screen.
 * @param {{ password: string }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleVerifyPassword(params) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty('APP_PASSWORD');
    if (!expected) {
      return { success: false, error: 'Password not configured on server. Set APP_PASSWORD in Script Properties.' };
    }
    if (params.password !== expected) {
      return { success: false, error: 'Incorrect password.' };
    }
    return { success: true, message: 'Authenticated.' };
  } catch (err) {
    return { success: false, error: 'Server error: ' + err.message };
  }
}

// ============================================================
// Auto-tweet pipeline handlers (RSS → Gemini → approval queue)
// ============================================================

/**
 * Returns all rows with status 'pending' from the auto_tweets sheet.
 * @returns {{ success: boolean, items?: Array<Object>, error?: string }}
 */
function handleListPending() {
  try {
    var sheet   = getOrCreateAutoTweetSheet();
    var pending = getPendingRows(sheet);
    return { success: true, items: pending };
  } catch (err) {
    return { success: false, error: 'Failed to list pending: ' + err.message };
  }
}

/**
 * Posts the tweet draft to X and marks the row as 'approved'.
 * Accepts an updated tweetDraft in case the user edited it in the UI.
 * @param {{ rowIndex: number, tweetDraft: string }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleApproveTweet(params) {
  try {
    var rowIndex   = Number(params.rowIndex);
    var tweetDraft = String(params.tweetDraft || '').trim();

    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid row index.' };
    }
    if (!tweetDraft) {
      return { success: false, error: 'Tweet text is required.' };
    }

    // Post to X
    var postResult = postTweet(tweetDraft, []);
    if (postResult.error) {
      return { success: false, error: 'Failed to post tweet: ' + postResult.error };
    }

    // Persist the (possibly edited) draft and mark approved
    var sheet = getOrCreateAutoTweetSheet();
    sheet.getRange(rowIndex, AT_COL_TWEET_DRAFT).setValue(tweetDraft);
    updateAutoTweetRow(sheet, rowIndex, 'approved');

    return { success: true, message: 'Tweet posted successfully.' };
  } catch (err) {
    return { success: false, error: 'Unexpected error: ' + err.message };
  }
}

/**
 * Marks a pending row as 'rejected' — no tweet is posted.
 * Row is kept in the sheet so the RSS poller won't re-queue the same article.
 * @param {{ rowIndex: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleRejectTweet(params) {
  try {
    var rowIndex = Number(params.rowIndex);
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid row index.' };
    }

    var sheet = getOrCreateAutoTweetSheet();
    updateAutoTweetRow(sheet, rowIndex, 'rejected');

    return { success: true, message: 'Article rejected.' };
  } catch (err) {
    return { success: false, error: 'Unexpected error: ' + err.message };
  }
}

/**
 * Marks a row as 'approved' without posting to X.
 * Used when the user copies the tweet and posts manually via the X app.
 * @param {{ rowIndex: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleMarkApproved(params) {
  try {
    var rowIndex = Number(params.rowIndex);
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid row index.' };
    }
    var sheet = getOrCreateAutoTweetSheet();
    updateAutoTweetRow(sheet, rowIndex, 'approved');
    return { success: true, message: 'Marked as approved.' };
  } catch (err) {
    return { success: false, error: 'Unexpected error: ' + err.message };
  }
}
