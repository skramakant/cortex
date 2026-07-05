/**
 * AutoTweetSheet.gs
 * Helpers for the "auto_tweets" sheet tab used by the RSS auto-tweet pipeline.
 *
 * Sheet columns (1-based):
 *   A  article_url   — original article URL, used as dedup key
 *   B  source        — feed name, e.g. "Hacker News"
 *   C  article_title — article headline
 *   D  tweet_draft   — AI-generated tweet text (editable by user in UI)
 *   E  status        — 'pending' | 'approved' | 'rejected'
 *   F  fetched_at    — ISO timestamp when the row was created
 *   G  actioned_at   — ISO timestamp when approved or rejected
 */

var AT_COL_ARTICLE_URL  = 1;
var AT_COL_SOURCE       = 2;
var AT_COL_TITLE        = 3;
var AT_COL_TWEET_DRAFT  = 4;
var AT_COL_STATUS       = 5;
var AT_COL_FETCHED_AT   = 6;
var AT_COL_ACTIONED_AT  = 7;
var AT_COL_CATEGORY     = 8;
var AT_COL_AI_VERDICT   = 9;
var AT_COL_POLL_TWEET   = 10;

/**
 * Returns the auto_tweets sheet, creating it with headers if it doesn't exist.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateAutoTweetSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('auto_tweets');
  if (!sheet) {
    sheet = ss.insertSheet('auto_tweets');
    sheet.getRange(1, 1, 1, 10).setValues([[
      'article url',
      'source',
      'article title',
      'tweet draft',
      'status',
      'fetched at',
      'actioned at',
      'category',
      'ai verdict',
      'poll tweet'
    ]]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(AT_COL_ARTICLE_URL,  300);
    sheet.setColumnWidth(AT_COL_TITLE,        300);
    sheet.setColumnWidth(AT_COL_TWEET_DRAFT,  350);
    sheet.setColumnWidth(AT_COL_CATEGORY,     140);
    sheet.setColumnWidth(AT_COL_AI_VERDICT,   260);
    sheet.setColumnWidth(AT_COL_POLL_TWEET,   350);
  } else {
    // Ensure new columns exist on older sheets
    if (sheet.getLastColumn() < AT_COL_AI_VERDICT) {
      sheet.getRange(1, AT_COL_AI_VERDICT).setValue('ai verdict');
      sheet.setColumnWidth(AT_COL_AI_VERDICT, 260);
    }
    if (sheet.getLastColumn() < AT_COL_POLL_TWEET) {
      sheet.getRange(1, AT_COL_POLL_TWEET).setValue('poll tweet');
      sheet.setColumnWidth(AT_COL_POLL_TWEET, 350);
    }
  }
  return sheet;
}

/**
 * Returns true if the given article URL already exists anywhere in the sheet.
 * Used to prevent duplicate rows across runs.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} articleUrl
 * @returns {boolean}
 */
function isArticleAlreadySeen(sheet, articleUrl) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var urls = sheet.getRange(2, AT_COL_ARTICLE_URL, lastRow - 1, 1).getValues();
  for (var i = 0; i < urls.length; i++) {
    if (String(urls[i][0]).trim() === articleUrl.trim()) return true;
  }
  return false;
}

/**
 * Appends a new pending row to the auto_tweets sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} articleUrl
 * @param {string} source
 * @param {string} title
 * @param {string} tweetDraft
 * @returns {number}  1-based row index of the inserted row
 */
function addPendingArticle(sheet, articleUrl, source, title, tweetDraft, category, pollTweet) {
  var rowIndex = sheet.getLastRow() + 1;
  var now      = new Date().toISOString();
  sheet.getRange(rowIndex, 1, 1, 10).setValues([[
    articleUrl,
    source,
    title,
    tweetDraft,
    'pending',
    now,
    '',
    category  || '',
    '',              // ai_verdict — empty until analyzed
    pollTweet || ''  // poll_tweet
  ]]);
  return rowIndex;
}

