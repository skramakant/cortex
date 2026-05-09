# Implementation Plan: Tweet Resource Extractor

## Overview

Implement a Google Apps Script bound to a Google Sheet named "tweet" that automates two workflows: extracting media resources and text from tweet URLs, and scheduling/posting tweets via cron expressions. The implementation is organized into five modules: SheetUtils, Extractor, Scheduler, Poster, and the Twitter/X API Client, plus a Trigger Manager.

## Tasks

- [x] 1. Set up project structure and constants
  - Create the `appscript/` directory structure with separate `.gs` files for each module: `SheetUtils.gs`, `Extractor.gs`, `Scheduler.gs`, `Poster.gs`, `TwitterClient.gs`, `TriggerManager.gs`
  - Define column index constants (`COL_TWEET_LINK`, `COL_RESOURCE_LINKS`, `COL_STATUS`, `COL_TITLE`, `COL_CRON`) in a shared `Constants.gs` file
  - Create `appsscript.json` manifest with required OAuth scopes (`spreadsheets`, `script.external_request`, `script.scriptapp`)
  - Set up a `tests/` directory with a `package.json` for Node.js-based testing using `fast-check` and mocked GAS globals
  - _Requirements: 1.3, 7.1, 7.2, 7.3, 7.4_

- [x] 2. Implement SheetUtils module
  - [x] 2.1 Implement `getOrCreateTweetSheet()`
    - Check if a sheet named "tweet" exists in the active spreadsheet; if not, create it and write headers `["tweet link", "resource links", "status", "title", "cron expression"]` in row 1
    - Return the sheet object
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.2 Write property test for `setupTriggers` idempotency (Property 8)
    - **Property 8: Trigger setup is idempotent**
    - Mock `ScriptApp` to track trigger creation; call `setupTriggers()` a random number of times (1–10); assert exactly one trigger exists for `runScheduler`
    - **Validates: Requirements 6.3**
    - `// Feature: tweet-resource-extractor, Property 8: setupTriggers never creates duplicate triggers regardless of call count`

  - [x] 2.3 Implement `getAllRows(sheet)` and `writeCell(sheet, rowIndex, colIndex, value)`
    - `getAllRows` returns all rows after the header as a 2D array
    - `writeCell` writes a value to the specified 1-based row and column
    - _Requirements: 1.3_

- [x] 3. Implement Trigger Manager module
  - [x] 3.1 Implement `setupTriggers()`
    - Check existing triggers via `ScriptApp.getProjectTriggers()`; only create a new everyMinutes(1) trigger for `runScheduler` if none exists
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.2 Implement `removeTriggers()`
    - Iterate all project triggers and delete those whose handler function is `runScheduler`
    - _Requirements: 6.4_

