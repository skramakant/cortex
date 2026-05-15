# Design Document

## Tweet Resource Extractor — Google Apps Script

---

## Overview

This document describes the technical design for a Google Apps Script bound to a Google Sheet named "tweet". The script automates two workflows:

1. **Resource Extraction**: Given a tweet URL in column A, fetch the tweet's text and media (images/videos) via the X API v2 and write them into columns D and B respectively.
2. **Cron-Based Scheduling**: Evaluate cron expressions in column E and post tweets via the Twitter/X API when the schedule matches the current time, respecting optional repeat limits in columns F and G.

### Key Design Decisions

- **X API v2 base URL `api.x.com`**: All API calls use `https://api.x.com/2/...`. The `GET /2/tweets/:id` endpoint (with `expansions=attachments.media_keys&media.fields=url,preview_image_url,type`) extracts tweet text and media URLs. The `POST /2/tweets` endpoint posts tweets. Both require OAuth 1.0a User Context authentication.
- **Media upload via v1.1 API**: Images are uploaded to `https://upload.twitter.com/1.1/media/upload.json` before posting. The returned `media_id_string` is attached to the tweet body. Upload failures are logged but do not block the post.
- **OAuth 1.0a implemented inline**: HMAC-SHA1 signatures are computed using `Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, ...)` and base64-encoded, following the standard OAuth 1.0a signing process.
- **Credentials stored in PropertiesService**: API keys and tokens are stored in `PropertiesService.getScriptProperties()` rather than hardcoded, keeping secrets out of source code.
- **Cron parser implemented in pure GAS JavaScript**: A lightweight 5-field cron parser is implemented directly in the script. No external libraries are needed.
- **Trigger runs every minute**: A time-based `ScriptApp` trigger calls `runScheduler` every minute, which evaluates all pending cron rows.
- **7-column sheet schema**: Two columns were added beyond the original 5 — `max count` (F) and `post count` (G) — to support repeat scheduling with an optional upper limit.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Google Sheet ("tweet")                       │
│  A: tweet link  │ B: resource links │ C: status  │ D: title      │
│  E: cron expr   │ F: max count      │ G: post count              │
└──────────────┬───────────────────────────────────────────────────┘
               │ read / write
┌──────────────▼───────────────────────────────────────────────────┐
│                      Google Apps Script                           │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  SheetUtils  │  │  Extractor   │  │       Scheduler          │ │
│  │             │  │              │  │                          │ │
│  │ getOrCreate │  │ extractAll() │  │ runScheduler()           │ │
│  │ TweetSheet()│  │ processRow() │  │ matchesCronSchedule()    │ │
│  │ getAllRows() │  │ extractId()  │  │ parseCronExpression()    │ │
│  │ writeCell() │  │              │  │ matchesCronField()       │ │
│  └─────────────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│                          │                       │               │
│                   ┌──────▼───────────────────────▼─────────────┐ │
│                   │           Twitter/X API Client              │ │
│                   │                                             │ │
│                   │  fetchTweetData(tweetId)                    │ │
│                   │  postTweet(text, mediaUrls)                 │ │
│                   │  uploadMedia(imageUrl)                      │ │
│                   │  buildOAuth1Header(method, url, params)     │ │
│                   │  getCredentials()                           │ │
│                   └─────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐  │
│  │    Poster    │  │            Trigger Manager               │  │
│  │              │  │                                          │  │
│  │ postTweet    │  │  setupTriggers() / removeTriggers()      │  │
│  │ ForRow()     │  │                                          │  │
│  └──────────────┘  └──────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                       WebApp                             │    │
│  │  doPost(e) — action-based JSON API router                │    │
│  │  handleFormSubmit(params) — clone tweet flow             │    │
│  │  handleNewTweet(params)   — new tweet flow               │    │
│  │  fetchTweetPreview(url)   — preview without writing      │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
               │ HTTPS
┌──────────────▼───────────────────────────────────────────────────┐
│                      Twitter/X API                                │
│  GET  https://api.x.com/2/tweets/:id?expansions=...              │
│  POST https://api.x.com/2/tweets                                 │
│  POST https://upload.twitter.com/1.1/media/upload.json           │
└──────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | File | Responsibility |
|---|---|---|
| **SheetUtils** | `SheetUtils.gs` | Locate or create the "tweet" sheet; read/write cell ranges |
| **Extractor** | `Extractor.gs` | Scan eligible rows; call the API client to fetch tweet data; write results to columns B and D |
| **Scheduler** | `Scheduler.gs` | Scan eligible rows; parse and evaluate cron expressions; enforce max count; invoke the Poster for matching rows |
| **Poster** | `Poster.gs` | Post tweet text and media via the API client; update column C status |
| **Twitter/X API Client** | `TwitterClient.gs` | Build OAuth 1.0a signatures; make `UrlFetchApp` calls to the X API; upload media |
| **Trigger Manager** | `TriggerManager.gs` | Install and remove time-based `ScriptApp` triggers |
| **WebApp** | `WebApp.gs` | HTTP `doPost` handler; action-based routing; clone tweet and new tweet flows |
| **Constants** | `Constants.gs` | Column index constants shared across all modules |
| **Main** | `Main.gs` | Documentation-only entry point; no executable code |

