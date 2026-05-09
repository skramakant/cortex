'use strict';

/**
 * Unit tests for WebApp.gs and WebApp.html
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 *
 * Since GAS files use global scope (no exports), we load the .gs files
 * using Node's `vm` module, injecting mocked GAS globals into the context.
 * parseCronExpression is loaded from Scheduler.gs (pure function, no side effects).
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const { createMockSheet } = require('../gasGlobals.js');

// ---- Paths ----
const CONSTANTS_PATH  = path.resolve(__dirname, '../../Constants.gs');
const SCHEDULER_PATH  = path.resolve(__dirname, '../../Scheduler.gs');
const WEBAPP_PATH     = path.resolve(__dirname, '../../WebApp.gs');
const WEBAPP_HTML     = path.resolve(__dirname, '../../Index.html');

const constantsCode  = fs.readFileSync(CONSTANTS_PATH,  'utf8');
const schedulerCode  = fs.readFileSync(SCHEDULER_PATH,  'utf8');
const webAppCode     = fs.readFileSync(WEBAPP_PATH,     'utf8');
const webAppHtml     = fs.readFileSync(WEBAPP_HTML,     'utf8');

// ---------------------------------------------------------------------------
// Helper: build a vm context with all required globals
// ---------------------------------------------------------------------------

/**
 * Loads Constants.gs, Scheduler.gs (for parseCronExpression), and WebApp.gs
 * into a shared vm context, then applies the provided overrides.
 *
 * @param {Object} overrides  - mock functions / values to inject into the context
 * @returns {Object} vm context
 */
function loadWebApp(overrides = {}) {
  const context = vm.createContext({});
  vm.runInContext(constantsCode,  context);
  vm.runInContext(schedulerCode,  context);
  vm.runInContext(webAppCode,     context);
  // Apply overrides AFTER loading so they shadow any GAS-defined globals
  Object.assign(context, overrides);
  return context;
}

/**
 * Creates a mock sheet that tracks setValue calls so getValue returns
 * what was written.  Extends the createMockSheet pattern with a getValue()
 * method on the range object (gasGlobals.js only has getValues/setValues/setValue).
 *
 * @param {number} lastRow  - value returned by getLastRow() (default 1)
 * @returns {Object} mock sheet
 */
function createTrackingSheet(lastRow = 1) {
  const data = [];

  return {
    _data: data,
    getLastRow() {
      return lastRow;
    },
    getRange(row, col) {
      return {
        getValue() {
          const rowData = data[row - 1];
          return (rowData && rowData[col - 1] !== undefined) ? rowData[col - 1] : '';
        },
        setValue(value) {
          if (!data[row - 1]) data[row - 1] = [];
          data[row - 1][col - 1] = value;
        },
        getValues() {
          return [[(data[row - 1] && data[row - 1][col - 1] !== undefined)
            ? data[row - 1][col - 1] : '']];
        }
      };
    },
    getName() { return 'tweet'; }
  };
}

/**
 * Builds a standard set of overrides for handleFormSubmit tests.
 *
 * @param {Object} opts
 * @param {Object}   opts.sheet                  - mock sheet (default: createTrackingSheet())
 * @param {Function} opts.processExtractionRow   - mock for processExtractionRow
 * @param {Function} opts.postTweetForRow        - mock for postTweetForRow
 * @returns {Object} overrides object
 */
function buildOverrides({
  sheet = createTrackingSheet(),
  processExtractionRow = () => {},
  postTweetForRow = () => {}
} = {}) {
  return {
    getOrCreateTweetSheet: () => sheet,
    writeCell: (s, row, col, value) => {
      s.getRange(row, col).setValue(value);
    },
    processExtractionRow,
    postTweetForRow,
    HtmlService: {
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle: jest.fn().mockReturnThis()
        })
      })
    },
    ContentService: {
      createTextOutput: jest.fn().mockReturnValue({
        setMimeType: jest.fn().mockReturnThis()
      }),
      MimeType: { JSON: 'application/json' }
    }
  };
}

// ===========================================================================
// _validateTweetLink()
// ===========================================================================

describe('_validateTweetLink()', () => {
  let ctx;

  beforeEach(() => {
    ctx = loadWebApp(buildOverrides());
  });

  it('returns null for a valid twitter.com URL', () => {
    expect(ctx._validateTweetLink('https://twitter.com/user/status/1234567890')).toBeNull();
  });

  it('returns null for a valid x.com URL', () => {
    expect(ctx._validateTweetLink('https://x.com/user/status/9876543210')).toBeNull();
  });

  it('returns "Tweet link is required." for an empty string', () => {
    expect(ctx._validateTweetLink('')).toBe('Tweet link is required.');
  });

  it('returns "Tweet link is required." for a whitespace-only string', () => {
    expect(ctx._validateTweetLink('   ')).toBe('Tweet link is required.');
  });

  it('returns a URL error message for a non-matching URL', () => {
    const result = ctx._validateTweetLink('https://example.com/not-a-tweet');
    expect(result).toMatch(/valid twitter\.com or x\.com/);
  });
});

