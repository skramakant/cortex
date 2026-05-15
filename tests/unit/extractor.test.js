'use strict';

/**
 * Unit tests for Extractor.gs — extractTweetId() and processExtractionRow()
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3
 *
 * Since GAS files use global scope (no exports), we load the .gs files
 * using Node's `vm` module, injecting mocked GAS globals into the context.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Paths to the GAS source files under test
const CONSTANTS_PATH = path.resolve(__dirname, '../../scripts/Constants.gs');
const SHEET_UTILS_PATH = path.resolve(__dirname, '../../scripts/SheetUtils.gs');
const EXTRACTOR_PATH = path.resolve(__dirname, '../../scripts/Extractor.gs');

const constantsCode = fs.readFileSync(CONSTANTS_PATH, 'utf8');
const sheetUtilsCode = fs.readFileSync(SHEET_UTILS_PATH, 'utf8');
const extractorCode = fs.readFileSync(EXTRACTOR_PATH, 'utf8');

/**
 * Loads Extractor.gs into a fresh vm context (no deps needed for extractTweetId).
 * Returns the context so tests can call functions defined in it.
 */
function loadExtractor() {
  const context = vm.createContext({});
  vm.runInContext(extractorCode, context);
  return context;
}

/**
 * Loads Constants.gs, SheetUtils.gs, and Extractor.gs into a shared vm context,
 * then applies the provided overrides (e.g. mocked fetchTweetData, writeCell).
 * Overrides are applied AFTER loading the GAS files so they shadow any
 * same-named globals defined in those files.
 * Returns the context so tests can call functions defined in it.
 */
function loadExtractorWithDeps(overrides = {}) {
  const context = vm.createContext({});
  vm.runInContext(constantsCode, context);
  vm.runInContext(sheetUtilsCode, context);
  vm.runInContext(extractorCode, context);
  // Apply overrides after loading so they shadow GAS-defined globals
  Object.assign(context, overrides);
  return context;
}

// ---------------------------------------------------------------------------
// extractTweetId()
// ---------------------------------------------------------------------------