---

## Components and Interfaces

### Constants (`Constants.gs`)

```javascript
var COL_TWEET_LINK     = 1;  // A — URL of the source tweet (blank for new tweets)
var COL_RESOURCE_LINKS = 2;  // B — comma-separated media URLs, "none", or "error: ..."
var COL_STATUS         = 3;  // C — "", "sent", or "error: ..."
var COL_TITLE          = 4;  // D — tweet text to post
var COL_CRON           = 5;  // E — 5-field cron expression or ""
var COL_MAX_COUNT      = 6;  // F — max number of times to post (0 = unlimited)
var COL_POST_COUNT     = 7;  // G — number of times posted so far
```

### SheetUtils (`SheetUtils.gs`)

```javascript
/**
 * Returns the "tweet" sheet, creating it with 7-column headers if it doesn't exist.
 * Headers: "tweet link", "resource links", "status", "title",
 *          "cron expression", "max count", "post count"
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateTweetSheet()

/**
 * Returns all data rows (excluding header row 1) as a 2D array.
 * Each row has 7 elements corresponding to columns A–G.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<Array<any>>}
 */
function getAllRows(sheet)

/**
 * Writes a value to a specific cell.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based row number
 * @param {number} colIndex  1-based column number
 * @param {string|number} value
 */
function writeCell(sheet, rowIndex, colIndex, value)
```

### Extractor (`Extractor.gs`)

```javascript
/**
 * Entry point: scans all rows where col A is non-empty and col B is empty,
 * then fetches and writes resource links (col B) and title (col D).
 */
function extractResources()

/**
 * Processes a single row: fetches tweet data and writes to columns B and D.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based
 * @param {string} tweetUrl
 */
function processExtractionRow(sheet, rowIndex, tweetUrl)

/**
 * Extracts the tweet ID from a Twitter/X URL.
 * Handles: twitter.com/user/status/ID and x.com/user/status/ID
 * @param {string} url
 * @returns {string|null}  tweet ID string, or null if not parseable
 */
function extractTweetId(url)
```

### Scheduler (`Scheduler.gs`)

```javascript
/**
 * Entry point: scans all rows where col E is non-empty and col C is not "sent",
 * evaluates cron expressions, enforces max count, and posts matching tweets.
 * After a successful post, increments col G (post count).
 * If max count is reached after posting, writes "sent" to col C.
 */
function runScheduler()

/**
 * Parses a 5-field cron expression into a structured object.
 * Fields: minute hour day-of-month month day-of-week
 * Supports: * (wildcard), specific values, ranges (1-5), steps (*\/5), lists (1,3,5)
 * @param {string} cronStr
 * @returns {{ minute, hour, dom, month, dow } | null}  null if invalid
 */
function parseCronExpression(cronStr)

/**
 * Returns true if the given Date matches the parsed cron schedule.
 * @param {Object} parsedCron  result of parseCronExpression
 * @param {Date} date
 * @returns {boolean}
 */
function matchesCronSchedule(parsedCron, date)

/**
 * Evaluates whether a single cron field value matches a given numeric value.
 * Handles wildcards, lists, ranges, and step expressions.
 * @param {string} field  one cron field token (e.g. "*\/5", "1-5", "3,7")
 * @param {number} value  the current time component value
 * @param {number} min    minimum valid value for this field
 * @param {number} max    maximum valid value for this field
 * @returns {boolean}
 */
function matchesCronField(field, value, min, max)

/**
 * Validates that a cron field string is syntactically correct for the given range.
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isValidCronField(field, min, max)
```

### Poster (`Poster.gs`)

```javascript
/**
 * Posts a tweet for the given row using the title from col D and media from col B.
 * Writes "sent" or "error: ..." to col C.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based
 * @param {string} title          tweet text (col D)
 * @param {string} resourceLinks  comma-separated URLs or "none" (col B)
 */
function postTweetForRow(sheet, rowIndex, title, resourceLinks)
```

