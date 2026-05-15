/**
 * Poster.gs
 * Posts tweets via the Twitter/X API and updates column C status.
 */

/**
 * Posts a tweet for the given row. Reads title from col D and resource links from col B.
 * Writes "sent" or "error: ..." to col C.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based
 * @param {string} title     tweet text (col D)
 * @param {string} resourceLinks  comma-separated URLs or "none" (col B)
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
function postTweetForRow(sheet, rowIndex, title, resourceLinks) {
  if (!title) {
    writeCell(sheet, rowIndex, COL_STATUS, 'error: no tweet text');
    return;
  }

  // Parse media URLs: split on comma, trim, filter out "none" and empty strings
  var mediaUrls = [];
  if (resourceLinks && resourceLinks !== 'none') {
    mediaUrls = resourceLinks.split(',')
      .map(function(u) { return u.trim(); })
      .filter(function(u) { return u && u !== 'none'; });
  }

  var result = postTweet(title, mediaUrls);

  if (result.error) {
    writeCell(sheet, rowIndex, COL_STATUS, 'error: ' + result.error);
  } else {
    writeCell(sheet, rowIndex, COL_STATUS, 'sent');
  }
}
