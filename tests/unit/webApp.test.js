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
const CONSTANTS_PATH  = path.resolve(__dirname, '../../scripts/Constants.gs');
const SCHEDULER_PATH  = path.resolve(__dirname, '../../scripts/Scheduler.gs');
const WEBAPP_PATH     = path.resolve(__dirname, '../../scripts/WebApp.gs');
const WEBAPP_HTML     = path.resolve(__dirname, '../../frontend/public/index.html');

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
 * @param {string}   opts.apiKey                 - API key stored in Script Properties (default: 'test-api-key')
 * @returns {Object} overrides object
 */
function buildOverrides({
  sheet = createTrackingSheet(),
  processExtractionRow = () => {},
  postTweetForRow = () => {},
  apiKey = 'test-api-key'
} = {}) {
  return {
    getOrCreateTweetSheet: () => sheet,
    writeCell: (s, row, col, value) => {
      s.getRange(row, col).setValue(value);
    },
    processExtractionRow,
    postTweetForRow,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => key === 'API_KEY' ? apiKey : null
      })
    },
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
      title: 'Some tweet text',
      scheduleMode: 'cron',
      cronExpression: ''
    });
    expect(result).toEqual({ success: false, error: 'Cron expression is required.' });
  });

  it('returns { success: false, error containing "invalid" } for cron mode with invalid cron', () => {
    const result = ctx.handleFormSubmit({
      tweetLink: 'https://twitter.com/user/status/1234567890',
      title: 'Some tweet text',
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

  it('returns { success: true, message: "Tweet sent successfully." } when post succeeds', () => {
    const sheet = createTrackingSheet(1);

    // postTweetForRow writes "sent" to col C (status)
    const postTweetForRow = (_sheet, rowIndex, _title, _resourceLinks) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');   // COL_STATUS
    };

    const ctx = loadWebApp(buildOverrides({ sheet, postTweetForRow }));
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      title: 'My tweet text',
      scheduleMode: 'now'
    });

    expect(result).toEqual({ success: true, message: 'Tweet sent successfully.' });
  });

  it('returns { success: false, error: "error: HTTP 403" } when post writes error to col C', () => {
    const sheet = createTrackingSheet(1);

    const postTweetForRow = (_sheet, rowIndex, _title, _resourceLinks) => {
      _sheet.getRange(rowIndex, 3).setValue('error: HTTP 403'); // COL_STATUS
    };

    const ctx = loadWebApp(buildOverrides({ sheet, postTweetForRow }));
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      title: 'My tweet text',
      scheduleMode: 'now'
    });

    expect(result).toEqual({ success: false, error: 'error: HTTP 403' });
  });

  it('returns { success: false, error: "Tweet text is required." } when title is empty', () => {
    const ctx = loadWebApp(buildOverrides());
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      title: '',
      scheduleMode: 'now'
    });
    expect(result).toEqual({ success: false, error: 'Tweet text is required.' });
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
      title: 'My tweet text',
      scheduleMode: 'cron',
      cronExpression: VALID_CRON
    });
    expect(result).toEqual({ success: true, message: 'Tweet scheduled successfully.' });
  });

  it('cron success message contains "scheduled"', () => {
    const ctx = loadWebApp(buildOverrides());
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      title: 'My tweet text',
      scheduleMode: 'cron',
      cronExpression: VALID_CRON
    });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/scheduled/i);
  });

  it('Send Now success message contains "sent"', () => {
    const sheet = createTrackingSheet(1);
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };

    const ctx = loadWebApp(buildOverrides({ sheet, postTweetForRow }));
    const result = ctx.handleFormSubmit({
      tweetLink: VALID_URL,
      title: 'My tweet text',
      scheduleMode: 'now'
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/sent/i);
  });

  it('Send Now and Cron success messages are different strings', () => {
    // Cron message
    const ctxCron = loadWebApp(buildOverrides());
    const cronResult = ctxCron.handleFormSubmit({
      tweetLink: VALID_URL,
      title: 'My tweet text',
      scheduleMode: 'cron',
      cronExpression: VALID_CRON
    });

    // Send Now message
    const sheet = createTrackingSheet(1);
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };
    const ctxNow = loadWebApp(buildOverrides({ sheet, postTweetForRow }));
    const nowResult = ctxNow.handleFormSubmit({
      tweetLink: VALID_URL,
      title: 'My tweet text',
      scheduleMode: 'now'
    });

    expect(cronResult.message).not.toBe(nowResult.message);
  });
});

