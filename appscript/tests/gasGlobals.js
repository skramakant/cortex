/**
 * gasGlobals.js
 * Mocks for Google Apps Script global objects and services.
 * Used by Node.js-based tests to simulate the GAS runtime environment.
 */

'use strict';

// ---- SpreadsheetApp mock ----
function createMockSheet(rows) {
  const data = rows ? rows.map(r => [...r]) : [];

  return {
    _data: data,
    getLastRow() {
      return data.length;
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const result = [];
          for (let r = row - 1; r < row - 1 + (numRows || 1); r++) {
            const rowData = [];
            for (let c = col - 1; c < col - 1 + (numCols || 1); c++) {
              rowData.push((data[r] && data[r][c] !== undefined) ? data[r][c] : '');
            }
            result.push(rowData);
          }
          return result;
        },
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            const rowIdx = row - 1 + r;
            if (!data[rowIdx]) data[rowIdx] = [];
            for (let c = 0; c < values[r].length; c++) {
              data[rowIdx][col - 1 + c] = values[r][c];
            }
          }
        },
        setValue(value) {
          const rowIdx = row - 1;
          if (!data[rowIdx]) data[rowIdx] = [];
          data[rowIdx][col - 1] = value;
        }
      };
    },
    getName() { return 'tweet'; }
  };
}

function createMockSpreadsheetApp(existingSheet) {
  let sheet = existingSheet || null;
  return {
    getActiveSpreadsheet() {
      return {
        getSheetByName(name) {
          return sheet && sheet.getName() === name ? sheet : null;
        },
        insertSheet(name) {
          sheet = createMockSheet([]);
          sheet.getName = () => name;
          return sheet;
        }
      };
    }
  };
}

// ---- ScriptApp mock ----
function createMockScriptApp() {
  const triggers = [];
  return {
    _triggers: triggers,
    getProjectTriggers() { return [...triggers]; },
    deleteTrigger(trigger) {
      const idx = triggers.indexOf(trigger);
      if (idx !== -1) triggers.splice(idx, 1);
    },
    newTrigger(handlerFunction) {
      return {
        timeBased() {
          return {
            everyMinutes() {
              return {
                create() {
                  const t = {
                    getHandlerFunction() { return handlerFunction; }
                  };
                  triggers.push(t);
                  return t;
                }
              };
            }
          };
        }
      };
    }
  };
}

// ---- PropertiesService mock ----
function createMockPropertiesService(props) {
  return {
    getScriptProperties() {
      return {
        getProperty(key) { return props[key] || null; }
      };
    }
  };
}

// ---- UrlFetchApp mock ----
function createMockUrlFetchApp(responseMap) {
  return {
    fetch(url, options) {
      const handler = responseMap[url] || responseMap['*'];
      if (handler) return handler(url, options);
      return {
        getResponseCode() { return 200; },
        getContentText() { return '{}'; }
      };
    }
  };
}

// ---- Utilities mock ----
const MockUtilities = {
  MacAlgorithm: { HMAC_SHA_1: 'HMAC_SHA_1' },
  computeHmacSignature(algorithm, value, key) {
    // Returns a deterministic fake byte array for testing
    const bytes = [];
    for (let i = 0; i < 20; i++) {
      bytes.push((value.charCodeAt(i % value.length) ^ key.charCodeAt(i % key.length)) & 0xff);
    }
    return bytes;
  },
  // Keep old name as alias so any existing test references still work
  computeHmacSha1Signature(value, key) {
    return this.computeHmacSignature('HMAC_SHA_1', value, key);
  },
  base64Encode(bytes) {
    return Buffer.from(bytes).toString('base64');
  }
};

module.exports = {
  createMockSheet,
  createMockSpreadsheetApp,
  createMockScriptApp,
  createMockPropertiesService,
  createMockUrlFetchApp,
  MockUtilities
};