describe('extractTweetId()', () => {
  let ctx;

  beforeEach(() => {
    ctx = loadExtractor();
  });

  describe('valid twitter.com URLs', () => {
    it('returns the numeric ID from a twitter.com status URL', () => {
      const result = ctx.extractTweetId('https://twitter.com/someuser/status/1234567890');
      expect(result).toBe('1234567890');
    });

    it('returns the correct ID for a different twitter.com user', () => {
      const result = ctx.extractTweetId('https://twitter.com/elonmusk/status/9876543210123456789');
      expect(result).toBe('9876543210123456789');
    });
  });

  describe('valid x.com URLs', () => {
    it('returns the numeric ID from an x.com status URL', () => {
      const result = ctx.extractTweetId('https://x.com/someuser/status/1234567890');
      expect(result).toBe('1234567890');
    });

    it('returns the correct ID for a different x.com user', () => {
      const result = ctx.extractTweetId('https://x.com/jack/status/111222333444555666');
      expect(result).toBe('111222333444555666');
    });
  });

  describe('URLs with query parameters', () => {
    it('extracts the ID from a twitter.com URL with query params', () => {
      const result = ctx.extractTweetId('https://twitter.com/user/status/1234567890?s=20&t=abc');
      expect(result).toBe('1234567890');
    });

    it('extracts the ID from an x.com URL with query params', () => {
      const result = ctx.extractTweetId('https://x.com/user/status/9999999999?ref_src=twsrc');
      expect(result).toBe('9999999999');
    });
  });

  describe('malformed or non-matching URLs', () => {
    it('returns null for a URL without /status/ segment', () => {
      const result = ctx.extractTweetId('https://twitter.com/someuser/1234567890');
      expect(result).toBeNull();
    });

    it('returns null for a completely unrelated URL', () => {
      const result = ctx.extractTweetId('https://example.com/foo/bar');
      expect(result).toBeNull();
    });

    it('returns null for a URL with a non-numeric ID', () => {
      const result = ctx.extractTweetId('https://twitter.com/user/status/not-a-number');
      expect(result).toBeNull();
    });

    it('returns null for a URL missing the host entirely', () => {
      const result = ctx.extractTweetId('/user/status/1234567890');
      expect(result).toBeNull();
    });
  });

  describe('null and empty inputs', () => {
    it('returns null for null input', () => {
      const result = ctx.extractTweetId(null);
      expect(result).toBeNull();
    });

    it('returns null for undefined input', () => {
      const result = ctx.extractTweetId(undefined);
      expect(result).toBeNull();
    });

    it('returns null for an empty string', () => {
      const result = ctx.extractTweetId('');
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// processExtractionRow()
// ---------------------------------------------------------------------------

describe('processExtractionRow()', () => {
  /**
   * Builds a vm context with mocked fetchTweetData and writeCell.
   * The writeCell mock records calls into writtenCells as "row,col" -> value.
   *
   * @param {Function} fetchTweetDataMock  replacement for fetchTweetData
   * @param {Object}   writtenCells        object to record writeCell calls
   * @returns vm context
   */
  function buildContext(fetchTweetDataMock, writtenCells) {
    const writeCellMock = (sheet, rowIndex, colIndex, value) => {
      writtenCells[`${rowIndex},${colIndex}`] = value;
    };
    // Override writeCell so SheetUtils.gs's definition is shadowed by our mock.
    // fetchTweetData lives in TwitterClient.gs (not loaded here), so we inject it.
    return loadExtractorWithDeps({
      fetchTweetData: fetchTweetDataMock,
      writeCell: writeCellMock,
      SpreadsheetApp: {} // not needed for processExtractionRow, but SheetUtils.gs references it
    });
  }

  describe('invalid tweet URL', () => {
    it('writes "error: invalid tweet URL" to col B and "error: unable to extract title" to col D', () => {
      const writtenCells = {};
      const fetchMock = jest.fn();
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 2, 'https://example.com/not-a-tweet');

      expect(writtenCells['2,2']).toBe('error: invalid tweet URL');
      expect(writtenCells['2,4']).toBe('error: unable to extract title');
      // fetchTweetData should never be called for an invalid URL
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('writes error values for a null URL', () => {
      const writtenCells = {};
      const ctx = buildContext(jest.fn(), writtenCells);

      ctx.processExtractionRow({}, 3, null);

      expect(writtenCells['3,2']).toBe('error: invalid tweet URL');
      expect(writtenCells['3,4']).toBe('error: unable to extract title');
    });
  });

  describe('API error response', () => {
    it('writes "error: HTTP 404" to col B and "error: unable to extract title" to col D', () => {
      const writtenCells = {};
      const fetchMock = jest.fn().mockReturnValue({ error: 'HTTP 404' });
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 2, 'https://twitter.com/user/status/1234567890');

      expect(writtenCells['2,2']).toBe('error: HTTP 404');
      expect(writtenCells['2,4']).toBe('error: unable to extract title');
    });

    it('propagates any error message from fetchTweetData', () => {
      const writtenCells = {};
      const fetchMock = jest.fn().mockReturnValue({ error: 'missing credentials' });
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 5, 'https://x.com/user/status/9999999999');

      expect(writtenCells['5,2']).toBe('error: missing credentials');
      expect(writtenCells['5,4']).toBe('error: unable to extract title');
    });
  });

  describe('successful fetch with media', () => {
    it('writes comma-separated media URLs to col B and tweet text to col D', () => {
      const writtenCells = {};
      const mediaUrls = [
        'https://pbs.twimg.com/media/abc.jpg',
        'https://pbs.twimg.com/media/def.jpg'
      ];
      const fetchMock = jest.fn().mockReturnValue({ text: 'Hello world tweet', mediaUrls });
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 2, 'https://twitter.com/user/status/1234567890');

      expect(writtenCells['2,2']).toBe(
        'https://pbs.twimg.com/media/abc.jpg,https://pbs.twimg.com/media/def.jpg'
      );
      expect(writtenCells['2,4']).toBe('Hello world tweet');
    });

    it('writes a single media URL (no comma) to col B', () => {
      const writtenCells = {};
      const fetchMock = jest.fn().mockReturnValue({
        text: 'Single image tweet',
        mediaUrls: ['https://pbs.twimg.com/media/single.jpg']
      });
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 4, 'https://x.com/user/status/5555555555');

      expect(writtenCells['4,2']).toBe('https://pbs.twimg.com/media/single.jpg');
      expect(writtenCells['4,4']).toBe('Single image tweet');
    });
  });

  describe('successful fetch with no media', () => {
    it('writes "none" to col B when mediaUrls is an empty array', () => {
      const writtenCells = {};
      const fetchMock = jest.fn().mockReturnValue({ text: 'Text-only tweet', mediaUrls: [] });
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 2, 'https://twitter.com/user/status/1234567890');

      expect(writtenCells['2,2']).toBe('none');
      expect(writtenCells['2,4']).toBe('Text-only tweet');
    });

    it('writes "none" to col B when mediaUrls is absent from the response', () => {
      const writtenCells = {};
      const fetchMock = jest.fn().mockReturnValue({ text: 'Another text-only tweet' });
      const ctx = buildContext(fetchMock, writtenCells);

      ctx.processExtractionRow({}, 3, 'https://x.com/user/status/7777777777');

      expect(writtenCells['3,2']).toBe('none');
      expect(writtenCells['3,4']).toBe('Another text-only tweet');
    });
  });
});

// ---------------------------------------------------------------------------
// extractResources()
// ---------------------------------------------------------------------------

describe('extractResources()', () => {
  /**
   * Builds a vm context with mocked getOrCreateTweetSheet, getAllRows,
   * and processExtractionRow so we can test extractResources() in isolation.
   *
   * @param {Function} getOrCreateTweetSheetMock
   * @param {Function} getAllRowsMock
   * @param {Function} processExtractionRowMock
   * @returns vm context
   */
  function buildExtractResourcesContext(
    getOrCreateTweetSheetMock,
    getAllRowsMock,
    processExtractionRowMock
  ) {
    return loadExtractorWithDeps({
      getOrCreateTweetSheet: getOrCreateTweetSheetMock,
      getAllRows: getAllRowsMock,
      processExtractionRow: processExtractionRowMock,
      SpreadsheetApp: {} // not needed but SheetUtils.gs references it
    });
  }

  it('calls getOrCreateTweetSheet() to obtain the sheet', () => {
    const mockSheet = {};
    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue([]);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    expect(getOrCreateTweetSheet).toHaveBeenCalledTimes(1);
  });

  it('processes a row where column A is non-empty and column B is empty', () => {
    const mockSheet = {};
    const tweetUrl = 'https://twitter.com/user/status/1234567890';
    // Row: [colA, colB, colC, colD, colE]
    const rows = [[tweetUrl, '', '', '', '']];

    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue(rows);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    // Row index is i+2 (1 for header, 1 for 1-based), so row 0 → rowIndex 2
    expect(processExtractionRow).toHaveBeenCalledTimes(1);
    expect(processExtractionRow).toHaveBeenCalledWith(mockSheet, 2, tweetUrl);
  });

  it('skips a row where column A is empty', () => {
    const mockSheet = {};
    // Row with empty col A
    const rows = [['', '', '', '', '']];

    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue(rows);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    expect(processExtractionRow).not.toHaveBeenCalled();
  });

  it('skips a row where column B is already populated (data preservation)', () => {
    const mockSheet = {};
    // Row with non-empty col A AND non-empty col B — should be skipped
    const rows = [['https://twitter.com/user/status/111', 'https://pbs.twimg.com/media/abc.jpg', '', '', '']];

    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue(rows);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    expect(processExtractionRow).not.toHaveBeenCalled();
  });

  it('processes all eligible rows when multiple rows qualify', () => {
    const mockSheet = {};
    const url1 = 'https://twitter.com/user/status/111';
    const url2 = 'https://x.com/user/status/222';
    const url3 = 'https://twitter.com/user/status/333';
    // Three rows: all have non-empty col A and empty col B
    const rows = [
      [url1, '', '', '', ''],
      [url2, '', '', '', ''],
      [url3, '', '', '', '']
    ];

    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue(rows);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    expect(processExtractionRow).toHaveBeenCalledTimes(3);
    expect(processExtractionRow).toHaveBeenCalledWith(mockSheet, 2, url1);
    expect(processExtractionRow).toHaveBeenCalledWith(mockSheet, 3, url2);
    expect(processExtractionRow).toHaveBeenCalledWith(mockSheet, 4, url3);
  });

  it('processes only eligible rows in a mixed set of rows', () => {
    const mockSheet = {};
    const eligibleUrl = 'https://twitter.com/user/status/999';
    const rows = [
      ['', '', '', '', ''],                                          // skip: empty col A
      [eligibleUrl, '', '', '', ''],                                 // process: non-empty A, empty B
      ['https://x.com/user/status/555', 'already-extracted', '', '', ''] // skip: col B populated
    ];

    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue(rows);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    expect(processExtractionRow).toHaveBeenCalledTimes(1);
    expect(processExtractionRow).toHaveBeenCalledWith(mockSheet, 3, eligibleUrl);
  });

  it('does nothing when the sheet has no data rows', () => {
    const mockSheet = {};
    const getOrCreateTweetSheet = jest.fn().mockReturnValue(mockSheet);
    const getAllRows = jest.fn().mockReturnValue([]);
    const processExtractionRow = jest.fn();

    const ctx = buildExtractResourcesContext(getOrCreateTweetSheet, getAllRows, processExtractionRow);
    ctx.extractResources();

    expect(processExtractionRow).not.toHaveBeenCalled();
  });
});