### Twitter/X API Client (`TwitterClient.gs`)

```javascript
/**
 * Fetches a tweet by ID using the X API v2.
 * Endpoint: GET https://api.x.com/2/tweets/{tweetId}
 * @param {string} tweetId
 * @returns {{ text: string, mediaUrls: string[] } | { error: string }}
 */
function fetchTweetData(tweetId)

/**
 * Posts a tweet via the X API v2.
 * Endpoint: POST https://api.x.com/2/tweets
 * Uploads media URLs via uploadMedia() before posting if provided.
 * @param {string} text
 * @param {string[]} [mediaUrls]  optional array of media URLs to upload and attach
 * @returns {{ id: string } | { error: string }}
 */
function postTweet(text, mediaUrls)

/**
 * Uploads an image from a public URL to the Twitter v1.1 media upload API.
 * Endpoint: POST https://upload.twitter.com/1.1/media/upload.json
 * Fetches image bytes, base64-encodes them, and uploads as multipart form data.
 * Upload failures are non-fatal — the caller logs the error and continues.
 * @param {string} imageUrl  Public URL of the image to upload
 * @returns {{ mediaId: string } | { error: string }}
 */
function uploadMedia(imageUrl)

/**
 * Builds an OAuth 1.0a Authorization header for a given HTTP request.
 * Uses Utilities.computeHmacSignature(HMAC_SHA_1, ...) for signing.
 * @param {string} method   HTTP method ("GET" or "POST")
 * @param {string} url      full endpoint URL (without query string)
 * @param {Object} params   query/body parameters to include in signature
 * @returns {string}        value for the Authorization header
 */
function buildOAuth1Header(method, url, params)

/**
 * Retrieves Twitter/X API credentials from PropertiesService.
 * Expected keys: TWITTER_API_KEY, TWITTER_API_SECRET,
 *                TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 * @returns {{ apiKey, apiSecret, accessToken, accessTokenSecret }}
 * @throws {Error} if any credential is missing
 */
function getCredentials()

/**
 * Generates a random 32-character alphanumeric nonce for OAuth.
 * @returns {string}
 */
function generateNonce()

/**
 * Percent-encodes a string per RFC 3986.
 * @param {string} str
 * @returns {string}
 */
function percentEncode(str)
```

### Trigger Manager (`TriggerManager.gs`)

```javascript
/**
 * Installs a time-based trigger to call runScheduler every minute.
 * Skips creation if a trigger for runScheduler already exists.
 */
function setupTriggers()

/**
 * Removes all triggers whose handler function is runScheduler.
 */
function removeTriggers()
```

### WebApp (`WebApp.gs`)

```javascript
/**
 * HTTP POST handler — entry point for all frontend API calls.
 * Reads JSON body from e.postData.contents and routes by the `action` field.
 *
 * Supported actions:
 *   "fetchPreview"  → fetchTweetPreview(params.tweetUrl)
 *   "submitTweet"   → handleFormSubmit(params)   (clone tweet flow)
 *   "newTweet"      → handleNewTweet(params)      (new tweet flow)
 *
 * @param {Object} e  The POST event object (e.postData.contents is the JSON body)
 * @returns {GoogleAppsScript.Content.TextOutput}  JSON response
 */
function doPost(e)

/**
 * Fetches tweet data for preview without writing to the sheet.
 * @param {string} tweetUrl
 * @returns {{ success: boolean, text?: string, mediaUrls?: string[], error?: string }}
 */
function fetchTweetPreview(tweetUrl)

/**
 * Handles submission of a cloned tweet (from an existing tweet URL).
 * The title and resourceLinks are provided by the caller (pre-fetched by the frontend).
 * Validates inputs, writes a new row, and posts immediately or schedules.
 *
 * @param {{ tweetLink: string, scheduleMode: string, title: string,
 *           resourceLinks: string, cronExpression?: string, maxCount?: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleFormSubmit(params)

/**
 * Handles submission of a brand-new tweet (no source URL).
 * Validates inputs, writes a new row, and posts immediately or schedules.
 *
 * @param {{ title: string, resourceLinks: string, scheduleMode: string,
 *           cronExpression?: string, maxCount?: number }} params
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function handleNewTweet(params)

/**
 * Validates a tweet URL.
 * @param {string} url
 * @returns {string|null}  null if valid; error string if invalid
 */
function _validateTweetLink(url)

/**
 * Returns the 1-based row index for the next empty row.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {number}
 */
function _getNewRowIndex(sheet)

/**
 * Diagnostic helper — run from the Apps Script editor to verify credentials
 * and sheet access. Logs results to the Execution Log.
 */
function diagnoseCreds()
```

