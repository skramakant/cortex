'use strict';

/**
 * Unit tests for SheetUtils.gs — getOrCreateTweetSheet()
 *
 * Since GAS files use global scope (no exports), we load the .gs file
 * using Node's `vm` module, injecting mocked GAS globals into the context.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const {
  createMockSpreadsheetApp,
  createMockSheet,
} = require('../gasGlobals');

// Path to the GAS source file under test
const SHEET_UTILS_PATH = path.resolve(__dirname, '../../SheetUtils.gs');
const sheetUtilsCode = fs.readFileSync(SHEET_UTILS_PATH, 'utf8');

/**
 * Loads SheetUtils.gs into a fresh vm context with the provided GAS globals.
 * Returns the context so tests can call functions defined in it.
 */
function loadSheetUtils(gasGlobals) {
  const context = vm.createContext({ ...gasGlobals });
  vm.runInContext(sheetUtilsCode, context);
  return context;
}

// ---- Expected headers ----
const EXPECTED_HEADERS = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];

describe('getOrCreateTweetSheet()', () => {
  describe('when a "tweet" sheet already exists', () => {
    it('returns the existing sheet without creating a new one', () => {
      const existingSheet = createMockSheet([EXPECTED_HEADERS]);
      const SpreadsheetApp = createMockSpreadsheetApp(existingSheet);

      // Spy: track insertSheet calls
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const insertSheetSpy = jest.spyOn(ss, 'insertSheet');

      // Rebuild SpreadsheetApp so getActiveSpreadsheet returns the spied-on ss
      const mockApp = {
        getActiveSpreadsheet: () => ss,
      };

      const ctx = loadSheetUtils({ SpreadsheetApp: mockApp });
      const result = ctx.getOrCreateTweetSheet();

      expect(result).toBe(existingSheet);
      expect(insertSheetSpy).not.toHaveBeenCalled();
    });

    it('returns the sheet with the name "tweet"', () => {
      const existingSheet = createMockSheet([EXPECTED_HEADERS]);
      const SpreadsheetApp = createMockSpreadsheetApp(existingSheet);

      const ctx = loadSheetUtils({ SpreadsheetApp });
      const result = ctx.getOrCreateTweetSheet();

      expect(result.getName()).toBe('tweet');
    });
  });

  describe('when no "tweet" sheet exists', () => {
    it('creates a new sheet named "tweet"', () => {
      // Pass no existing sheet so getSheetByName returns null
      const SpreadsheetApp = createMockSpreadsheetApp(null);

      const ctx = loadSheetUtils({ SpreadsheetApp });
      const result = ctx.getOrCreateTweetSheet();

      expect(result).not.toBeNull();
      expect(result.getName()).toBe('tweet');
    });

    it('writes the correct headers in row 1', () => {
      const SpreadsheetApp = createMockSpreadsheetApp(null);

      const ctx = loadSheetUtils({ SpreadsheetApp });
      const sheet = ctx.getOrCreateTweetSheet();

      // Row 1 is index 0 in _data
      const headerRow = sheet._data[0];
      expect(headerRow).toEqual(EXPECTED_HEADERS);
    });

    it('writes headers across exactly 5 columns (A–E)', () => {
      const SpreadsheetApp = createMockSpreadsheetApp(null);

      const ctx = loadSheetUtils({ SpreadsheetApp });
      const sheet = ctx.getOrCreateTweetSheet();

      expect(sheet._data[0]).toHaveLength(5);
    });

    it('returns the newly created sheet object', () => {
      const SpreadsheetApp = createMockSpreadsheetApp(null);

      const ctx = loadSheetUtils({ SpreadsheetApp });
      const result = ctx.getOrCreateTweetSheet();

      // Should be a sheet-like object with getRange, getLastRow, getName
      expect(typeof result.getRange).toBe('function');
      expect(typeof result.getLastRow).toBe('function');
      expect(typeof result.getName).toBe('function');
    });
  });
});

describe('getAllRows()', () => {
  describe('when the sheet has no rows at all', () => {
    it('returns an empty array when the sheet is completely empty', () => {
      // createMockSheet with no rows → getLastRow() returns 0
      const sheet = createMockSheet([]);
      const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });
      expect(ctx.getAllRows(sheet)).toEqual([]);
    });
  });

  describe('when the sheet has only a header row', () => {
    it('returns an empty array when only row 1 (header) exists', () => {
      // One row = header only; lastRow is 1, which is < 2
      const sheet = createMockSheet([['tweet link', 'resource links', 'status', 'title', 'cron expression']]);
      const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });
      expect(ctx.getAllRows(sheet)).toEqual([]);
    });
  });

  describe('when the sheet has data rows', () => {
    it('returns a single data row when there is one row after the header', () => {
      const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
      const dataRow = ['https://x.com/1', 'https://img.com/a.jpg', '', 'Hello', '* * * * *'];
      const sheet = createMockSheet([header, dataRow]);
      const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });
      expect(ctx.getAllRows(sheet)).toEqual([dataRow]);
    });

    it('returns all data rows when there are multiple rows after the header', () => {
      const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
      const row1 = ['https://x.com/1', 'https://img.com/a.jpg', '', 'Hello', '* * * * *'];
      const row2 = ['https://x.com/2', 'none', 'sent', 'World', '0 9 * * 1'];
      const row3 = ['https://x.com/3', '', '', '', ''];
      const sheet = createMockSheet([header, row1, row2, row3]);
      const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });
      expect(ctx.getAllRows(sheet)).toEqual([row1, row2, row3]);
    });

    it('does not include the header row in the result', () => {
      const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
      const dataRow = ['https://x.com/1', '', '', '', ''];
      const sheet = createMockSheet([header, dataRow]);
      const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });
      const rows = ctx.getAllRows(sheet);
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toEqual(header);
    });
  });
});

describe('writeCell()', () => {
  it('writes a string value to the specified 1-based row and column', () => {
    const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
    const dataRow = ['https://x.com/1', '', '', '', ''];
    const sheet = createMockSheet([header, dataRow]);
    const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });

    ctx.writeCell(sheet, 2, 3, 'sent');

    expect(sheet._data[1][2]).toBe('sent');
  });

  it('writes a numeric value to the specified cell', () => {
    const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
    const dataRow = ['https://x.com/1', '', '', '', ''];
    const sheet = createMockSheet([header, dataRow]);
    const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });

    ctx.writeCell(sheet, 2, 1, 42);

    expect(sheet._data[1][0]).toBe(42);
  });

  it('overwrites an existing value in the cell', () => {
    const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
    const dataRow = ['https://x.com/1', 'old-value', '', '', ''];
    const sheet = createMockSheet([header, dataRow]);
    const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });

    ctx.writeCell(sheet, 2, 2, 'new-value');

    expect(sheet._data[1][1]).toBe('new-value');
  });

  it('writes to the header row when rowIndex is 1', () => {
    const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
    const sheet = createMockSheet([header]);
    const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });

    ctx.writeCell(sheet, 1, 1, 'updated header');

    expect(sheet._data[0][0]).toBe('updated header');
  });

  it('writes to column 5 (cron expression column)', () => {
    const header = ['tweet link', 'resource links', 'status', 'title', 'cron expression'];
    const dataRow = ['https://x.com/1', '', '', '', ''];
    const sheet = createMockSheet([header, dataRow]);
    const ctx = loadSheetUtils({ SpreadsheetApp: createMockSpreadsheetApp(sheet) });

    ctx.writeCell(sheet, 2, 5, '0 9 * * 1');

    expect(sheet._data[1][4]).toBe('0 9 * * 1');
  });
});
