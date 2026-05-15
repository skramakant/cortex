# Implementation Plan: Tweet Web App UI

## Overview

Static frontend on GitHub Pages + GAS JSON API backend. The frontend uses Tailwind CSS v3, Inter font, and vanilla JS. It communicates with the GAS backend via `fetch()` POST requests. The GAS URL is injected at build time via GitHub Actions. Two workflows: Clone Tweet (fetch → preview/edit → post/schedule) and New Tweet (compose → post/schedule).

## Tasks

- [x] 1. Set up frontend project structure
  - Created `frontend/` directory with `public/`, `src/`, `scripts/` subdirectories
  - Created `frontend/package.json` with Tailwind CSS v3 as the only dev dependency
  - Created `frontend/tailwind.config.js` scanning `public/**/*.html` and `public/js/**/*.js`
  - Created `frontend/src/css/input.css` with Tailwind directives
  - Created `frontend/scripts/inject-env.js` — replaces `__GAS_URL__` in `public/js/api.js` using `process.env.GAS_URL`
  - _Requirements: 1.1, 1.3, 1.5, 12.1_

- [x] 2. Create `frontend/public/js/api.js`
  - Defines `const GAS_URL = '__GAS_URL__'` (replaced at build time)
  - Implements `gasPost(params)` — `fetch()` POST with JSON body; handles network errors and non-OK responses
  - Implements `fetchTweetPreview(tweetUrl)` → `gasPost({ action: 'fetchPreview', tweetUrl })`
  - Implements `submitCloneTweet(params)` → `gasPost({ action: 'submitTweet', ...params })`
  - Implements `submitNewTweet(params)` → `gasPost({ action: 'newTweet', ...params })`
  - _Requirements: 1.4, 1.5, 11.1, 11.2, 11.3_

- [x] 3. Create `frontend/public/js/utils.js`
  - Implements `validateTweetLink(url)` — returns null or error string
  - Implements `validateCronExpression(cron)` — 5-field format check; returns null or error string
  - Implements `showFeedback(el, message, type)` — applies Tailwind green/red classes
  - Implements `hideFeedback(el)` — adds `hidden` class
  - Implements `updateCharCount(textarea, counter, limit=280)` — updates text and applies red class over limit
  - Implements `getRadioValue(name)` — returns checked radio value
  - _Requirements: 3.2, 3.3, 5.4, 6.5, 6.6, 9.2, 9.4_

- [x] 4. Create `frontend/public/index.html`
  - Two-tab layout: "Clone Tweet" and "New Tweet" tabs with Tailwind styling and Inter font
  - Clone Tweet tab:
    - Step 1 (fetch panel): tweet URL input, schedule mode radios, cron group (hidden by default), "Fetch Tweet" button
    - Step 2 (preview panel, hidden by default): editable textarea, char counter, media preview section, "Back" + "Post Tweet" buttons
    - Loading indicator and feedback area
  - New Tweet tab (hidden by default):
    - Tweet text textarea with char counter, optional resource link input, schedule mode radios, cron group, "Post Tweet" button
    - Loading indicator and feedback area
  - All element IDs match the spec (see design.md ID table)
  - Loads `js/utils.js`, `js/api.js`, `js/app.js` as plain scripts
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 3.1, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2_

- [x] 5. Create `frontend/public/js/app.js`
  - Implements `switchTab(tab)` — toggles `hidden` class and active tab button styles
  - Clone tab IIFE:
    - Radio change → toggle `cloneCronGroup` visibility
    - Fetch button → validate URL → call `fetchTweetPreview()` → populate preview panel or show error
    - Back button → hide preview panel, show fetch panel
    - Submit button → validate title + cron → call `submitCloneTweet()` → show feedback, reset on success
  - New tweet IIFE:
    - Radio change → toggle `newCronGroup` visibility
    - Submit button → validate title + cron → call `submitNewTweet()` → show feedback, reset on success
  - `DOMContentLoaded` → wire tab buttons, call `switchTab('clone')`
  - _Requirements: 2.3, 2.4, 3.1–3.6, 4.1–4.6, 5.1–5.4, 6.1–6.7, 7.1–7.4, 8.1–8.3, 9.1–9.5, 10.1–10.3_