---

## Data Models

### Sheet Row Model

Each data row in the "tweet" sheet maps to the following logical structure:

```
Row {
  tweetLink:      string   // col A — URL of the source tweet, or "" for new tweets
  resourceLinks:  string   // col B — comma-separated media URLs, "none", "error: ...", or ""
  status:         string   // col C — "", "sent", or "error: ..."
  title:          string   // col D — tweet text to post
  cronExpression: string   // col E — 5-field cron string or ""
  maxCount:       number   // col F — max posts (0 = unlimited)
  postCount:      number   // col G — times posted so far
}
```

### Tweet API Response Model

The X API v2 response for `GET https://api.x.com/2/tweets/:id` with expansions:

```json
{
  "data": {
    "id": "1234567890",
    "text": "Tweet text content here"
  },
  "includes": {
    "media": [
      { "media_key": "3_...", "type": "photo", "url": "https://pbs.twimg.com/media/..." },
      { "media_key": "7_...", "type": "video", "preview_image_url": "https://pbs.twimg.com/..." }
    ]
  }
}
```

Normalized client output:
```javascript
{
  text: "Tweet text content here",
  mediaUrls: [
    "https://pbs.twimg.com/media/...",       // photo: use url
    "https://pbs.twimg.com/ext_tw_video_thumb/..." // video: use preview_image_url
  ]
}
```

### WebApp Request / Response Models

**Request body (JSON, sent by frontend via `fetch()`):**
```javascript
// Preview
{ action: "fetchPreview", tweetUrl: string }

// Clone tweet
{ action: "submitTweet", tweetLink: string, title: string, resourceLinks: string,
  scheduleMode: "now"|"cron", cronExpression?: string, maxCount?: number }

// New tweet
{ action: "newTweet", title: string, resourceLinks: string,
  scheduleMode: "now"|"cron", cronExpression?: string, maxCount?: number }
```

**Response (JSON):**
```javascript
{ success: true,  message: string }   // success
{ success: false, error: string }     // failure
// fetchPreview success:
{ success: true, text: string, mediaUrls: string[] }
```

### Parsed Cron Model

```javascript
{
  minute: string,   // e.g. "*/5", "0", "1-30", "0,30"
  hour:   string,   // e.g. "*", "9-17"
  dom:    string,   // day of month
  month:  string,
  dow:    string    // day of week (0=Sunday, 6=Saturday)
}
```

### Credentials Model

Stored in `PropertiesService.getScriptProperties()`:

| Key | Description |
|---|---|
| `TWITTER_API_KEY` | OAuth consumer key |
| `TWITTER_API_SECRET` | OAuth consumer secret |
| `TWITTER_ACCESS_TOKEN` | OAuth user access token |
| `TWITTER_ACCESS_TOKEN_SECRET` | OAuth user access token secret |

---

## Correctness Properties

### Property 1: Extractor processes exactly the eligible rows

*For any* sheet state, after `extractResources()` runs, the set of rows written to (columns B and D updated) SHALL be exactly the set of rows where column A was non-empty AND column B was empty before the run.

**Validates: Requirements 2.1, 2.6, 3.4**

### Property 2: Extractor preserves previously extracted data

*For any* sheet state, after `extractResources()` runs, every row that had a non-empty value in column B before the run SHALL have the same value in column B after the run.

**Validates: Requirements 2.6**

### Property 3: Resource link output round-trips cleanly

*For any* array of one or more non-empty URL strings, the comma-separated string written to column B SHALL split back (on `","`) into the same array of URLs with no leading or trailing whitespace.

**Validates: Requirements 2.3**

### Property 4: Cron field matching is correct for all valid inputs and syntax forms

*For any* valid 5-field cron expression and any `Date` value, `matchesCronSchedule(parsedCron, date)` SHALL return `true` if and only if each of the five fields independently matches the corresponding date component.

**Validates: Requirements 4.2, 4.6**

### Property 5: Scheduler processes exactly the eligible rows and skips sent rows

*For any* sheet state, after `runScheduler()` runs, the set of rows evaluated for cron matching SHALL be exactly the set of rows where column E was non-empty AND column C was not `"sent"` before the run.

**Validates: Requirements 4.1, 5.5**

### Property 6: Poster invocation uses the correct text and media from the row

*For any* row passed to `postTweetForRow`, the Twitter/X API call SHALL be made with the exact text from column D, and if column B contains a non-`"none"` value, the media URLs parsed from column B SHALL be included.

**Validates: Requirements 5.1, 5.2**

### Property 7: Tweet ID extraction round-trip

