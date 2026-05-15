/**
 * SheetUtils.gs
 * Utilities for locating or creating the "tweet" sheet and reading/writing cell data.
 */

/**
 * Returns the "tweet" sheet, creating it with headers if it doesn't exist.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateTweetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('tweet');
  if (!sheet) {
    sheet = ss.insertSheet('tweet');
    sheet.getRange(1, 1, 1, 7).setValues([[
      'tweet link',
      'resource links',
      'status',
      'title',
      'cron expression',
      'max count',
      'post count'
    ]]);
  }
  return sheet;
}

/**
 * Returns all data rows (excluding header row 1) as a 2D array.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Array<any>>}
 */
function getAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  return sheet.getRange(2, 1, lastRow - 1, 7).getValues();
}

/**
 * Writes a value to a specific cell.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based row number
 * @param {number} colIndex  1-based column number
 * @param {string|number} value
 */
function writeCell(sheet, rowIndex, colIndex, value) {
  sheet.getRange(rowIndex, colIndex).setValue(value);
}
