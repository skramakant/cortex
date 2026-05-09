# Implementation Plan: Tweet Web App UI

## Overview

Add a Google Apps Script Web App to the existing tweet-resource-extractor project. The implementation creates two new files — `WebApp.gs` (server-side handlers) and `WebApp.html` (the HTML form) — and a new test file `appscript/tests/unit/webApp.test.js`. No existing files are modified.

## Tasks

- [x] 1. Create `WebApp.gs` with `doGet`, `doPost`, and `handleFormSubmit`
  - Create `appscript/WebApp.gs`
  - Implement `doGet(e)`: returns `HtmlService.createTemplateFromFile('WebApp').evaluate().setTitle('Tweet Scheduler')`
  - Implement `doPost(e)`: reads `e.parameter.tweetLink`, `e.parameter.scheduleMode`, `e.parameter.cronExpression`; delegates to `handleFormSubmit()`; returns `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)`
  - Implement `_validateTweetLink(url)`: returns `null` if valid, or an error string if empty/whitespace/non-matching; pattern: `/https?:\/\/(twitter\.com|x\.com)\/[^\/]+\/status\/\d+/`
  - Implement `_getNewRowIndex(sheet)`: returns `sheet.getLastRow() + 1`
  - Implement `handleFormSubmit(params)`: validates `tweetLink` via `_validateTweetLink`; if `scheduleMode === 'cron'` validates `cronExpression` via `parseCronExpression()`; writes new row (cols A and E) via `getOrCreateTweetSheet()` and `writeCell()`; if `scheduleMode === 'now'` calls `processExtractionRow()`, reads col B, calls `postTweetForRow()`, reads col C; wraps entire body in try/catch; returns `{ success, message? | error? }`
  - Error messages must match the table in the design: "Tweet link is required.", "Tweet link must be a valid twitter.com or x.com status URL.", "Cron expression is required.", "Cron expression is invalid. Use 5-field format: minute hour dom month dow."
  - _Requirements: 1.1, 2.2, 2.3, 2.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 1.1 Write property test for invalid tweet URL rejection (Property 1)
    - **Property 1: Invalid tweet URL is rejected without writing to the sheet**
    - **Validates: Requirements 2.2, 2.3**
    - Use `fast-check` arbitraries to generate empty strings, whitespace-only strings, and strings that do not match the tweet URL pattern
    - Assert `handleFormSubmit` returns `{ success: false, error: <string> }` and `writeCell` is never called

  - [ ]* 1.2 Write property test for valid tweet URL written to column A (Property 2)
    - **Property 2: Valid tweet URL is written to column A**
    - **Validates: Requirements 2.4, 6.1**
    - Generate valid tweet URLs matching the required pattern
    - Assert the exact URL is passed to `writeCell` for `COL_TWEET_LINK`

  - [ ]* 1.3 Write property test for response shape invariant (Property 9)
    - **Property 9: Response object always has the required shape**
    - **Validates: Requirements 9.4**
    - Generate arbitrary inputs (valid and invalid, both schedule modes)
    - Assert every response is JSON-serialisable and contains `success` (boolean) plus exactly one of `message` (when `success === true`) or `error` (when `success === false`)

  - [ ]* 1.4 Write property test for validation error field identification (Property 10)
    - **Property 10: Validation error message identifies the invalid field**
    - **Validates: Requirements 7.3**
    - For invalid URL inputs, assert `error` contains "tweet link"
    - For invalid cron inputs, assert `error` contains "cron expression"

- [x] 2. Implement schedule mode and cron validation in `handleFormSubmit`
  - Ensure "Send Now" (`scheduleMode === 'now'`) writes `""` to col E
  - Ensure "Cron Expression" (`scheduleMode === 'cron'`) writes the cron string to col E
  - Ensure invalid/empty cron expressions return `{ success: false, error: <message> }` without writing to the sheet
  - _Requirements: 3.5, 3.6, 4.1, 4.2, 4.3, 6.1_

  - [ ]* 2.1 Write property test for "Send Now" writes empty col E (Property 3)
    - **Property 3: "Send Now" mode writes empty string to column E**
    - **Validates: Requirements 3.5**
    - Generate valid tweet URLs with `scheduleMode = "now"`
    - Assert `writeCell` is called with `COL_CRON` and `""`

  - [ ]* 2.2 Write property test for valid cron written to col E (Property 4)
    - **Property 4: Valid cron expression is written to column E**
    - **Validates: Requirements 3.6, 4.3, 6.1**
    - Generate valid cron strings (those `parseCronExpression()` returns non-null for)
    - Assert `writeCell` is called with `COL_CRON` and the exact submitted cron string

  - [ ]* 2.3 Write property test for invalid cron rejection (Property 5)
    - **Property 5: Invalid or empty cron expression is rejected without writing to the sheet**
    - **Validates: Requirements 4.1, 4.2**
    - Generate empty, whitespace-only, and structurally invalid cron strings
    - Assert `handleFormSubmit` returns `{ success: false, error: <string> }` and `writeCell` is never called

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement "Send Now" extraction and posting flow
  - After writing the new row, call `processExtractionRow(sheet, rowIndex, tweetLink)`
  - Read col B back from the sheet; if value starts with `"error:"`, return `{ success: false, error: <col B value> }` without calling `postTweetForRow()`
  - Otherwise call `postTweetForRow(sheet, rowIndex, title, resourceLinks)` using values from cols D and B
  - Read col C back; if starts with `"error:"`, return `{ success: false, error: <col C value> }`
  - If col C is `"sent"`, return `{ success: true, message: "Tweet sent successfully." }`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.1 Write property test for extraction error gating posting (Property 6)
    - **Property 6: Extraction error prevents posting; extraction success allows posting**
    - **Validates: Requirements 5.2, 5.3**
    - Configure mock `processExtractionRow` to write `"error: ..."` to col B
    - Assert `handleFormSubmit` returns `{ success: false }` and `postTweetForRow` is never called
    - Also assert the converse: when col B does not start with `"error:"`, `postTweetForRow` is called

  - [ ]* 4.2 Write property test for posting error propagated in response (Property 7)
    - **Property 7: Posting error is propagated in the response**
    - **Validates: Requirements 5.5**
    - Configure mock `postTweetForRow` to write `"error: <detail>"` to col C
    - Assert `handleFormSubmit` returns `{ success: false, error: <string> }` containing the error detail

  - [ ]* 4.3 Write property test for runtime error detail in response (Property 11)
    - **Property 11: Runtime error detail from extraction/posting appears in the response**
    - **Validates: Requirements 7.4**
    - Generate arbitrary error strings written to col B or col C
    - Assert the error detail appears verbatim or as a substring in the `error` field of the response