/**
 * Returns all rows with status === 'pending' as an array of objects.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Object>}
 */
function getPendingRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var rows    = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var pending = [];

  rows.forEach(function(row, i) {
    if (String(row[AT_COL_STATUS - 1]) === 'pending') {
      pending.push({
        rowIndex:   i + 2,
        articleUrl: String(row[AT_COL_ARTICLE_URL - 1] || ''),
        source:     String(row[AT_COL_SOURCE      - 1] || ''),
        title:      String(row[AT_COL_TITLE       - 1] || ''),
        tweetDraft: String(row[AT_COL_TWEET_DRAFT - 1] || ''),
        status:     'pending',
        fetchedAt:  String(row[AT_COL_FETCHED_AT  - 1] || ''),
        category:   String(row[AT_COL_CATEGORY    - 1] || ''),
        aiVerdict:  String(row[AT_COL_AI_VERDICT  - 1] || ''),
        pollTweet:  String(row[AT_COL_POLL_TWEET  - 1] || ''),
      });
    }
  });

  return pending;
}

/**
 * Updates the status and actioned_at timestamp of a given row.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based row number
 * @param {string} status    'approved' or 'rejected'
 */
function updateAutoTweetRow(sheet, rowIndex, status) {
  sheet.getRange(rowIndex, AT_COL_STATUS).setValue(status);
  sheet.getRange(rowIndex, AT_COL_ACTIONED_AT).setValue(new Date().toISOString());
}

/**
 * Deletes rows from the auto_tweets sheet where:
 *   - status is 'rejected'
 *   - actioned_at is older than `daysOld` days ago
 *
 * Iterates from the bottom up to avoid row-index shifting during deletion.
 *
 * @param {number} daysOld  Rows older than this many days are deleted (default 7)
 */
function cleanupOldRejectedRows(daysOld) {
  daysOld = daysOld || 7;
  var sheet   = getOrCreateAutoTweetSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var cutoff  = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  var rows    = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var deleted = 0;

  // Iterate bottom-up so deleting a row doesn't shift the indices we haven't visited yet
  for (var i = rows.length - 1; i >= 0; i--) {
    var status     = String(rows[i][AT_COL_STATUS      - 1] || '');
    var actionedAt = rows[i][AT_COL_ACTIONED_AT - 1];

    if (status !== 'rejected') continue;

    var actionedDate = actionedAt ? new Date(actionedAt) : null;
    if (!actionedDate || isNaN(actionedDate.getTime())) continue;

    if (actionedDate < cutoff) {
      sheet.deleteRow(i + 2); // +2: +1 for header, +1 for 0-based index
      deleted++;
    }
  }

  Logger.log('[Cleanup] Deleted ' + deleted + ' rejected row(s) older than ' + daysOld + ' days.');
}

/**
 * Returns pending rows that have NOT yet been analyzed (ai_verdict is empty).
 * Sorted newest first, capped at 10 — used by handleAnalyzeEngagement().
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Object>}
 */
function getPendingRowsForAnalysis(sheet) {
  var all = getPendingRows(sheet).filter(function(row) {
    return !row.aiVerdict || row.aiVerdict.trim() === '';
  });
  all.sort(function(a, b) {
    return new Date(b.fetchedAt) - new Date(a.fetchedAt);
  });
  return all.slice(0, 10);
}

/**
 * Writes the AI verdict string to column I for each analyzed row.
 * Verdict format: "approve (8/10): reason text"
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<{rowIndex: number, decision: string, score: number, reason: string}>} results
 */
function saveAnalysisVerdicts(sheet, results) {
  results.forEach(function(r) {
    if (!r.rowIndex || r.rowIndex < 2) return;
    var verdict = r.decision + ' (' + r.score + '/10): ' + (r.reason || '');
    sheet.getRange(r.rowIndex, AT_COL_AI_VERDICT).setValue(verdict);
  });
}