// ===========================================================================
// handleFormSubmit() — validation
// ===========================================================================

describe('handleFormSubmit() — validation', () => {
  let ctx;

  beforeEach(() => {
    ctx = loadWebApp(buildOverrides());
  });

  it('returns { success: false, error: "Tweet link is required." } for empty tweet link', () => {
    const result = ctx.handleFormSubmit({ tweetLink: '', scheduleMode: 'now' });
    expect(result).toEqual({ success: false, error: 'Tweet link is required.' });
  });

  it('returns { success: false, error containing "valid twitter.com or x.com" } for invalid tweet link', () => {
    const result = ctx.handleFormSubmit({
      tweetLink: 'https://example.com/not-a-tweet',
      scheduleMode: 'now'
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid twitter\.com or x\.com/);
  });

  it('returns { success: false, error: "Cron expression is required." } for cron mode with empty cron', () => {
    const result = ctx.handleFormSubmit({
      tweetLink: 'https://twitter.com/user/status/1234567890',
      scheduleMode: 'cron',
      cronExpression: ''
    });
    expect(result).toEqual({ success: false, error: 'Cron expression is required.' });
  });

  it('returns { success: false, error containing "invalid" } for cron mode with invalid cron', () => {
    const result = ctx.handleFormSubmit({
      tweetLink: 'https://twitter.com/user/status/1234567890',
      scheduleMode: 'cron',
      cronExpression: 'not-a-cron'
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });
});

// ===========================================================================
// handleFormSubmit() — Send Now flow
// ===========================================================================

describe('handleFormSubmit() — Send Now flow', () => {
  const VALID_URL = 'https://twitter.com/user/status/1234567890';

  it('returns { success: true, message: "Tweet sent successfully." } when extraction and post succeed', () => {
    const sheet = createTrackingSheet(1);

    // processExtractionRow writes "none" to col B (resource links) and title to col D
    const processExtractionRow = (_sheet, rowIndex, _url) => {
      _sheet.getRange(rowIndex, 2).setValue('none');   // COL_RESOURCE_LINKS
      _sheet.getRange(rowIndex, 4).setValue('My title'); // COL_TITLE
    };

    // postTweetForRow writes "sent" to col C (status)
    const postTweetForRow = (_sheet, rowIndex, _title, _resourceLinks) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');   // COL_STATUS
    };

    const ctx = loadWebApp(buildOverrides({ sheet, processExtractionRow, postTweetForRow }));
    const result = ctx.handleFormSubmit({ tweetLink: VALID_URL, scheduleMode: 'now' });

    expect(result).toEqual({ success: true, message: 'Tweet sent successfully.' });
  });

  it('returns { success: false, error: "error: bad url" } when extraction writes error to col B', () => {
    const sheet = createTrackingSheet(1);

    const processExtractionRow = (_sheet, rowIndex, _url) => {
      _sheet.getRange(rowIndex, 2).setValue('error: bad url'); // COL_RESOURCE_LINKS
    };

    const postTweetForRow = jest.fn();

    const ctx = loadWebApp(buildOverrides({ sheet, processExtractionRow, postTweetForRow }));
    const result = ctx.handleFormSubmit({ tweetLink: VALID_URL, scheduleMode: 'now' });

    expect(result).toEqual({ success: false, error: 'error: bad url' });
    // postTweetForRow should NOT be called when extraction fails
    expect(postTweetForRow).not.toHaveBeenCalled();
  });

  it('returns { success: false, error: "error: HTTP 403" } when post writes error to col C', () => {
    const sheet = createTrackingSheet(1);

    const processExtractionRow = (_sheet, rowIndex, _url) => {
      _sheet.getRange(rowIndex, 2).setValue('none');
      _sheet.getRange(rowIndex, 4).setValue('My title');
    };

    const postTweetForRow = (_sheet, rowIndex, _title, _resourceLinks) => {
      _sheet.getRange(rowIndex, 3).setValue('error: HTTP 403'); // COL_STATUS
    };

    const ctx = loadWebApp(buildOverrides({ sheet, processExtractionRow, postTweetForRow }));
    const result = ctx.handleFormSubmit({ tweetLink: VALID_URL, scheduleMode: 'now' });

    expect(result).toEqual({ success: false, error: 'error: HTTP 403' });
  });
});

// ===========================================================================
// handleFormSubmit() — Cron flow
// ===========================================================================

describe('handleFormSubmit() — Cron flow', () => {
  const VALID_URL  = 'https://twitter.com/user/status/1234567890';
  const VALID_CRON = '0 9 * * 1';

  it('returns { success: true, message: "Tweet scheduled successfully." } for valid cron', () => {
    const ctx = loadWebApp(buildOverrides());
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      scheduleMode: 'cron',
      cronExpression: VALID_CRON
    });
    expect(result).toEqual({ success: true, message: 'Tweet scheduled successfully.' });
  });

  it('cron success message contains "scheduled"', () => {
    const ctx = loadWebApp(buildOverrides());
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      scheduleMode: 'cron',
      cronExpression: VALID_CRON
    });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/scheduled/i);
  });

  it('Send Now success message contains "sent"', () => {
    const sheet = createTrackingSheet(1);

    const processExtractionRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 2).setValue('none');
      _sheet.getRange(rowIndex, 4).setValue('title');
    };
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };

    const ctx = loadWebApp(buildOverrides({ sheet, processExtractionRow, postTweetForRow }));
    const result = ctx.handleFormSubmit({ tweetLink: VALID_URL, scheduleMode: 'now' });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/sent/i);
  });

  it('Send Now and Cron success messages are different strings', () => {
    // Cron message
    const ctxCron = loadWebApp(buildOverrides());
    const cronResult = ctxCron.handleFormSubmit({
      tweetLink: VALID_URL,
      scheduleMode: 'cron',
      cronExpression: VALID_CRON
    });

    // Send Now message
    const sheet = createTrackingSheet(1);
    const processExtractionRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 2).setValue('none');
      _sheet.getRange(rowIndex, 4).setValue('title');
    };
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };
    const ctxNow = loadWebApp(buildOverrides({ sheet, processExtractionRow, postTweetForRow }));
    const nowResult = ctxNow.handleFormSubmit({ tweetLink: VALID_URL, scheduleMode: 'now' });

    expect(cronResult.message).not.toBe(nowResult.message);
  });
});