// ===========================================================================
// doPost() — API key validation
// ===========================================================================

describe('doPost() — API key validation', () => {
  function makeContentService() {
    const mockTextOutput = { setMimeType: jest.fn().mockReturnThis() };
    const createTextOutput = jest.fn().mockReturnValue(mockTextOutput);
    return { createTextOutput, mockTextOutput };
  }

  it('returns { success: false, error: "Unauthorized." } when apiKey is missing from body', () => {
    const { createTextOutput } = makeContentService();
    const overrides = buildOverrides({ apiKey: 'secret-key' });
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);
    const e = { postData: { contents: JSON.stringify({ action: 'submitTweet' }) } }; // no apiKey
    ctx.doPost(e);

    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Unauthorized.');
  });

  it('returns { success: false, error: "Unauthorized." } when apiKey is wrong', () => {
    const { createTextOutput } = makeContentService();
    const overrides = buildOverrides({ apiKey: 'secret-key' });
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);
    const e = { postData: { contents: JSON.stringify({ action: 'submitTweet', apiKey: 'wrong-key' }) } };
    ctx.doPost(e);

    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Unauthorized.');
  });

  it('returns { success: false, error } for server misconfiguration when API_KEY not set in properties', () => {
    const { createTextOutput } = makeContentService();
    const overrides = buildOverrides({ apiKey: null }); // null = not set in properties
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);
    const e = { postData: { contents: JSON.stringify({ action: 'submitTweet', apiKey: 'any-key' }) } };
    ctx.doPost(e);

    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/misconfiguration/i);
  });

  it('proceeds normally when apiKey matches', () => {
    const { createTextOutput } = makeContentService();
    const sheet = createTrackingSheet(1);
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };
    const overrides = buildOverrides({ sheet, postTweetForRow, apiKey: 'secret-key' });
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);
    const e = {
      postData: {
        contents: JSON.stringify({
          action: 'submitTweet',
          apiKey: 'secret-key',
          tweetLink: 'https://twitter.com/user/status/1234567890',
          title: 'Hello world',
          scheduleMode: 'now',
        })
      }
    };
    ctx.doPost(e);

    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed.success).toBe(true);
  });
});

// ===========================================================================
// doPost() — routing
// ===========================================================================

describe('doPost() — routing', () => {
  const VALID_KEY = 'test-api-key';

  it('parses JSON body from e.postData.contents and returns ContentService JSON output', () => {
    const sheet = createTrackingSheet(1);
    const postTweetForRow = (_sheet, rowIndex) => {
      _sheet.getRange(rowIndex, 3).setValue('sent');
    };

    const mockTextOutput = { setMimeType: jest.fn().mockReturnThis() };
    const createTextOutput = jest.fn().mockReturnValue(mockTextOutput);

    const overrides = buildOverrides({ sheet, postTweetForRow });
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);

    const e = {
      postData: {
        contents: JSON.stringify({
          action:      'submitTweet',
          apiKey:      VALID_KEY,
          tweetLink:   'https://twitter.com/user/status/1234567890',
          title:       'Hello world',
          scheduleMode: 'now',
        })
      }
    };
    const result = ctx.doPost(e);

    expect(createTextOutput).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed).toHaveProperty('success');
    expect(result).toBe(mockTextOutput);
  });

  it('routes action=fetchPreview to fetchTweetPreview', () => {
    const mockTextOutput = { setMimeType: jest.fn().mockReturnThis() };
    const createTextOutput = jest.fn().mockReturnValue(mockTextOutput);

    const overrides = buildOverrides();
    overrides.extractTweetId = () => '123';
    overrides.fetchTweetData = () => ({ text: 'hi', mediaUrls: [] });
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);
    const e = {
      postData: {
        contents: JSON.stringify({
          action: 'fetchPreview',
          apiKey: VALID_KEY,
          tweetUrl: 'https://x.com/u/status/123'
        })
      }
    };
    ctx.doPost(e);

    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed).toHaveProperty('success');
  });

  it('returns { success: false, error } for unknown action', () => {
    const mockTextOutput = { setMimeType: jest.fn().mockReturnThis() };
    const createTextOutput = jest.fn().mockReturnValue(mockTextOutput);

    const overrides = buildOverrides();
    overrides.ContentService = { createTextOutput, MimeType: { JSON: 'application/json' } };

    const ctx = loadWebApp(overrides);
    const e = {
      postData: {
        contents: JSON.stringify({ action: 'unknownAction', apiKey: VALID_KEY })
      }
    };
    ctx.doPost(e);

    const parsed = JSON.parse(createTextOutput.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/unknown action/i);
  });
});

