/**
 * FeedSheet.gs
 * Helpers for the "rss_feeds" sheet tab.
 * Stores the list of RSS/Atom sources that pollRssFeeds() reads at runtime.
 *
 * Columns (1-based):
 *   A  name               — display name shown in the UI
 *   B  url                — RSS or Atom feed URL
 *   C  description        — what this feed covers (shown in UI)
 *   D  enabled            — TRUE / FALSE
 *   E  skip_description   — TRUE / FALSE — pass title only to Groq
 *   F  max_new            — max articles to queue per run for this feed (default 1)
 *   G  fetch_full_article — TRUE / FALSE — fetch full article HTML for richer context
 *   H  tweet_length       — max characters for the generated tweet (default 280)
 *   I  prompt_style       — "short_take" | "educational" (default "short_take")
 */

var FS_COL_NAME               = 1;
var FS_COL_URL                = 2;
var FS_COL_DESCRIPTION        = 3;
var FS_COL_ENABLED            = 4;
var FS_COL_SKIP_DESCRIPTION   = 5;
var FS_COL_MAX_NEW            = 6;
var FS_COL_FETCH_FULL_ARTICLE = 7;
var FS_COL_TWEET_LENGTH       = 8;
var FS_COL_PROMPT_STYLE       = 9;

// ============================================================
// Sheet bootstrap
// ============================================================

/**
 * Returns the rss_feeds sheet, creating it with headers and default feeds
 * if it does not exist yet. Also adds missing columns to existing sheets.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateFeedSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('rss_feeds');
  if (!sheet) {
    sheet = ss.insertSheet('rss_feeds');
    sheet.getRange(1, 1, 1, 9).setValues([[
      'name', 'url', 'description', 'enabled',
      'skip description', 'max new', 'fetch full article',
      'tweet length', 'prompt style'
    ]]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(FS_COL_NAME,               160);
    sheet.setColumnWidth(FS_COL_URL,                320);
    sheet.setColumnWidth(FS_COL_DESCRIPTION,        360);
    sheet.setColumnWidth(FS_COL_ENABLED,             80);
    sheet.setColumnWidth(FS_COL_SKIP_DESCRIPTION,   120);
    sheet.setColumnWidth(FS_COL_MAX_NEW,             80);
    sheet.setColumnWidth(FS_COL_FETCH_FULL_ARTICLE, 140);
    sheet.setColumnWidth(FS_COL_TWEET_LENGTH,       100);
    sheet.setColumnWidth(FS_COL_PROMPT_STYLE,       120);
    _populateDefaultFeeds(sheet);
  } else {
    // ── Migrate existing sheet ────────────────────────────────────────────
    // Add missing column headers
    var lastCol = sheet.getLastColumn();
    var headers = [
      [FS_COL_MAX_NEW,            'max new',            80],
      [FS_COL_FETCH_FULL_ARTICLE, 'fetch full article', 140],
      [FS_COL_TWEET_LENGTH,       'tweet length',       100],
      [FS_COL_PROMPT_STYLE,       'prompt style',       120],
    ];
    headers.forEach(function(h) {
      if (lastCol < h[0]) {
        sheet.getRange(1, h[0]).setValue(h[1]);
        sheet.setColumnWidth(h[0], h[2]);
      }
    });

    // Backfill default values for existing rows that have empty new columns
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
      rows.forEach(function(row, i) {
        var rowIndex = i + 2;
        var name     = String(row[FS_COL_NAME - 1] || '').trim();
        var defaults = _getDefaultsForFeedName(name);

        // Only write if the cell is currently empty
        if (row[FS_COL_MAX_NEW - 1] === '' || row[FS_COL_MAX_NEW - 1] === null) {
          sheet.getRange(rowIndex, FS_COL_MAX_NEW).setValue(defaults.maxNew);
        }
        if (row[FS_COL_FETCH_FULL_ARTICLE - 1] === '' || row[FS_COL_FETCH_FULL_ARTICLE - 1] === null) {
          sheet.getRange(rowIndex, FS_COL_FETCH_FULL_ARTICLE).setValue(defaults.fetchFull);
        }
        if (row[FS_COL_TWEET_LENGTH - 1] === '' || row[FS_COL_TWEET_LENGTH - 1] === null) {
          sheet.getRange(rowIndex, FS_COL_TWEET_LENGTH).setValue(defaults.tweetLength);
        }
        if (row[FS_COL_PROMPT_STYLE - 1] === '' || row[FS_COL_PROMPT_STYLE - 1] === null) {
          sheet.getRange(rowIndex, FS_COL_PROMPT_STYLE).setValue(defaults.promptStyle);
        }
      });
    }
  }
  return sheet;
}

/**
 * Pre-populates the sheet with the 14 curated default feeds.
 * Each row: name, url, description, enabled, skipDesc, maxNew,
 *           fetchFull, tweetLength, promptStyle
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function _populateDefaultFeeds(sheet) {
  var S = 'short_take';
  var E = 'educational';
  var rows = [
    //  name                    url                                              description                                                                                           en     skip   max  full  len   style
    ['Hacker News',            'https://hnrss.org/best',                        'Best stories curated by the tech community — aggregates top content from across the web',           true,  true,  1,   false, 280,  S],
    ['The Verge',              'https://www.theverge.com/rss/index.xml',         'Consumer tech, big tech politics, layoffs and industry drama',                                      true,  false, 1,   false, 280,  S],
    ['TechCrunch',             'https://feeds.feedburner.com/TechCrunch',        'Startup news, funding rounds, acquisitions and layoffs',                                            true,  false, 1,   false, 280,  S],
    ['VentureBeat',            'https://venturebeat.com/feed/',                  'AI industry news, enterprise AI and tech business coverage',                                        true,  false, 1,   false, 280,  S],
    ['Pragmatic Engineer',     'https://newsletter.pragmaticengineer.com/feed',  'Engineering culture, salaries, big tech internals and system design — by Gergely Orosz',            true,  false, 1,   false, 280,  S],
    ['Martin Fowler',          'https://martinfowler.com/feed.atom',             'Software architecture, design patterns and distributed systems — by Martin Fowler',                 true,  false, 1,   true,  1500, E],
    ['All Things Distributed', 'https://www.allthingsdistributed.com/atom.xml',  'Distributed systems and cloud architecture — by Werner Vogels (AWS CTO)',                          true,  false, 1,   true,  1500, E],
    ['Marc Brooker',           'https://brooker.co.za/blog/rss.xml',             'Deep distributed systems thinking — by AWS principal engineer Marc Brooker',                        true,  false, 1,   true,  1500, E],
    ['PostgreSQL News',        'https://www.postgresql.org/news.rss',            'Official PostgreSQL release announcements and project news',                                        true,  false, 1,   false, 280,  S],
    ['PlanetScale Blog',       'https://planetscale.com/blog/rss.xml',           'Database scaling and MySQL internals — mostly PlanetScale product focused',                         true,  false, 1,   true,  1500, E],
    ['Timescale Blog',         'https://blog.timescale.com/blog/rss/',           'Time-series databases and PostgreSQL extensions — mostly Timescale product focused',                true,  false, 1,   false, 280,  S],
    ['Percona Blog',           'https://www.percona.com/blog/feed/',             'MySQL and PostgreSQL performance tuning, indexing and query optimisation',                          true,  false, 1,   true,  1500, E],
    ['High Scalability',       'https://highscalability.com/rss/',               'Architecture breakdowns of real systems at scale — how large companies build their infra',          true,  false, 1,   true,  1500, E],
    ['Redis Blog',             'https://redis.io/blog/feed/',                    'Redis internals, caching patterns and data structures — Redis product focused',                     true,  false, 1,   true,  1000, E],
  ];
  sheet.getRange(2, 1, rows.length, 9).setValues(rows);
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
  return sheet.getRange(2, 1, lastRow - 1, 9).getValues().map(function(row, i) {
    var maxNew      = parseInt(row[FS_COL_MAX_NEW      - 1], 10);
    var tweetLength = parseInt(row[FS_COL_TWEET_LENGTH - 1], 10);
    var style       = String(row[FS_COL_PROMPT_STYLE   - 1] || '').trim().toLowerCase();
    return {
      rowIndex:          i + 2,
      name:              String(row[FS_COL_NAME               - 1] || ''),
      url:               String(row[FS_COL_URL                - 1] || ''),
      description:       String(row[FS_COL_DESCRIPTION        - 1] || ''),
      enabled:           _isTruthy(row[FS_COL_ENABLED            - 1]),
      skipDescription:   _isTruthy(row[FS_COL_SKIP_DESCRIPTION   - 1]),
      maxNew:            (!isNaN(maxNew)      && maxNew      >= 1)   ? maxNew      : 1,
      fetchFullArticle:  _isTruthy(row[FS_COL_FETCH_FULL_ARTICLE - 1]),
      tweetLength:       (!isNaN(tweetLength) && tweetLength >= 100) ? tweetLength : 280,
      promptStyle:       (style === 'educational') ? 'educational' : 'short_take',
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
 * @param {any} val
 * @returns {boolean}
 */