// ===========================================================================
// doPost()
// ===========================================================================

describe('doPost()', () => {
  it('reads tweetLink, scheduleMode, cronExpression from e.parameter and returns ContentService output', () => {
    const sheet = createTrackingSheet(1);
    const processExtractionRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 2).setValue('none');
      _sheet.getRange(rowIndex, 4).setValue('title');
    };
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };

    const mockTextOutput = { setMimeType: jest.fn().mockReturnThis() };
    const createTextOutput = jest.fn().mockReturnValue(mockTextOutput);

    const overrides = buildOverrides({ sheet, processExtractionRow, postTweetForRow });
    overrides.ContentService = {
      createTextOutput,
      MimeType: { JSON: 'application/json' }
    };

    const ctx = loadWebApp(overrides);

    const e = {
      parameter: {
        tweetLink:      'https://twitter.com/user/status/1234567890',
        scheduleMode:   'now',
        cronExpression: ''
      }
    };

    const result = ctx.doPost(e);

    // ContentService.createTextOutput should have been called with a JSON string
    expect(createTextOutput).toHaveBeenCalledTimes(1);
    const jsonArg = createTextOutput.mock.calls[0][0];
    const parsed = JSON.parse(jsonArg);
    expect(parsed).toHaveProperty('success');

    // The return value is the mock text output
    expect(result).toBe(mockTextOutput);
  });
});

// ===========================================================================
// doGet()
// ===========================================================================

describe('doGet()', () => {
  it('returns an object with setTitle called with "Tweet Scheduler"', () => {
    const setTitle = jest.fn().mockReturnThis();
    const evaluate = jest.fn().mockReturnValue({ setTitle });
    const createTemplateFromFile = jest.fn().mockReturnValue({ evaluate });

    const overrides = buildOverrides();
    overrides.HtmlService = { createTemplateFromFile };

    const ctx = loadWebApp(overrides);
    const result = ctx.doGet({});

    expect(createTemplateFromFile).toHaveBeenCalledWith('Index');
    expect(evaluate).toHaveBeenCalled();
    expect(setTitle).toHaveBeenCalledWith('Tweet Scheduler');
  });
});

// ===========================================================================
// WebApp.html — structure tests
// ===========================================================================

describe('WebApp.html structure', () => {
  it('contains an input with name="tweetLink"', () => {
    expect(webAppHtml).toMatch(/name="tweetLink"/);
  });

  it('contains a radio input with name="scheduleMode" and value="now"', () => {
    expect(webAppHtml).toMatch(/name="scheduleMode"[^>]*value="now"|value="now"[^>]*name="scheduleMode"/);
  });

  it('contains a radio input with name="scheduleMode" and value="cron"', () => {
    expect(webAppHtml).toMatch(/name="scheduleMode"[^>]*value="cron"|value="cron"[^>]*name="scheduleMode"/);
  });

  it('the "now" radio has the "checked" attribute', () => {
    // Find the radio with value="now" and confirm "checked" appears on the same input tag
    const nowRadioMatch = webAppHtml.match(/<input[^>]*value="now"[^>]*>/);
    expect(nowRadioMatch).not.toBeNull();
    expect(nowRadioMatch[0]).toMatch(/checked/);
  });

  it('contains an input with name="cronExpression"', () => {
    expect(webAppHtml).toMatch(/name="cronExpression"/);
  });

  it('contains an element with id="feedback"', () => {
    expect(webAppHtml).toMatch(/id="feedback"/);
  });

  it('contains an element with id="cronGroup"', () => {
    expect(webAppHtml).toMatch(/id="cronGroup"/);
  });
});