*For any* valid Twitter/X URL in the formats `https://twitter.com/{user}/status/{id}` or `https://x.com/{user}/status/{id}`, `extractTweetId(url)` SHALL return the exact numeric ID string.

**Validates: Requirements 2.2**

### Property 8: Trigger setup is idempotent

*For any* number of consecutive calls to `setupTriggers()`, the total number of triggers installed for `runScheduler` SHALL be exactly one.

**Validates: Requirements 6.3**

### Property 9: Malformed cron expressions always produce an error status

*For any* string that is not a valid 5-field cron expression, when the Scheduler encounters it in column E, it SHALL write a value starting with `"error:"` into column C and SHALL NOT invoke the Poster.

**Validates: Requirements 4.5**

### Property 10: API errors are propagated to column C status

*For any* Twitter/X API error response, after the Poster attempts to post, column C SHALL contain a value starting with `"error:"` and SHALL NOT contain `"sent"`.

**Validates: Requirements 5.4**

---

## Error Handling

### Extractor Error Handling

| Condition | Column B value | Column D value |
|---|---|---|
| Tweet URL is malformed (no valid ID) | `"error: invalid tweet URL"` | `"error: unable to extract title"` |
| API returns HTTP error | `"error: HTTP {status}"` | `"error: unable to extract title"` |
| API returns no media | `"none"` | tweet text (if available) |
| API returns no text | tweet media URLs (if any) | `"error: unable to extract title"` |
| Missing API credentials | `"error: auth error: ..."` | `"error: unable to extract title"` |

### Scheduler / Poster Error Handling

| Condition | Column C value |
|---|---|
| Cron expression is malformed | `"error: invalid cron expression"` |
| Twitter API returns error on post | `"error: {API error message}"` |
| Missing API credentials | `"error: auth error: ..."` |
| Column D (title) is empty | `"error: no tweet text"` |
| Max count reached (before posting) | `"sent"` |

### WebApp Error Handling

| Condition | Response |
|---|---|
| `tweetLink` is empty or whitespace | `{ success: false, error: "Tweet link is required." }` |
| `tweetLink` does not match URL pattern | `{ success: false, error: "Tweet link must be a valid twitter.com or x.com status URL." }` |
| `title` is empty or whitespace | `{ success: false, error: "Tweet text is required." }` |
| `cronExpression` is empty (cron mode) | `{ success: false, error: "Cron expression is required." }` |
| `cronExpression` is invalid (cron mode) | `{ success: false, error: "Cron expression is invalid. Use 5-field format: minute hour dom month dow." }` |
| `postTweetForRow` writes error to col C | `{ success: false, error: <col C value> }` |
| Any uncaught exception | `{ success: false, error: "Unexpected error: " + e.message }` |

### General Principles

- All `UrlFetchApp` calls use `muteHttpExceptions: true` so HTTP errors are caught and handled gracefully.
- Errors are written back to the sheet immediately so the user can see which rows failed.
- A row with an error in column B is still considered "processed" (column B is non-empty), so the extractor will not retry it. The user must clear column B to trigger a retry.
- A row with an error in column C is not "sent", so the scheduler will attempt it again on the next trigger run. This is intentional for transient API errors.
- Media upload failures are non-fatal: the tweet is posted without the failed media, and the error is logged via `Logger.log`.

---

## Testing Strategy

### Test Location and Runner

Tests live in `tests/unit/` and run via Jest in Node.js with mocked GAS globals (`tests/gasGlobals.js`). Run with:

```bash
cd tests && npm test
```

### Unit Test Coverage

| File | Functions tested |
|---|---|
| `extractor.test.js` | `extractTweetId`, `processExtractionRow`, `extractResources` |
| `scheduler.test.js` | `parseCronExpression`, `matchesCronField`, `matchesCronSchedule`, `runScheduler` |
| `poster.test.js` | `postTweetForRow` |
| `sheetUtils.test.js` | `getOrCreateTweetSheet`, `getAllRows`, `writeCell` |
| `twitterClient.test.js` | `buildOAuth1Header`, `getCredentials`, `fetchTweetData`, `postTweet` |
| `triggerManager.test.js` | `setupTriggers`, `removeTriggers` |
| `webApp.test.js` | `_validateTweetLink`, `handleFormSubmit`, `handleNewTweet`, `doPost`, HTML structure |

Total: **228 tests**, all passing.

### Property-Based Tests

Property-based tests use [**fast-check**](https://github.com/dubzzz/fast-check), run via Jest. Each test runs a minimum of **100 iterations**. Tags use the format:
`// Feature: tweet-resource-extractor, Property {N}: {property_text}`
