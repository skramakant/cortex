# Implementation Plan: Tweet Resource Extractor

## Overview

Google Apps Script bound to a Google Sheet named "tweet" that automates two workflows: extracting media resources and text from tweet URLs, and scheduling/posting tweets via cron expressions with optional repeat limits. Organized into seven modules: Constants, SheetUtils, Extractor, Scheduler, Poster, TwitterClient, TriggerManager, plus WebApp and Main.

## Tasks

- [x] 1. Set up project structure and constants
  - Created `scripts/` directory with separate `.gs` files for each module
  - Defined column index constants in `Constants.gs`: `COL_TWEET_LINK` (1), `COL_RESOURCE_LINKS` (2), `COL_STATUS` (3), `COL_TITLE` (4), `COL_CRON` (5), `COL_MAX_COUNT` (6), `COL_POST_COUNT` (7)
  - Created `scripts/appsscript.json` manifest with OAuth scopes: `spreadsheets`, `script.external_request`, `script.scriptapp`, `script.webapp.deploy`
  - Set up `tests/` directory with `package.json` for Jest + fast-check testing with mocked GAS globals
  - _Requirements: 1.3, 7.1, 7.2, 7.3, 7.4_

- [x] 2. Implement SheetUtils module (`scripts/SheetUtils.gs`)
  - [x] 2.1 Implement `getOrCreateTweetSheet()`
    - Creates "tweet" sheet with 7-column headers: "tweet link", "resource links", "status", "title", "cron expression", "max count", "post count"
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 2.2 Implement `getAllRows(sheet)` — returns all rows after header as 2D array (7 columns per row)
  - [x] 2.3 Implement `writeCell(sheet, rowIndex, colIndex, value)` — writes to 1-based row/col
  - _Requirements: 1.3_

- [x] 3. Implement Trigger Manager module (`scripts/TriggerManager.gs`)
  - [x] 3.1 Implement `setupTriggers()` — idempotent; creates everyMinutes(1) trigger for `runScheduler` only if none exists
  - [x] 3.2 Implement `removeTriggers()` — deletes all triggers whose handler is `runScheduler`
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 4. Implement Twitter/X API Client module (`scripts/TwitterClient.gs`)
  - [x] 4.1 Implement `getCredentials()` — reads 4 keys from `PropertiesService`; throws if any missing
  - [x] 4.2 Implement `buildOAuth1Header(method, url, params)` — full OAuth 1.0a signing using `Utilities.computeHmacSignature(HMAC_SHA_1, ...)`
  - [x] 4.3 Implement `fetchTweetData(tweetId)` — `GET https://api.x.com/2/tweets/{id}` with media expansions; normalizes photos (use `url`) and videos (use `preview_image_url`)
  - [x] 4.4 Implement `postTweet(text, mediaUrls)` — `POST https://api.x.com/2/tweets`; calls `uploadMedia()` for each URL before posting
  - [x] 4.5 Implement `uploadMedia(imageUrl)` — fetches image bytes, base64-encodes, uploads to `https://upload.twitter.com/1.1/media/upload.json`; returns `{ mediaId }` or `{ error }`; failures are non-fatal
  - [x] 4.6 Implement `generateNonce()` and `percentEncode(str)` helpers
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 5. Implement Extractor module (`scripts/Extractor.gs`)
  - [x] 5.1 Implement `extractTweetId(url)` — regex for `twitter.com/user/status/ID` and `x.com/user/status/ID`; returns ID string or null
  - [x] 5.2 Implement `processExtractionRow(sheet, rowIndex, tweetUrl)` — calls `extractTweetId` then `fetchTweetData`; writes comma-joined mediaUrls (or "none") to col B and text to col D; writes error values on failure
  - [x] 5.3 Implement `extractResources()` — iterates all rows; calls `processExtractionRow` for rows with non-empty col A and empty col B
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4_