// ===========================================================================
// doGet() — removed in new architecture (frontend is on GitHub Pages)
// Replaced with a note test confirming doGet is not defined
// ===========================================================================

describe('doGet() — not present in new architecture', () => {
  it('doGet is not defined (frontend served by GitHub Pages, not GAS)', () => {
    const ctx = loadWebApp(buildOverrides());
    // doGet was removed — the frontend is now a static site on GitHub Pages
    expect(typeof ctx.doGet).toBe('undefined');
  });
});

// ===========================================================================
// WebApp.html — structure tests
// ===========================================================================

describe('WebApp.html structure', () => {
  it('contains a tweet link input (id="cloneTweetLink")', () => {
    expect(webAppHtml).toMatch(/id="cloneTweetLink"/);
  });

  it('contains a radio input for clone tab with value="now"', () => {
    expect(webAppHtml).toMatch(/name="cloneSchedule"[^>]*value="now"|value="now"[^>]*name="cloneSchedule"/);
  });

  it('contains a radio input for clone tab with value="cron"', () => {
    expect(webAppHtml).toMatch(/name="cloneSchedule"[^>]*value="cron"|value="cron"[^>]*name="cloneSchedule"/);
  });

  it('the clone "now" radio has the "checked" attribute', () => {
    // Find the radio with name="cloneSchedule" and value="now" and confirm "checked" appears
    const nowRadioMatch = webAppHtml.match(/<input[^>]*name="cloneSchedule"[^>]*value="now"[^>]*>|<input[^>]*value="now"[^>]*name="cloneSchedule"[^>]*>/);
    expect(nowRadioMatch).not.toBeNull();
    expect(nowRadioMatch[0]).toMatch(/checked/);
  });

  it('contains a cron expression input (id="cloneCron")', () => {
    expect(webAppHtml).toMatch(/id="cloneCron"/);
  });

  it('contains a feedback element for the clone tab (id="cloneFeedback")', () => {
    expect(webAppHtml).toMatch(/id="cloneFeedback"/);
  });

  it('contains a feedback element for the new tweet tab (id="newFeedback")', () => {
    expect(webAppHtml).toMatch(/id="newFeedback"/);
  });

  it('contains a cron group element for the clone tab (id="cloneCronGroup")', () => {
    expect(webAppHtml).toMatch(/id="cloneCronGroup"/);
  });

  it('contains a cron group element for the new tweet tab (id="newCronGroup")', () => {
    expect(webAppHtml).toMatch(/id="newCronGroup"/);
  });

  it('contains a tab for cloning tweets (id="tabClone")', () => {
    expect(webAppHtml).toMatch(/id="tabClone"/);
  });

  it('contains a tab for new tweets (id="tabNew")', () => {
    expect(webAppHtml).toMatch(/id="tabNew"/);
  });
});
