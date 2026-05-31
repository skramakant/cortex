'use strict';

/**
 * Unit tests for Poster.gs — postTweetForRow()
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * Since GAS files use global scope (no exports), we load the .gs files
 * using Node's `vm` module, injecting mocked GAS globals into the context.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const CONSTANTS_PATH = path.resolve(__dirname, '../../scripts/Constants.gs');
const SHEET_UTILS_PATH = path.resolve(__dirname, '../../scripts/SheetUtils.gs');
const POSTER_PATH = path.resolve(__dirname, '../../scripts/Poster.gs');

const constantsCode = fs.readFileSync(CONSTANTS_PATH, 'utf8');
const sheetUtilsCode = fs.readFileSync(SHEET_UTILS_PATH, 'utf8');
const posterCode = fs.readFileSync(POSTER_PATH, 'utf8');

/**
 * Loads Constants.gs, SheetUtils.gs, and Poster.gs into a shared vm context,
 * then applies the provided overrides (e.g. mocked writeCell, postTweet).
 * Overrides are applied AFTER loading the GAS files so they shadow any
 * same-named globals defined in those files.
 * Returns the context so tests can call functions defined in it.
 */
function loadPosterWithMocks(overrides = {}) {
  const context = vm.createContext({});
  vm.runInContext(constantsCode, context);
  vm.runInContext(sheetUtilsCode, context);
  vm.runInContext(posterCode, context);
  // Apply overrides after loading so they shadow GAS-defined globals
  Object.assign(context, overrides);
  return context;
}

/**
 * Builds a vm context with mocked writeCell and postTweet.
 * writtenCells records calls as "row,col" -> value.
 * postTweetMock is a jest.fn() that callers can configure.
 */
function buildContext(postTweetMock, writtenCells) {
  const writeCellMock = (sheet, rowIndex, colIndex, value) => {
    writtenCells[`${rowIndex},${colIndex}`] = value;
  };
  return loadPosterWithMocks({
    writeCell: writeCellMock,
    postTweet: postTweetMock,
    SpreadsheetApp: {} // not needed but SheetUtils.gs references it
  });
}

// ---------------------------------------------------------------------------
// postTweetForRow()
// ---------------------------------------------------------------------------

