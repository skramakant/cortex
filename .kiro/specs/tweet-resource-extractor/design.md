# Design Document

## Tweet Resource Extractor — Google Apps Script

---

## Overview

This document describes the technical design for a Google Apps Script bound to a Google Sheet named "tweet". The script automates two workflows:

1. **Resource Extraction**: Given a tweet URL in column A, fetch the tweet's text and media (images/videos) and write them into columns D and B respectively.
2. **Cron-Based Scheduling**: Evaluate cron expressions in column E and post tweets via the Twitter/X API when the schedule matches the current time.

### Key Design Decisions

- **Twitter/X API v2 for reading and writing**: The X API v2 `GET /2/tweets/:id` endpoint (with `expansions=attachments.media_keys&media.fields=url,preview_image_url,type`) is used to extract tweet text and media URLs. The `POST /2/tweets` endpoint is used to post tweets. Both require OAuth 1.0a User Context authentication.
- **OAuth 1.0a implemented inline**: Google Apps Script does not have a native OAuth 1.0a library for Twitter. The HMAC-SHA1 signature is computed using `Utilities.computeHmacSha1Signature` and base64-encoded, following the standard OAuth 1.0a signing process.
- **Credentials stored in PropertiesService**: API keys and tokens are stored in `PropertiesService.getScriptProperties()` rather than hardcoded, keeping secrets out of source code.
- **Cron parser implemented in pure GAS JavaScript**: A lightweight 5-field cron parser is implemented directly in the script. No external libraries are needed.
- **Trigger runs every minute**: A time-based `ScriptApp` trigger calls `runScheduler` every minute, which evaluates all pending cron rows.

---

## Architecture

The script is organized into four logical modules, each implemented as a set of top-level functions in a single `.gs` file (or split across multiple files in the Apps Script project):

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Sheet ("tweet")                    │
│  Col A: tweet link  │ B: resource links │ C: status         │
│  Col D: title       │ E: cron expression                    │
└──────────────┬──────────────────────────────────────────────┘
               │ read / write
┌──────────────▼──────────────────────────────────────────────┐
│                    Google Apps Script                        │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  SheetUtils  │   │  Extractor   │   │    Scheduler     │  │
│  │             │   │              │   │                  │  │
│  │ getSheet()  │   │ extractAll() │   │ runScheduler()   │  │
│  │ getHeaders()│   │ fetchTweet() │   │ matchesCron()    │  │
│  │ ensureSheet │   │ parseMedia() │   │ parseCron()      │  │
│  └─────────────┘   └──────┬───────┘   └────────┬─────────┘  │
│                           │                    │             │
│                    ┌──────▼────────────────────▼──────────┐  │
│                    │           Twitter/X API Client        │  │
│                    │                                       │  │
│                    │  getTweet(tweetId)                    │  │
│                    │  postTweet(text, mediaIds)            │  │
│                    │  buildOAuth1Header(method, url, ...)  │  │
│                    └───────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Trigger Manager                      │   │
│  │  setupTriggers() / removeTriggers()                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────────────────────────┐
│                    Twitter/X API v2                          │
│  GET  /2/tweets/:id?expansions=...&media.fields=...          │
│  POST /2/tweets                                              │
└─────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| **SheetUtils** | Locate or create the "tweet" sheet; read/write cell ranges; validate headers |
| **Extractor** | Scan eligible rows; call the API client to fetch tweet data; write results to columns B and D |
| **Scheduler** | Scan eligible rows; parse and evaluate cron expressions; invoke the Poster for matching rows |
| **Poster** | Post tweet text and media via the API client; update column C status |
| **Twitter/X API Client** | Build OAuth 1.0a signatures; make `UrlFetchApp` calls to the X API |
| **Trigger Manager** | Install and remove time-based `ScriptApp` triggers |

---

## Components and Interfaces

### SheetUtils

```javascript
/**
 * Returns the "tweet" sheet, creating it with headers if it doesn't exist.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateTweetSheet()

/**
 * Returns all data rows (excluding header row 1) as a 2D array.
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

Column index constants:
```javascript
const COL_TWEET_LINK     = 1;  // A
const COL_RESOURCE_LINKS = 2;  // B
const COL_STATUS         = 3;  // C
const COL_TITLE          = 4;  // D
const COL_CRON           = 5;  // E
```

### Extractor

```javascript
/**
 * Entry point: scans all rows where col A is non-empty and col B is empty,
 * then fetches and writes resource links and title.
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
 * Handles formats: twitter.com/user/status/ID and x.com/user/status/ID
 * @param {string} url
 * @returns {string|null}  tweet ID string, or null if not parseable
 */