- [x] 4. Implement Twitter/X API Client module
  - [x] 4.1 Implement `getCredentials()`
    - Read `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` from `PropertiesService.getScriptProperties()`
    - Throw an `Error` if any credential is missing
    - _Requirements: 5.1, 5.4_

  - [x] 4.2 Implement `buildOAuth1Header(method, url, params)`
    - Generate OAuth 1.0a nonce and timestamp
    - Build the signature base string from method, URL, and merged OAuth + request params (percent-encoded, sorted)
    - Compute HMAC-SHA1 signature using `Utilities.computeHmacSha1Signature` with the signing key `apiSecret&accessTokenSecret`
    - Return the `Authorization` header string with all OAuth parameters
    - _Requirements: 5.1_

  - [x] 4.3 Implement `fetchTweetData(tweetId)`
    - Call `GET https://api.twitter.com/2/tweets/{tweetId}` with `expansions=attachments.media_keys&media.fields=url,preview_image_url,type&tweet.fields=text` using `UrlFetchApp.fetch` with `muteHttpExceptions: true`
    - On success, extract `data.text` and normalize `includes.media` into `mediaUrls` (photos use `url`, videos use `preview_image_url`)
    - On HTTP error or missing data, return `{ error: "HTTP {status}" }` or appropriate error object
    - _Requirements: 2.2, 3.1_

  - [x] 4.4 Implement `postTweet(text, mediaUrls)`
    - Call `POST https://api.twitter.com/2/tweets` with JSON body `{ text }` (media attachment is noted as optional/future)
    - Use `buildOAuth1Header` for authentication
    - Return `{ id }` on success or `{ error: "..." }` on failure
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 5. Checkpoint — Ensure API client and SheetUtils build without errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Extractor module
  - [x] 6.1 Implement `extractTweetId(url)`
    - Parse URLs matching `https://twitter.com/{user}/status/{id}` and `https://x.com/{user}/status/{id}` using a regex
    - Return the numeric ID string, or `null` if the URL does not match
    - _Requirements: 2.2_

  - [ ]* 6.2 Write property test for `extractTweetId` round-trip (Property 7)
    - **Property 7: Tweet ID extraction round-trip**
    - Generate random valid user handles and numeric tweet IDs; construct both `twitter.com` and `x.com` URL forms; assert `extractTweetId(url)` returns the original ID string
    - **Validates: Requirements 2.2**
    - `// Feature: tweet-resource-extractor, Property 7: extractTweetId recovers the exact ID from any valid tweet URL`

  - [x] 6.3 Implement `processExtractionRow(sheet, rowIndex, tweetUrl)`
    - Call `extractTweetId`; on null result write error values to columns B and D
    - Call `fetchTweetData`; on error write error values to columns B and D per the error handling table
    - On success write comma-separated `mediaUrls` (or `"none"`) to column B and `text` to column D
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_

  - [ ]* 6.4 Write property test for resource link round-trip (Property 3)
    - **Property 3: Resource link output round-trips cleanly**
    - Generate random arrays of one or more non-empty URL strings; pass through the comma-join formatting; assert splitting on `","` and trimming returns the original array
    - **Validates: Requirements 2.3**
    - `// Feature: tweet-resource-extractor, Property 3: comma-separated resource link output round-trips cleanly`

  - [x] 6.5 Implement `extractResources()`
    - Call `getOrCreateTweetSheet()`; iterate all rows via `getAllRows`; for each row where column A is non-empty and column B is empty, call `processExtractionRow`
    - _Requirements: 2.1, 2.6, 3.4_

  - [ ]* 6.6 Write property test for extractor eligible row selection (Property 1)
    - **Property 1: Extractor processes exactly the eligible rows**
    - Generate random sheet states with varying column A and B values; run `extractResources()` with a mocked API; assert the set of rows written to equals exactly the set with non-empty A and empty B
    - **Validates: Requirements 2.1, 2.6, 3.4**
    - `// Feature: tweet-resource-extractor, Property 1: extractor writes to exactly the rows with non-empty A and empty B`

  - [ ]* 6.7 Write property test for extractor data preservation (Property 2)
    - **Property 2: Extractor preserves previously extracted data**
    - Generate random sheet states where some rows already have non-empty column B; run `extractResources()` with a mocked API; assert all pre-existing column B values are unchanged after the run
    - **Validates: Requirements 2.6**
    - `// Feature: tweet-resource-extractor, Property 2: extractor never overwrites existing column B values`

