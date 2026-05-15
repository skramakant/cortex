/**
 * Extractor.gs
 * Scans eligible rows in the "tweet" sheet and fetches tweet text and media URLs.
 */

/**
 * Entry point: scans all rows where col A is non-empty and col B is empty,
 * then fetches and writes resource links and title.
 * Requirements: 2.1, 2.6, 3.4
 */
function extractResources() {
  var sheet = getOrCreateTweetSheet();
  var rows = getAllRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var tweetUrl = row[COL_TWEET_LINK - 1];
    var resourceLinks = row[COL_RESOURCE_LINKS - 1];
    if (tweetUrl && !resourceLinks) {
      var rowIndex = i + 2; // +1 for header, +1 for 1-based index
      processExtractionRow(sheet, rowIndex, tweetUrl);
    }
  }
}

/**
 * Processes a single row: fetches tweet data and writes to columns B and D.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based
 * @param {string} tweetUrl
 */
function processExtractionRow(sheet, rowIndex, tweetUrl) {
  var tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, 'error: invalid tweet URL');
    writeCell(sheet, rowIndex, COL_TITLE, 'error: unable to extract title');
    return;
  }

  var result = fetchTweetData(tweetId);

  if (result.error) {
    writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, 'error: ' + result.error);
    writeCell(sheet, rowIndex, COL_TITLE, 'error: unable to extract title');
    return;
  }

  var mediaUrls = result.mediaUrls && result.mediaUrls.length > 0
    ? result.mediaUrls.join(',')
    : 'none';
  writeCell(sheet, rowIndex, COL_RESOURCE_LINKS, mediaUrls);

  var title = result.text || 'error: unable to extract title';
  writeCell(sheet, rowIndex, COL_TITLE, title);
}

/**
 * Extracts the tweet ID from a Twitter/X URL.
 * Handles formats: twitter.com/user/status/ID and x.com/user/status/ID
 * @param {string} url
 * @returns {string|null}  tweet ID string, or null if not parseable
 */
function extractTweetId(url) {
  if (!url) return null;
  var match = url.match(/https?:\/\/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
  return match ? match[1] : null;
}