- [x] 5. Implement "Cron Expression" row write and success response
  - After writing cols A and E for cron mode, return `{ success: true, message: "Tweet scheduled successfully." }` immediately
  - Do NOT call `processExtractionRow()` or `postTweetForRow()`
  - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 5.1 Write property test for cron mode skips extraction/posting (Property 8)
    - **Property 8: Cron mode never calls extraction or posting**
    - **Validates: Requirements 6.3**
    - Generate valid `(tweetLink, cronExpression)` pairs with `scheduleMode = "cron"`
    - Assert `processExtractionRow` and `postTweetForRow` are never called

- [x] 6. Create `WebApp.html` with form, client-side JS, and feedback area
  - Create `appscript/WebApp.html`
  - Include a labelled `<input type="text" name="tweetLink">` field
  - Include two `<input type="radio" name="scheduleMode">` buttons with values `now` and `cron`; default `now` checked
  - Include a labelled `<input type="text" name="cronExpression">` field, hidden by default
  - Toggle cron field visibility on radio change
  - On form submit: prevent default, collect `{ tweetLink, scheduleMode, cronExpression }`, call `google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFailure).handleFormSubmit(params)`
  - `onSuccess(result)`: show `result.message` or `result.error` in `#feedback` with appropriate CSS class; if `result.success`, clear tweet link input and reset schedule mode to `"now"` and hide cron field
  - `onFailure(err)`: show error in `#feedback` with `error` CSS class; retain all form values
  - `#feedback` div hidden on page load; shown after any submission
  - Apply basic CSS: success messages in green, error messages in red
  - _Requirements: 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 3.4, 7.1, 7.2, 7.5, 8.1, 8.2, 8.3_

  - [ ]* 6.1 Write property test for successful submission triggers form reset (Property 12)
    - **Property 12: Successful submission triggers form reset**
    - **Validates: Requirements 8.2**
    - Simulate `onSuccess` being called with `{ success: true, message: "..." }`
    - Assert tweet link input is cleared and schedule mode is reset to `"now"`

  - [ ]* 6.2 Write property test for failed submission retains form values (Property 13)
    - **Property 13: Failed submission retains form values**
    - **Validates: Requirements 8.3**
    - Simulate `onFailure` being called with an error object
    - Assert tweet link and cron expression inputs are not cleared

- [x] 7. Write example-based unit tests for `WebApp.gs` and `WebApp.html`
  - Create `appscript/tests/unit/webApp.test.js`
  - Mock `getOrCreateTweetSheet`, `writeCell`, `processExtractionRow`, `postTweetForRow`, `parseCronExpression` (use real implementation for `parseCronExpression`)
  - Example test: `doGet` returns an object with `setTitle` called with `"Tweet Scheduler"` — _Requirements: 1.3_
  - Example test: radio buttons present with values `now` and `cron`; `now` is default — _Requirements: 3.1, 3.2_
  - Example test: `postTweetForRow` writes `"sent"` to col C → `handleFormSubmit` returns `{ success: true }` — _Requirements: 5.4_
  - Example test: cron success response message contains `"scheduled"` — _Requirements: 6.2_
  - Example test: "Send Now" and "Cron Expression" success messages are different strings — _Requirements: 7.2_
  - Example test: `doPost` reads `tweetLink`, `scheduleMode`, `cronExpression` from `e.parameter` — _Requirements: 9.2, 9.3_
  - Example test: `doPost` returns a `ContentService` text output with MIME type `APPLICATION_JSON` — _Requirements: 9.5_
  - _Requirements: 1.3, 3.1, 3.2, 5.4, 6.2, 7.2, 9.2, 9.3, 9.5_

- [x] 8. Update `appsscript.json` to add the `webapp` OAuth scope
  - Add `"https://www.googleapis.com/auth/script.webapp.deploy"` to the `oauthScopes` array in `appscript/appsscript.json` if not already present
  - _Requirements: 1.4_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Run `npm run test:unit` in `appscript/tests/`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The implementation language is Google Apps Script (JavaScript/ES5-compatible)
- `fast-check` is already installed as a dev dependency in `appscript/tests/package.json`
- `parseCronExpression` is a pure function in `Scheduler.gs` and can be used directly in tests without mocking
- No existing `.gs` files are modified; all new code goes into `WebApp.gs` and `WebApp.html`
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
