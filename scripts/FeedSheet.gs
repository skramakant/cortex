/**
 * FeedSheet.gs
 * Helpers for the "rss_feeds" sheet tab.
 * Stores the list of RSS/Atom sources that pollRssFeeds() reads at runtime.
 *
 * Columns (1-based):
 *   A  name             — display name shown in the UI
 *   B  url              — RSS or Atom feed URL
 *   C  description      — what this feed covers (shown in UI)
 *   D  enabled          — TRUE / FALSE — poller skips disabled feeds
 *   E  skip_description — TRUE / FALSE — pass title only to Groq (for feeds
 *                          whose <description> is metadata, not content)
 */

var FS_COL_NAME             = 1;
var FS_COL_URL              = 2;
var FS_COL_DESCRIPTION      = 3;
var FS_COL_ENABLED          = 4;
var FS_COL_SKIP_DESCRIPTION = 5;

// ============================================================
// Sheet bootstrap
// ============================================================

/**
 * Returns the rss_feeds sheet, creating it with headers and default feeds
 * if it does not exist yet.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateFeedSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('rss_feeds');
  if (!sheet) {
    sheet = ss.insertSheet('rss_feeds');
    sheet.getRange(1, 1, 1, 5).setValues([[
      'name', 'url', 'description', 'enabled', 'skip description'
    ]]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(FS_COL_NAME,             160);
    sheet.setColumnWidth(FS_COL_URL,              320);
    sheet.setColumnWidth(FS_COL_DESCRIPTION,      360);
    sheet.setColumnWidth(FS_COL_ENABLED,           80);
    sheet.setColumnWidth(FS_COL_SKIP_DESCRIPTION, 120);
    _populateDefaultFeeds(sheet);
  }
  return sheet;
}

/**
 * Pre-populates the sheet with the 14 curated default feeds.
 * Called once when the sheet is first created.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function _populateDefaultFeeds(sheet) {
  var rows = [
    // name, url, description, enabled, skipDescription
    [
      'Hacker News',
      'https://hnrss.org/best',
      'Best stories curated by the tech community — aggregates top content from across the web',
      true, true
    ],
    [
      'The Verge',
      'https://www.theverge.com/rss/index.xml',
      'Consumer tech, big tech politics, layoffs and industry drama',
      true, false
    ],
    [
      'TechCrunch',
      'https://feeds.feedburner.com/TechCrunch',
      'Startup news, funding rounds, acquisitions and layoffs',
      true, false
    ],
    [
      'VentureBeat',
      'https://venturebeat.com/feed/',
      'AI industry news, enterprise AI and tech business coverage',
      true, false
    ],
    [
      'Pragmatic Engineer',
      'https://newsletter.pragmaticengineer.com/feed',
      'Engineering culture, salaries, big tech internals and system design — by Gergely Orosz',
      true, false
    ],
    [
      'Martin Fowler',
      'https://martinfowler.com/feed.atom',
      'Software architecture, design patterns and distributed systems — by Martin Fowler',
      true, false
    ],
    [
      'All Things Distributed',
      'https://www.allthingsdistributed.com/atom.xml',
      'Distributed systems and cloud architecture — by Werner Vogels (AWS CTO)',
      true, false
    ],
    [
      'Marc Brooker',
      'https://brooker.co.za/blog/rss.xml',
      'Deep distributed systems thinking — by AWS principal engineer Marc Brooker',
      true, false
    ],
    [
      'PostgreSQL News',
      'https://www.postgresql.org/news.rss',
      'Official PostgreSQL release announcements and project news',
      true, false
    ],
    [
      'PlanetScale Blog',
      'https://planetscale.com/blog/rss.xml',
      'Database scaling and MySQL internals — mostly PlanetScale product focused',
      true, false
    ],
    [
      'Timescale Blog',
      'https://blog.timescale.com/blog/rss/',
      'Time-series databases and PostgreSQL extensions — mostly Timescale product focused',
      true, false
    ],
    [
      'Percona Blog',
      'https://www.percona.com/blog/feed/',
      'MySQL and PostgreSQL performance tuning, indexing and query optimisation',
      true, false
    ],
    [
      'High Scalability',
      'https://highscalability.com/rss/',
      'Architecture breakdowns of real systems at scale — how large companies build their infra',
      true, false
    ],
    [
      'Redis Blog',
      'https://redis.io/blog/feed/',
      'Redis internals, caching patterns and data structures — Redis product focused',
      true, false
    ],
  ];
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
}

// ============================================================
// Read helpers
// ============================================================

/**
 * Returns all feed rows as an array of objects.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Object>}
 */
function getAllFeeds(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 5).getValues().map(function(row, i) {
    return {
      rowIndex:        i + 2,
      name:            String(row[FS_COL_NAME             - 1] || ''),
      url:             String(row[FS_COL_URL              - 1] || ''),
      description:     String(row[FS_COL_DESCRIPTION      - 1] || ''),
      enabled:         _isTruthy(row[FS_COL_ENABLED          - 1]),
      skipDescription: _isTruthy(row[FS_COL_SKIP_DESCRIPTION - 1]),
    };
  });
}

/**
 * Returns only enabled feeds — used by pollRssFeeds().
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Object>}
 */
function getEnabledFeeds(sheet) {
  return getAllFeeds(sheet).filter(function(f) { return f.enabled && f.url; });
}

/**
 * Normalises a sheet cell value to boolean.
 * Handles TRUE (boolean), "true"/"TRUE" (string), 1 (number).
 * @param {any} val
 * @returns {boolean}
 */
function _isTruthy(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number')  return val === 1;
  return String(val).toLowerCase() === 'true';
}

// ============================================================
// Write helpers
// ============================================================

/**
 * Sets the enabled flag for a feed row.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based
 * @param {boolean} enabled
 */
function setFeedEnabled(sheet, rowIndex, enabled) {
  sheet.getRange(rowIndex, FS_COL_ENABLED).setValue(enabled);
}

/**
 * Appends a new feed row with enabled = true.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} name
 * @param {string} url
 * @param {string} description
 * @param {boolean} skipDescription
 * @returns {number}  1-based row index of the new row
 */
function addFeedRow(sheet, name, url, description, skipDescription) {
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 5).setValues([[
    name, url, description, true, skipDescription === true
  ]]);
  return rowIndex;
}

/**
 * Deletes a feed row by its 1-based row index.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex
 */
function deleteFeedRow(sheet, rowIndex) {
  sheet.deleteRow(rowIndex);
}