function extractTweetId(url)
```

### Scheduler

```javascript
/**
 * Entry point: scans all rows where col E is non-empty and col C is not "sent",
 * evaluates cron expressions, and posts matching tweets.
 */
function runScheduler()

/**
 * Parses a 5-field cron expression into a structured object.
 * Fields: minute hour day-of-month month day-of-week
 * Supports: * (wildcard), specific values, ranges (1-5), step values (*\/5), lists (1,3,5)
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
 * @param {string} field  one cron field token (e.g. "*/5", "1-5", "3,7")
 * @param {number} value  the current time component value
 * @param {number} min    minimum valid value for this field
 * @param {number} max    maximum valid value for this field
 * @returns {boolean}
 */
function matchesCronField(field, value, min, max)
```

### Poster

```javascript
/**
 * Posts a tweet for the given row. Reads title from col D and resource links from col B.
 * Writes "sent" or "error: ..." to col C.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex  1-based
 * @param {string} title     tweet text (col D)
 * @param {string} resourceLinks  comma-separated URLs or "none" (col B)
 */
function postTweetForRow(sheet, rowIndex, title, resourceLinks)
```

### Twitter/X API Client

```javascript
/**
 * Fetches a tweet by ID using the X API v2.
 * Requests: tweet.fields=text and expansions=attachments.media_keys
 * with media.fields=url,preview_image_url,type
 * @param {string} tweetId
 * @returns {{ text: string, mediaUrls: string[] } | { error: string }}
 */
function fetchTweetData(tweetId)

/**
 * Posts a tweet via the X API v2 POST /2/tweets.
 * @param {string} text
 * @param {string[]} [mediaUrls]  optional array of media URLs to attach
 * @returns {{ id: string } | { error: string }}
 */
function postTweet(text, mediaUrls)

/**
 * Builds an OAuth 1.0a Authorization header for a given HTTP request.
 * Uses HMAC-SHA1 signing via Utilities.computeHmacSha1Signature.
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
```

### Trigger Manager

```javascript
/**
 * Installs a time-based trigger to call runScheduler every minute.
 * Skips creation if a trigger for runScheduler already exists.
 */
function setupTriggers()

/**
 * Removes all triggers created by setupTriggers.
 */
function removeTriggers()
```

---

## Data Models

### Sheet Row Model

Each data row in the "tweet" sheet maps to the following logical structure:

```
Row {
  tweetLink:     string   // col A — URL of the source tweet
  resourceLinks: string   // col B — comma-separated media URLs, "none", "error: ...", or ""
  status:        string   // col C — "", "sent", or "error: ..."
  title:         string   // col D — tweet text, "error: ...", or ""
  cronExpression:string   // col E — 5-field cron string or ""
}
```

### Tweet API Response Model

The X API v2 response for `GET /2/tweets/:id` with expansions:

```json
{
  "data": {
    "id": "1234567890",
    "text": "Tweet text content here"
  },
  "includes": {
    "media": [
      {
        "media_key": "3_1234567890",
        "type": "photo",
        "url": "https://pbs.twimg.com/media/..."
      },
      {
        "media_key": "7_1234567890",
        "type": "video",
        "preview_image_url": "https://pbs.twimg.com/ext_tw_video_thumb/..."
      }
    ]
  }
}
```

The client normalizes this into:
```javascript
{
  text: "Tweet text content here",
  mediaUrls: [
    "https://pbs.twimg.com/media/...",          // photo: use url
    "https://pbs.twimg.com/ext_tw_video_thumb/..." // video: use preview_image_url
  ]
}
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

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Extractor processes exactly the eligible rows

*For any* sheet state, after `extractResources()` runs, the set of rows that were written to (columns B and D updated) SHALL be exactly the set of rows where column A was non-empty AND column B was empty before the run — no more, no fewer.

**Validates: Requirements 2.1, 2.6, 3.4**

---

### Property 2: Extractor preserves previously extracted data

*For any* sheet state, after `extractResources()` runs, every row that had a non-empty value in column B before the run SHALL have the same value in column B after the run (previously extracted data is never overwritten).