- [x] 6. Update `scripts/WebApp.gs` for static frontend architecture
  - Removed `doGet()` — frontend is now on GitHub Pages, not served by GAS
  - Implemented `doPost(e)` — reads `e.postData.contents` as JSON; routes by `action` field; wraps in try/catch
  - Implemented `fetchTweetPreview(tweetUrl)` — validates URL, calls `extractTweetId` + `fetchTweetData`, returns preview without writing to sheet
  - Implemented `handleFormSubmit(params)` — clone tweet flow: validates tweetLink + title + cron; writes 7-column row; posts (Send Now) or schedules (Cron)
  - Implemented `handleNewTweet(params)` — new tweet flow: validates title + cron; writes 7-column row with empty tweetLink; posts or schedules
  - Implemented `_validateTweetLink(url)` and `_getNewRowIndex(sheet)` helpers
  - Implemented `diagnoseCreds()` — verifies credentials, sheet access, and test API call
  - _Requirements: 11.1–11.7_

- [x] 7. Create GitHub Actions workflow (`.github/workflows/deploy.yml`)
  - Trigger: push to `main` and `workflow_dispatch`
  - Steps: checkout → Node 20 setup → `npm ci` → `npm run build:css` → `npm run build:js` (injects `GAS_URL` secret) → deploy `frontend/public/` to `gh-pages` branch via `peaceiris/actions-gh-pages@v4`
  - _Requirements: 12.1–12.4_

- [x] 8. Update unit tests for new architecture (`tests/unit/webApp.test.js`)
  - Updated path references: `scripts/WebApp.gs`, `scripts/Scheduler.gs`, `scripts/Constants.gs`, `frontend/public/index.html`
  - Updated `handleFormSubmit` tests to include `title` field (required in new flow)
  - Removed `processExtractionRow` mock (no longer called by `handleFormSubmit`)
  - Updated `doPost` tests to use `e.postData.contents` JSON body instead of `e.parameter`
  - Replaced `doGet` test with "doGet is not defined" assertion
  - Updated HTML structure tests to match new tab-based element IDs (`cloneFeedback`, `newFeedback`, `cloneCronGroup`, `newCronGroup`, etc.)
  - All 228 tests passing
  - _Requirements: 11.1–11.7_

- [x] 9. Update `tests/unit/sheetUtils.test.js` for 7-column schema
  - Updated `EXPECTED_HEADERS` to include "max count" and "post count"
  - Updated header length assertion from 5 to 7
  - Updated all test data rows to include `maxCount` and `postCount` columns
  - _Requirements: 1.2, 1.3_

- [x] 10. Update `tests/unit/scheduler.test.js` for max count support
  - Added `COL_MAX_COUNT: 6` and `COL_POST_COUNT: 7` to the vm context
  - Updated `makeRow()` helper to include `maxCount` and `postCount` columns
  - Updated assertions to account for `COL_POST_COUNT` write after successful post
  - _Requirements: 4a.1–4a.4_

- [x] 11. Update `tests/unit/twitterClient.test.js` for `api.x.com` URL
  - Replaced all `https://api.twitter.com/2/tweets` references with `https://api.x.com/2/tweets`
  - _Requirements: 5.1_

- [x] 12. Final checkpoint — All tests pass
  - `cd tests && npm test` → 228 passed, 0 failed

## Notes

- `doGet` was intentionally removed — the frontend is a static site on GitHub Pages
- `doPost` reads `e.postData.contents` (JSON body), not `e.parameter` (form fields)
- `handleFormSubmit` no longer calls `processExtractionRow` — the frontend pre-fetches tweet data via `fetchTweetPreview` and sends `title` + `resourceLinks` directly
- The sheet schema is 7 columns (A–G); `COL_MAX_COUNT` (F) and `COL_POST_COUNT` (G) were added for repeat scheduling
- API base URL is `https://api.x.com` (not `https://api.twitter.com`)
- `frontend/public/css/app.css` is generated by CI and should not be manually edited
- The `GAS_URL` secret must be set in GitHub repository Settings → Secrets → Actions before the first deploy
- Tests live in `tests/` (not `appscript/tests/`) and reference source files in `scripts/`