- [x] 6. Implement Scheduler module (`scripts/Scheduler.gs`)
  - [x] 6.1 Implement `matchesCronField(field, value, min, max)` — handles `*`, specific values, ranges `A-B`, steps `*/N`, comma lists
  - [x] 6.2 Implement `isValidCronField(field, min, max)` — validates field syntax without matching a value
  - [x] 6.3 Implement `parseCronExpression(cronStr)` — splits on whitespace; validates 5 fields and each field's range; returns `{ minute, hour, dom, month, dow }` or null
  - [x] 6.4 Implement `matchesCronSchedule(parsedCron, date)` — calls `matchesCronField` for all 5 fields
  - [x] 6.5 Implement `runScheduler()` — iterates rows; skips empty cron or "sent" status; writes error for invalid cron; calls `postTweetForRow` on match; increments `COL_POST_COUNT`; writes "sent" when `maxCount` reached
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4a.1, 4a.2, 4a.3, 4a.4_

- [x] 7. Implement Poster module (`scripts/Poster.gs`)
  - [x] 7.1 Implement `postTweetForRow(sheet, rowIndex, title, resourceLinks)` — validates title; parses resourceLinks; calls `postTweet`; writes "sent" or "error: ..." to col C
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Implement WebApp module (`scripts/WebApp.gs`)
  - [x] 8.1 Implement `doPost(e)` — parses `e.postData.contents` as JSON; routes by `action` field to `fetchTweetPreview`, `handleFormSubmit`, or `handleNewTweet`; returns JSON via `ContentService`
  - [x] 8.2 Implement `fetchTweetPreview(tweetUrl)` — validates URL, calls `extractTweetId` + `fetchTweetData`; returns `{ success, text, mediaUrls }` without writing to sheet
  - [x] 8.3 Implement `handleFormSubmit(params)` — clone tweet flow: validates tweetLink + title + cron; writes 7-column row; posts immediately (Send Now) or schedules (Cron)
  - [x] 8.4 Implement `handleNewTweet(params)` — new tweet flow: validates title + cron; writes 7-column row with empty tweetLink; posts immediately or schedules
  - [x] 8.5 Implement `_validateTweetLink(url)` and `_getNewRowIndex(sheet)` helpers
  - [x] 8.6 Implement `diagnoseCreds()` — verifies all 4 credentials, sheet access, and a test API call; logs to Execution Log
  - _Requirements: 7.5, and all WebApp requirements_

- [x] 9. Document entry points (`scripts/Main.gs`)
  - Documentation-only file listing all public entry points with descriptions and setup instructions
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 10. Write unit tests (`tests/unit/`)
  - [x] 10.1 `sheetUtils.test.js` — 7-column header creation, `getAllRows`, `writeCell`
  - [x] 10.2 `extractor.test.js` — `extractTweetId` (valid/invalid URLs), `processExtractionRow` (success/error paths), `extractResources` (eligible row selection)
  - [x] 10.3 `scheduler.test.js` — `parseCronExpression` (valid/invalid), `matchesCronField` (all syntax forms), `matchesCronSchedule` (composite), `runScheduler` (skip/error/post/max-count)
  - [x] 10.4 `poster.test.js` — `postTweetForRow` (success, API error, empty title, media parsing)
  - [x] 10.5 `twitterClient.test.js` — `buildOAuth1Header` (signature, credentials), `fetchTweetData` (success/error), `postTweet` (success/error)
  - [x] 10.6 `triggerManager.test.js` — `setupTriggers` (idempotency), `removeTriggers`
  - [x] 10.7 `webApp.test.js` — `_validateTweetLink`, `handleFormSubmit` (validation, Send Now, Cron), `doPost` (JSON routing), HTML structure
  - All 228 tests passing

- [x] 11. Final checkpoint — All tests pass
  - `cd tests && npm test` → 228 passed, 0 failed

## Notes

- The sheet schema expanded from 5 columns (A–E) to 7 columns (A–G) to support repeat scheduling
- `doGet` was removed from `WebApp.gs` — the frontend is now a static site on GitHub Pages, not served by GAS
- `doPost` reads `e.postData.contents` (JSON body) instead of `e.parameter` (form fields)
- API base URL is `api.x.com`, not `api.twitter.com`
- Media upload is handled by `uploadMedia()` in `TwitterClient.gs`; failures are non-fatal
- All `UrlFetchApp` calls use `muteHttpExceptions: true`
- Credentials are never hardcoded; always read from `PropertiesService.getScriptProperties()`
- Tests live in `tests/` (not `appscript/tests/`) and reference source files in `scripts/`