**Validates: Requirements 2.6**

---

### Property 3: Resource link output round-trips cleanly

*For any* array of one or more non-empty URL strings produced by a tweet fetch, the comma-separated string written to column B SHALL split back (on `","`) into the same array of URLs with no leading or trailing whitespace on any entry.

**Validates: Requirements 2.3**

---

### Property 4: Cron field matching is correct for all valid inputs and syntax forms

*For any* valid 5-field cron expression (using any combination of `*`, specific values, ranges `A-B`, step expressions `*/N`, and comma-separated lists) and any `Date` value, `matchesCronSchedule(parsedCron, date)` SHALL return `true` if and only if each of the five fields independently matches the corresponding date component (minute 0–59, hour 0–23, day-of-month 1–31, month 1–12, day-of-week 0–6).

**Validates: Requirements 4.2, 4.6**

---

### Property 5: Scheduler processes exactly the eligible rows and skips sent rows

*For any* sheet state, after `runScheduler()` runs, the set of rows evaluated for cron matching SHALL be exactly the set of rows where column E was non-empty AND column C was not `"sent"` before the run. Rows with `"sent"` in column C SHALL never be passed to the Poster.

**Validates: Requirements 4.1, 5.5**

---

### Property 6: Poster invocation uses the correct text and media from the row

*For any* row passed to `postTweetForRow`, the Twitter/X API call SHALL be made with the exact text from column D of that row, and if column B contains a non-`"none"` value, the media URLs parsed from column B SHALL be included in the API call.

**Validates: Requirements 5.1, 5.2**

---

### Property 7: Tweet ID extraction round-trip

*For any* valid Twitter/X URL in the formats `https://twitter.com/{user}/status/{id}` or `https://x.com/{user}/status/{id}` where `{id}` is a numeric string, `extractTweetId(url)` SHALL return the exact numeric ID string that appears in the URL path.

**Validates: Requirements 2.2**

---

### Property 8: Trigger setup is idempotent

*For any* number of consecutive calls to `setupTriggers()`, the total number of triggers installed for `runScheduler` SHALL be exactly one — no duplicate triggers are created.

**Validates: Requirements 6.3**

---

### Property 9: Malformed cron expressions always produce an error status

*For any* string that is not a valid 5-field cron expression (wrong number of fields, out-of-range values, invalid characters), when the Scheduler encounters it in column E, it SHALL write a value starting with `"error:"` into column C of that row and SHALL NOT invoke the Poster for that row.

**Validates: Requirements 4.5**

---

### Property 10: API errors are propagated to column C status

*For any* Twitter/X API error response (any HTTP error status or error body), after the Poster attempts to post a tweet, column C of that row SHALL contain a value starting with `"error:"` and SHALL NOT contain `"sent"`.

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
| Missing API credentials | `"error: missing credentials"` | `"error: missing credentials"` |

### Scheduler / Poster Error Handling

| Condition | Column C value |
|---|---|
| Cron expression is malformed | `"error: invalid cron expression"` |
| Twitter API returns error on post | `"error: {API error message}"` |
| Missing API credentials | `"error: missing credentials"` |
| Column D (title) is empty | `"error: no tweet text"` |

### General Principles

- All `UrlFetchApp` calls use `muteHttpExceptions: true` so HTTP errors are caught and handled gracefully rather than throwing.
- Errors are written back to the sheet immediately so the user can see which rows failed.
- A row with an error in column B is still considered "processed" (column B is non-empty), so the extractor will not retry it automatically. The user must clear column B to trigger a retry.
- A row with an error in column C is not "sent", so the scheduler will attempt it again on the next trigger run. This is intentional for transient API errors.

---

## Testing Strategy

### Unit Tests