function _isTruthy(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number')  return val === 1;
  return String(val).toLowerCase() === 'true';
}

/**
 * Returns sensible default config values for a feed based on its name.
 * Used when migrating existing rows to the new schema.
 * @param {string} name
 * @returns {{ maxNew: number, fetchFull: boolean, tweetLength: number, promptStyle: string }}
 */
function _getDefaultsForFeedName(name) {
  var educational = [
    'martin fowler', 'all things distributed', 'marc brooker',
    'planetscale blog', 'percona blog', 'high scalability', 'redis blog'
  ];
  var nameLower = name.toLowerCase();
  var isEducational = educational.some(function(n) {
    return nameLower.indexOf(n) !== -1;
  });

  if (isEducational) {
    return {
      maxNew:       1,
      fetchFull:    true,
      tweetLength:  nameLower.indexOf('redis') !== -1 ? 1000 : 1500,
      promptStyle:  'educational'
    };
  }
  return { maxNew: 1, fetchFull: false, tweetLength: 280, promptStyle: 'short_take' };
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
 * Appends a new feed row with enabled = true and sensible defaults.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string}  name
 * @param {string}  url
 * @param {string}  description
 * @param {boolean} skipDescription
 * @returns {number}  1-based row index of the new row
 */
function addFeedRow(sheet, name, url, description, skipDescription) {
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 9).setValues([[
    name, url, description, true, skipDescription === true,
    1, false, 280, 'short_take'
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