describe('postTweetForRow()', () => {
  const mockSheet = {};
  const ROW = 2;
  const COL_STATUS = 3; // COL_STATUS constant from Constants.gs

  // -------------------------------------------------------------------------
  // Empty title — Requirement 5.3
  // -------------------------------------------------------------------------
  describe('empty title', () => {
    it('writes "error: no tweet text" to col C when title is an empty string', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn();
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, '', 'none', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('error: no tweet text');
      expect(postTweetMock).not.toHaveBeenCalled();
    });

    it('writes "error: no tweet text" to col C when title is null', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn();
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, null, 'none', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('error: no tweet text');
      expect(postTweetMock).not.toHaveBeenCalled();
    });

    it('writes "error: no tweet text" to col C when title is undefined', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn();
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, undefined, 'none', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('error: no tweet text');
      expect(postTweetMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Successful post — Requirement 5.1, 5.2
  // -------------------------------------------------------------------------
  describe('successful post', () => {
    it('writes "" (blank) to col C when maxCount is 0 (unlimited recurring)', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '123456' });
      const ctx = buildContext(postTweetMock, writtenCells);

      // maxCount=0, newPostCount=1 → unlimited → status should be cleared
      ctx.postTweetForRow(mockSheet, ROW, 'Hello world', 'none', 0, 1, '', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('');
    });

    it('writes "" (blank) to col C when maxCount is set but limit not yet reached', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '123456' });
      const ctx = buildContext(postTweetMock, writtenCells);

      // maxCount=3, newPostCount=2 → not done yet → status should be cleared
      ctx.postTweetForRow(mockSheet, ROW, 'Hello world', 'none', 3, 2, '', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('');
    });

    it('writes "sent" to col C when maxCount is reached', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '123456' });
      const ctx = buildContext(postTweetMock, writtenCells);

      // maxCount=3, newPostCount=3 → limit reached → "sent"
      ctx.postTweetForRow(mockSheet, ROW, 'Hello world', 'none', 3, 3, '', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('sent');
    });

    it('calls postTweet with the correct title', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '123456' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'My tweet text', 'none', 0, 1, '', 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledTimes(1);
      expect(postTweetMock.mock.calls[0][0]).toBe('My tweet text');
    });

    it('writes status to the correct row index', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '999' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, 5, 'Tweet at row 5', 'none', 0, 1, '');

      expect(writtenCells[`5,${COL_STATUS}`]).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // API error — Requirement 5.4
  // -------------------------------------------------------------------------
  describe('API error', () => {
    it('writes "error: {message}" to col C when postTweet returns an error', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ error: 'HTTP 403' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Hello world', 'none', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('error: HTTP 403');
    });

    it('propagates the exact error message from postTweet', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ error: 'missing credentials' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Some tweet', 'none', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).toBe('error: missing credentials');
    });

    it('does NOT write "sent" when postTweet returns an error', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ error: 'rate limit exceeded' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Some tweet', 'none', 0, 1, '');

      expect(writtenCells[`${ROW},${COL_STATUS}`]).not.toBe('sent');
    });
  });

  // -------------------------------------------------------------------------
  // "none" resource links are filtered out — Requirement 5.2
  // -------------------------------------------------------------------------
  describe('"none" resource links filtering', () => {
    it('passes an empty mediaUrls array when resourceLinks is "none"', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Text only tweet', 'none', 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Text only tweet', []);
    });

    it('filters out "none" entries from a comma-separated list', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Tweet', 'https://img.example.com/a.jpg,none', 0, 1, '');

      const mediaUrls = postTweetMock.mock.calls[0][1];
      expect(mediaUrls).not.toContain('none');
      expect(mediaUrls).toContain('https://img.example.com/a.jpg');
    });

    it('passes an empty mediaUrls array when resourceLinks is null', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Text only tweet', null, 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Text only tweet', []);
    });

    it('passes an empty mediaUrls array when resourceLinks is empty string', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Text only tweet', '', 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Text only tweet', []);
    });
  });

  // -------------------------------------------------------------------------
  // Comma-separated resource links parsing — Requirement 5.2
  // -------------------------------------------------------------------------
  describe('comma-separated resource links parsing', () => {
    it('parses a single URL into a one-element array', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Tweet', 'https://pbs.twimg.com/media/abc.jpg', 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Tweet', ['https://pbs.twimg.com/media/abc.jpg']);
    });

    it('parses two comma-separated URLs into a two-element array', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      const links = 'https://pbs.twimg.com/media/abc.jpg,https://pbs.twimg.com/media/def.jpg';
      ctx.postTweetForRow(mockSheet, ROW, 'Tweet', links, 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Tweet', [
        'https://pbs.twimg.com/media/abc.jpg',
        'https://pbs.twimg.com/media/def.jpg'
      ]);
    });

    it('trims whitespace from each URL in the comma-separated list', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      const links = '  https://pbs.twimg.com/media/abc.jpg , https://pbs.twimg.com/media/def.jpg  ';
      ctx.postTweetForRow(mockSheet, ROW, 'Tweet', links, 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Tweet', [
        'https://pbs.twimg.com/media/abc.jpg',
        'https://pbs.twimg.com/media/def.jpg'
      ]);
    });

    it('filters out empty strings resulting from trailing commas', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      ctx.postTweetForRow(mockSheet, ROW, 'Tweet', 'https://pbs.twimg.com/media/abc.jpg,', 0, 1, '');

      const mediaUrls = postTweetMock.mock.calls[0][1];
      expect(mediaUrls).toEqual(['https://pbs.twimg.com/media/abc.jpg']);
    });

    it('parses three comma-separated URLs correctly', () => {
      const writtenCells = {};
      const postTweetMock = jest.fn().mockReturnValue({ id: '1' });
      const ctx = buildContext(postTweetMock, writtenCells);

      const links = 'https://img.com/1.jpg,https://img.com/2.jpg,https://img.com/3.jpg';
      ctx.postTweetForRow(mockSheet, ROW, 'Tweet', links, 0, 1, '');

      expect(postTweetMock).toHaveBeenCalledWith('Tweet', [
        'https://img.com/1.jpg',
        'https://img.com/2.jpg',
        'https://img.com/3.jpg'
      ]);
    });
  });
});