Unit tests are written using [**clasp**](https://github.com/google/clasp) to push code locally and a test runner such as [**gas-local**](https://github.com/mzagorny/gas-local) or plain Node.js with mocked GAS globals.

Focus areas for unit tests:
- `extractTweetId(url)` — valid URLs, malformed URLs, x.com vs twitter.com variants
- `parseCronExpression(str)` — valid expressions, invalid expressions, edge cases
- `matchesCronField(field, value, min, max)` — all field types: `*`, specific value, range, step, list
- `matchesCronSchedule(parsed, date)` — composite matching across all five fields
- `buildOAuth1Header(...)` — signature generation against known test vectors
- `getOrCreateTweetSheet()` — sheet creation when absent, no-op when present

### Property-Based Tests

Property-based tests use [**fast-check**](https://github.com/dubzzz/fast-check) (JavaScript), run via Node.js with GAS globals mocked. Each test runs a minimum of **100 iterations**.

Each test is tagged with a comment in the format:
`// Feature: tweet-resource-extractor, Property {N}: {property_text}`

**Property 1 — Extractor processes exactly the eligible rows**
Generate random sheet states (rows with various combinations of empty/non-empty columns A and B). Run `extractResources()` with a mocked API. Assert the set of rows written to equals exactly the set with non-empty A and empty B.
`// Feature: tweet-resource-extractor, Property 1: extractor writes to exactly the rows with non-empty A and empty B`

**Property 2 — Extractor preserves previously extracted data**
Generate random sheet states where some rows already have non-empty column B. Run `extractResources()` with a mocked API. Assert all pre-existing column B values are unchanged.
`// Feature: tweet-resource-extractor, Property 2: extractor never overwrites existing column B values`

**Property 3 — Resource link output round-trips cleanly**
Generate random arrays of one or more non-empty URL strings. Pass them through the formatting function. Assert splitting the output on `","` and trimming each entry returns the original array.
`// Feature: tweet-resource-extractor, Property 3: comma-separated resource link output round-trips cleanly`

**Property 4 — Cron field matching is correct for all valid inputs and syntax forms**
Generate random valid 5-field cron expressions (using `*`, specific values, ranges, steps, lists) and random `Date` values. For each pair, independently compute the expected match result using a reference implementation, then compare against `matchesCronSchedule`. The two results must always agree.
`// Feature: tweet-resource-extractor, Property 4: matchesCronSchedule agrees with reference for all valid cron/date pairs`

**Property 5 — Scheduler processes exactly the eligible rows and skips sent rows**
Generate random sheet states with varying column C and E values. Run `runScheduler()` with a mocked poster and fixed time. Assert the poster is called for exactly the rows with non-empty E and non-"sent" C.
`// Feature: tweet-resource-extractor, Property 5: scheduler evaluates exactly rows with non-empty cron and non-sent status`

**Property 6 — Poster invocation uses the correct text and media from the row**
Generate random tweet texts and resource link lists. Invoke `postTweetForRow()` with a mocked API. Assert the API was called with the exact text and the correct media URLs.
`// Feature: tweet-resource-extractor, Property 6: poster calls API with exact text and media from the row`

**Property 7 — Tweet ID extraction round-trip**
Generate random Twitter/X user handles and numeric tweet IDs. Construct URLs in both `twitter.com` and `x.com` formats. Assert `extractTweetId(url)` returns the original ID string.
`// Feature: tweet-resource-extractor, Property 7: extractTweetId recovers the exact ID from any valid tweet URL`

**Property 8 — Trigger setup is idempotent**
Call `setupTriggers()` a random number of times (1–10) with a mocked `ScriptApp`. Assert the total number of triggers for `runScheduler` is always exactly one.
`// Feature: tweet-resource-extractor, Property 8: setupTriggers never creates duplicate triggers regardless of call count`

**Property 9 — Malformed cron expressions always produce an error status**
Generate strings that are not valid 5-field cron expressions (wrong field count, out-of-range values, invalid characters). Run the scheduler with these values in column E. Assert column C always gets a value starting with `"error:"` and the poster is never called.
`// Feature: tweet-resource-extractor, Property 9: malformed cron always writes error to column C and never invokes poster`

**Property 10 — API errors are propagated to column C status**
Generate random HTTP error status codes and error message strings. Mock the Twitter/X API to return these errors. Invoke the poster. Assert column C always contains a value starting with `"error:"` and never `"sent"`.
`// Feature: tweet-resource-extractor, Property 10: any API error results in error status in column C, never sent`

### Integration Tests

Integration tests run against the live X API using a dedicated test account and are executed manually or in a separate CI step:

- Verify `fetchTweetData(id)` returns correct text and media URLs for a known tweet
- Verify `postTweet(text)` successfully creates a tweet and returns an ID
- Verify the trigger setup/teardown cycle creates and removes exactly one trigger

### Smoke Tests

- Verify all four required credentials are present in `PropertiesService` before any API call
- Verify the "tweet" sheet exists and has the correct headers after `getOrCreateTweetSheet()` runs