- [x] 7. Checkpoint — Ensure extractor tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Scheduler module
  - [x] 8.1 Implement `matchesCronField(field, value, min, max)`
    - Handle `*` (wildcard), specific numeric values, ranges `A-B`, step expressions `*/N`, and comma-separated lists
    - Return `false` for any out-of-range or unparseable token
    - _Requirements: 4.6_

  - [x] 8.2 Implement `parseCronExpression(cronStr)`
    - Split on whitespace; validate exactly 5 fields; return `{ minute, hour, dom, month, dow }` or `null` if invalid
    - _Requirements: 4.5, 4.6_

  - [x] 8.3 Implement `matchesCronSchedule(parsedCron, date)`
    - Extract minute, hour, day-of-month, month (1-based), and day-of-week from the `Date` object
    - Call `matchesCronField` for each of the five fields; return `true` only if all five match
    - _Requirements: 4.2, 4.6_

  - [ ]* 8.4 Write property test for cron field matching correctness (Property 4)
    - **Property 4: Cron field matching is correct for all valid inputs and syntax forms**
    - Generate random valid 5-field cron expressions and random `Date` values; compute expected match using a reference implementation; assert `matchesCronSchedule` always agrees
    - **Validates: Requirements 4.2, 4.6**
    - `// Feature: tweet-resource-extractor, Property 4: matchesCronSchedule agrees with reference for all valid cron/date pairs`

  - [x] 8.5 Implement `runScheduler()`
    - Call `getOrCreateTweetSheet()`; iterate all rows; skip rows where column E is empty or column C is `"sent"`
    - For each eligible row, call `parseCronExpression`; on null result write `"error: invalid cron expression"` to column C
    - On valid parse, call `matchesCronSchedule` with `new Date()`; if matching, invoke `postTweetForRow`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 8.6 Write property test for scheduler eligible row selection (Property 5)
    - **Property 5: Scheduler processes exactly the eligible rows and skips sent rows**
    - Generate random sheet states with varying column C and E values; run `runScheduler()` with a mocked poster and fixed time; assert the poster is called for exactly the rows with non-empty E and non-`"sent"` C
    - **Validates: Requirements 4.1, 5.5**
    - `// Feature: tweet-resource-extractor, Property 5: scheduler evaluates exactly rows with non-empty cron and non-sent status`

  - [ ]* 8.7 Write property test for malformed cron error handling (Property 9)
    - **Property 9: Malformed cron expressions always produce an error status**
    - Generate strings that are not valid 5-field cron expressions (wrong field count, out-of-range values, invalid characters); run the scheduler with these in column E; assert column C always starts with `"error:"` and the poster is never called
    - **Validates: Requirements 4.5**
    - `// Feature: tweet-resource-extractor, Property 9: malformed cron always writes error to column C and never invokes poster`

- [x] 9. Implement Poster module
  - [x] 9.1 Implement `postTweetForRow(sheet, rowIndex, title, resourceLinks)`
    - If `title` is empty, write `"error: no tweet text"` to column C and return
    - Parse `resourceLinks` (split on `","`, trim, filter out `"none"`) to get media URL array
    - Call `postTweet(title, mediaUrls)`; on success write `"sent"` to column C; on error write `"error: {message}"` to column C
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 9.2 Write property test for poster API invocation correctness (Property 6)
    - **Property 6: Poster invocation uses the correct text and media from the row**
    - Generate random tweet texts and resource link lists; invoke `postTweetForRow()` with a mocked API; assert the API was called with the exact text and the correct media URLs
    - **Validates: Requirements 5.1, 5.2**
    - `// Feature: tweet-resource-extractor, Property 6: poster calls API with exact text and media from the row`

  - [ ]* 9.3 Write property test for API error propagation (Property 10)
    - **Property 10: API errors are propagated to column C status**
    - Generate random HTTP error status codes and error message strings; mock the Twitter/X API to return these errors; invoke the poster; assert column C always starts with `"error:"` and never equals `"sent"`
    - **Validates: Requirements 5.4**
    - `// Feature: tweet-resource-extractor, Property 10: any API error results in error status in column C, never sent`

- [x] 10. Checkpoint — Ensure all module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire all modules together and expose entry points
  - [x] 11.1 Create `Main.gs` (or ensure top-level functions are accessible) exposing `extractResources`, `runScheduler`, `setupTriggers`, and `removeTriggers` as callable entry points
    - `extractResources` delegates to the Extractor module
    - `runScheduler` delegates to the Scheduler module
    - `setupTriggers` and `removeTriggers` delegate to the Trigger Manager
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 11.2 Write integration tests for end-to-end extraction and scheduling flows
    - Test that a sheet row with a valid tweet URL in column A and empty column B gets columns B and D populated after `extractResources()` runs (using a mocked API client)
    - Test that a row with a matching cron expression and non-"sent" status gets `"sent"` written to column C after `runScheduler()` runs (using a mocked poster and fixed time)
    - _Requirements: 2.1, 2.3, 3.2, 4.1, 4.3, 5.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties using `fast-check` with a minimum of 100 iterations each
- Unit tests validate specific examples and edge cases
- All `UrlFetchApp` calls must use `muteHttpExceptions: true` to handle HTTP errors gracefully
- Credentials are never hardcoded; always read from `PropertiesService.getScriptProperties()`
