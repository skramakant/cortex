/**
 * Poster.gs
 * Posts tweets via the Twitter/X API and updates column C status.
 */

/**
 * Posts a tweet for the given row. Reads title from col D and resource links from col B.
 *
 * Status written to col C after posting:
 *   - maxCount > 0 and limit reached → "sent"  (scheduler won't touch it again)
 *   - maxCount > 0 and limit NOT reached → ""   (scheduler will post again next match)
 *   - maxCount = 0 (unlimited) → ""             (scheduler will post again next match)
 *   - API error → "error: ..."
 *
 * resourceLinks formats (col B):
 *   - ""  or "none"          → no media
 *   - "drive:<fileId>"       → image saved in Google Drive; upload to Twitter at post time
 *   - "drive:<id1>,drive:<id2>" → multiple Drive files (comma-separated)
 *   - "https://..."          → public URL(s); uploadMedia() fetches and uploads each one
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex       1-based row number
 * @param {string} title          tweet text (col D)
 * @param {string} resourceLinks  col B value
 * @param {number} maxCount       col F value (0 = unlimited)
 * @param {number} newPostCount   post count AFTER this post (col G + 1)
 * @param {string} tweetLink      col A value (unused now, kept for signature compat)
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
function postTweetForRow(sheet, rowIndex, title, resourceLinks, maxCount, newPostCount, tweetLink) {
  if (!title) {
    writeCell(sheet, rowIndex, COL_STATUS, 'error: no tweet text');
    return;
  }

  try {
    var result;

    if (resourceLinks && resourceLinks !== 'none' && resourceLinks !== '') {
      var entries = resourceLinks.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

      // Check if all entries are Drive references
      var allDrive = entries.every(function(e) { return e.indexOf('drive:') === 0; });

      if (allDrive) {
        // Upload each Drive file to Twitter and collect media IDs
        var mediaIds = [];
        for (var i = 0; i < entries.length; i++) {
          var fileId = entries[i].replace('drive:', '');
          var uploadResult = uploadMediaFromDrive(fileId);
          if (uploadResult.error) {
            Logger.log('Drive upload failed for ' + fileId + ': ' + uploadResult.error);
          } else {
            mediaIds.push(uploadResult.mediaId);
          }
        }
        result = postTweetWithMediaIds(title, mediaIds);
      } else {
        // Public URLs — uploadMedia() fetches and uploads each one
        var mediaUrls = entries.filter(function(u) { return u !== 'none'; });
        result = postTweet(title, mediaUrls);
      }
    } else {
      // No media
      result = postTweet(title, []);
    }

    if (result.error) {
      writeCell(sheet, rowIndex, COL_STATUS, 'error: ' + result.error);
      return;
    }

    // Determine what status to write:
    //   - unlimited (maxCount = 0): clear status so scheduler fires again next match
    //   - limited and limit now reached: mark "sent" permanently
    //   - limited but still under limit: clear status so scheduler fires again
    var limitReached = (maxCount > 0 && newPostCount >= maxCount);
    writeCell(sheet, rowIndex, COL_STATUS, limitReached ? 'sent' : '');

  } catch (e) {
    // Catch any unexpected error so it doesn't crash the scheduler loop
    writeCell(sheet, rowIndex, COL_STATUS, 'error: ' + e.message);
  }
}
