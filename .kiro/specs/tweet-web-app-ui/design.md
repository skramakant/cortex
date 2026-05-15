# Design Document: Tweet Web App UI

## Overview

The frontend is a static site hosted on GitHub Pages. It communicates with the Google Apps Script backend via `fetch()` POST requests — there is no `google.script.run`, no `doGet`, and no server-side HTML rendering. The GAS backend exposes a JSON API via `doPost()` with action-based routing.

The implementation consists of:
- **`frontend/public/index.html`** — the HTML page with Tailwind CSS classes and Inter font
- **`frontend/public/js/api.js`** — all `fetch()` calls to the GAS backend (`__GAS_URL__` replaced at build time)
- **`frontend/public/js/utils.js`** — shared validation helpers and UI utilities
- **`frontend/public/js/app.js`** — tab switching, form logic, event handlers
- **`frontend/src/css/input.css`** — Tailwind CSS source
- **`frontend/scripts/inject-env.js`** — Node.js build script that replaces `__GAS_URL__`
- **`scripts/WebApp.gs`** — GAS backend: `doPost`, `fetchTweetPreview`, `handleFormSubmit`, `handleNewTweet`

---

## Architecture

```
GitHub Pages (static)                    Google Apps Script
frontend/public/
  index.html                             scripts/WebApp.gs
  js/api.js  ──── fetch() POST ────────► doPost(e)
  js/utils.js                              │
  js/app.js                                ├─ action=fetchPreview ──► fetchTweetPreview()
                                           │                              │
                                           │                         fetchTweetData()
                                           │                         (TwitterClient.gs)
                                           │
                                           ├─ action=submitTweet ───► handleFormSubmit()
                                           │                              │
                                           │                         writeCell() × 7 cols
                                           │                         postTweetForRow()
                                           │                         (Poster.gs)
                                           │
                                           └─ action=newTweet ──────► handleNewTweet()
                                                                          │
                                                                     writeCell() × 7 cols
                                                                     postTweetForRow()
                                                                     (Poster.gs)

GitHub Actions (.github/workflows/deploy.yml)
  1. npm ci (frontend/)
  2. tailwindcss build → public/css/app.css
  3. inject-env.js: replace __GAS_URL__ in public/js/api.js
  4. deploy frontend/public/ → gh-pages branch
```

---

## Frontend Components

### `frontend/public/index.html`

Two-tab layout using Tailwind utility classes and Inter font.

**Tab structure:**
```
<div class="tabs">
  <button id="tabCloneBtn">Clone Tweet</button>
  <button id="tabNewBtn">New Tweet</button>
</div>

<div id="tabClone">          ← Clone Tweet tab
  <div id="cloneFetchPanel"> ← Step 1: URL input + schedule mode
  <div id="clonePreviewPanel" class="hidden"> ← Step 2: edit + post
  <div id="cloneFeedback" class="hidden">

<div id="tabNew" class="hidden">  ← New Tweet tab
  ...textarea, resource link, schedule mode...
  <div id="newFeedback" class="hidden">
```

**Key element IDs:**

| Element | ID |
|---|---|
| Clone tab tweet URL input | `cloneTweetLink` |
| Clone tab fetch button | `cloneFetchBtn` |
| Clone tab preview panel | `clonePreviewPanel` |
| Clone tab editable textarea | `cloneEditTitle` |
| Clone tab char counter | `cloneCharCount` |
| Clone tab media preview | `cloneMediaPreview` |
| Clone tab media URL list | `cloneMediaUrls` |
| Clone tab media section | `cloneMediaSection` |
| Clone tab back button | `cloneBackBtn` |
| Clone tab submit button | `cloneSubmitBtn` |
| Clone tab schedule radios | `name="cloneSchedule"` (values: `now`, `cron`) |
| Clone tab cron group | `cloneCronGroup` |
| Clone tab cron input | `cloneCron` |
| Clone tab max count input | `cloneMaxCount` |
| Clone tab loading indicator | `cloneLoading` |
| Clone tab feedback | `cloneFeedback` |
| New tweet textarea | `newTitle` |
| New tweet char counter | `newCharCount` |
| New tweet resource link | `newResourceLink` |
| New tweet schedule radios | `name="newSchedule"` (values: `now`, `cron`) |
| New tweet cron group | `newCronGroup` |
| New tweet cron input | `newCron` |
| New tweet max count input | `newMaxCount` |
| New tweet submit button | `newSubmitBtn` |
| New tweet loading indicator | `newLoading` |
| New tweet feedback | `newFeedback` |

### `frontend/public/js/api.js`

All GAS API calls. The constant `GAS_URL = '__GAS_URL__'` is replaced at build time.

```javascript
// Low-level POST
async function gasPost(params)

// Actions
async function fetchTweetPreview(tweetUrl)
  // → gasPost({ action: 'fetchPreview', tweetUrl })

async function submitCloneTweet(params)
  // → gasPost({ action: 'submitTweet', ...params })

async function submitNewTweet(params)
  // → gasPost({ action: 'newTweet', ...params })
```

All functions return `Promise<{ success: boolean, message?: string, error?: string }>`.
`fetchTweetPreview` additionally returns `{ text?: string, mediaUrls?: string[] }` on success.

### `frontend/public/js/utils.js`

Pure utility functions with no DOM side effects (except `showFeedback`/`hideFeedback`).

```javascript
function validateTweetLink(url)        // → null | error string
function validateCronExpression(cron)  // → null | error string (5-field check)
function showFeedback(el, message, type)  // type: 'success' | 'error'
function hideFeedback(el)
function updateCharCount(textarea, counter, limit=280)
function getRadioValue(name)           // → checked radio value
```

### `frontend/public/js/app.js`

Main UI logic. Runs as a plain script (no bundler). Uses IIFEs for tab isolation.

```javascript
function switchTab(tab)   // 'clone' | 'new'

(function initCloneTab() {
  // Fetch button → fetchTweetPreview() → show preview panel
  // Back button → hide preview, show fetch panel
  // Submit button → submitCloneTweet() → show feedback, reset on success
})();

(function initNewTab() {
  // Submit button → submitNewTweet() → show feedback, reset on success
})();

document.addEventListener('DOMContentLoaded', function() {
  // Wire tab buttons, call switchTab('clone')
});
```

---

## Backend Components (`scripts/WebApp.gs`)

### `doPost(e)`

Reads `e.postData.contents` as JSON. Routes by `action` field. Wraps in try/catch.

```javascript
function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  if      (params.action === 'fetchPreview')  result = fetchTweetPreview(params.tweetUrl);
  else if (params.action === 'submitTweet')   result = handleFormSubmit(params);
  else if (params.action === 'newTweet')      result = handleNewTweet(params);
  else result = { success: false, error: 'Unknown action: ' + params.action };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### `fetchTweetPreview(tweetUrl)`

Validates URL → `extractTweetId` → `fetchTweetData` → returns `{ success, text, mediaUrls }`. Does not write to sheet.

### `handleFormSubmit(params)`

Clone tweet flow. Input: `{ tweetLink, title, resourceLinks, scheduleMode, cronExpression?, maxCount? }`.

Validation order:
1. `_validateTweetLink(tweetLink)` — returns error if invalid
2. `title` non-empty check
3. If `scheduleMode === 'cron'`: `cronExpression` non-empty + `parseCronExpression()` check

On valid input: writes 7-column row to sheet, then:
- `scheduleMode === 'now'`: calls `postTweetForRow`; reads col C; returns success or error
- `scheduleMode === 'cron'`: returns `{ success: true, message: "Tweet scheduled successfully." }`

### `handleNewTweet(params)`

New tweet flow. Input: `{ title, resourceLinks, scheduleMode, cronExpression?, maxCount? }`.

Same validation as `handleFormSubmit` except no `tweetLink` validation. Writes empty string to `COL_TWEET_LINK`.

---

## Data Models

### Sheet Row Written (7 columns)

| Col | Constant | Clone tweet value | New tweet value |
|-----|----------|-------------------|-----------------|
| A | `COL_TWEET_LINK` | validated tweet URL | `""` |
| B | `COL_RESOURCE_LINKS` | `resourceLinks` param | `resourceLinks` param |
| C | `COL_STATUS` | `""` | `""` |
| D | `COL_TITLE` | `title` param | `title` param |
| E | `COL_CRON` | `""` or cron string | `""` or cron string |
| F | `COL_MAX_COUNT` | `maxCount` param (default 0) | `maxCount` param (default 0) |
| G | `COL_POST_COUNT` | `0` | `0` |

### API Request Payloads

```javascript
// fetchPreview
{ action: "fetchPreview", tweetUrl: string }

// submitTweet (clone)
{
  action: "submitTweet",
  tweetLink: string,
  title: string,
  resourceLinks: string,   // comma-separated URLs or ""
  scheduleMode: "now" | "cron",
  cronExpression: string,  // "" when scheduleMode === "now"
  maxCount: number         // 0 = unlimited
}

// newTweet
{
  action: "newTweet",
  title: string,
  resourceLinks: string,
  scheduleMode: "now" | "cron",
  cronExpression: string,
  maxCount: number
}
```

### API Response Shape

```javascript
// All actions on failure
{ success: false, error: string }

// submitTweet / newTweet on success
{ success: true, message: "Tweet sent successfully." }      // Send Now
{ success: true, message: "Tweet scheduled successfully." } // Cron

// fetchPreview on success
{ success: true, text: string, mediaUrls: string[] }
```

### Validation Rules

**Tweet Link (clone tab only):**
- Non-empty after trim
- Matches `/https?:\/\/(twitter\.com|x\.com)\/[^\/]+\/status\/\d+/`

**Title (both tabs):**
- Non-empty after trim
- Error: `"Tweet text is required."`

**Cron Expression (when scheduleMode === 'cron'):**
- Non-empty after trim → `"Cron expression is required."`
- `parseCronExpression()` returns non-null → `"Cron expression is invalid. Use 5-field format: minute hour dom month dow."`

---

## Build and CI/CD

### Tailwind Build

```
frontend/src/css/input.css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
        │
        ▼ tailwindcss --minify
frontend/public/css/app.css   (committed by CI, not manually)
```

`tailwind.config.js` scans `frontend/public/**/*.html` and `frontend/public/js/**/*.js` for class names.

### Secret Injection

`frontend/scripts/inject-env.js` reads `process.env.GAS_URL` and replaces all occurrences of `__GAS_URL__` in `frontend/public/js/api.js`. Exits with code 1 if `GAS_URL` is not set.

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

Trigger: push to `main` or `workflow_dispatch`.

Steps:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20, cache npm)
3. `npm ci` in `frontend/`
4. `npm run build:css` — Tailwind minified build
5. `npm run build:js` — inject `GAS_URL` secret
6. `peaceiris/actions-gh-pages@v4` — deploy `frontend/public/` to `gh-pages` branch

---

## Correctness Properties

### Property 1: Invalid tweet URL is rejected without writing to the sheet

*For any* string submitted as `tweetLink` that is empty, whitespace-only, or does not match the URL pattern, `handleFormSubmit` SHALL return `{ success: false, error }` and SHALL NOT write any row to the sheet.

**Validates: Requirements 3.2, 3.3, 11.6**

### Property 2: Valid tweet URL is written to column A

*For any* valid tweet URL, `handleFormSubmit` SHALL write that exact URL to `COL_TWEET_LINK` of the new row.

**Validates: Requirements 3.5 (implicit), 11.6**

### Property 3: "Send Now" writes empty string to column E

*For any* valid submission with `scheduleMode = "now"`, the value written to `COL_CRON` SHALL be `""`.

**Validates: Requirements 6.3**

### Property 4: Valid cron expression is written to column E

*For any* valid cron expression submitted with `scheduleMode = "cron"`, the value written to `COL_CRON` SHALL equal the submitted string exactly.

**Validates: Requirements 6.4, 8.1**

### Property 5: Invalid or empty cron expression is rejected without writing to the sheet

*For any* empty or invalid cron string with `scheduleMode = "cron"`, `handleFormSubmit` SHALL return `{ success: false, error }` and SHALL NOT write any row.

**Validates: Requirements 6.5, 6.6**

### Property 6: Posting error is propagated in the response

*For any* error string written to `COL_STATUS` by `postTweetForRow`, `handleFormSubmit` SHALL return `{ success: false, error }` containing that error detail.

**Validates: Requirements 7.3, 7.5**

### Property 7: Cron mode never calls postTweetForRow

*For any* valid `(tweetLink, title, cronExpression)` submitted with `scheduleMode = "cron"`, `handleFormSubmit` SHALL NOT call `postTweetForRow`.

**Validates: Requirements 8.1**

### Property 8: Response object always has the required shape

*For any* input to `handleFormSubmit` or `handleNewTweet`, the returned object SHALL be JSON-serialisable and SHALL contain `success` (boolean) plus exactly one of `message` (when `success === true`) or `error` (when `success === false`).

**Validates: Requirements 11.4, 11.5**

### Property 9: Empty title is rejected without writing to the sheet

*For any* submission where `title` is empty or whitespace-only, both `handleFormSubmit` and `handleNewTweet` SHALL return `{ success: false, error: "Tweet text is required." }` and SHALL NOT write any row.

**Validates: Requirements 5.4, 11.6**

---

## Error Handling

### Client-Side (before calling backend)

| Condition | Behaviour |
|---|---|
| Empty tweet URL (clone tab) | Show error in `cloneFeedback`; do not call backend |
| Invalid tweet URL (clone tab) | Show error in `cloneFeedback`; do not call backend |
| Empty tweet text | Show error in feedback area; do not call backend |
| Empty cron expression (cron mode) | Show error in feedback area; do not call backend |
| Invalid cron format (cron mode) | Show error in feedback area; do not call backend |
| Network error from `fetch()` | Show `"Network error: " + err.message` in feedback area |

### Server-Side (WebApp.gs)

| Condition | Response |
|---|---|
| `tweetLink` empty/invalid | `{ success: false, error: "Tweet link is required." }` or URL error |
| `title` empty | `{ success: false, error: "Tweet text is required." }` |
| `cronExpression` empty (cron mode) | `{ success: false, error: "Cron expression is required." }` |
| `cronExpression` invalid (cron mode) | `{ success: false, error: "Cron expression is invalid. Use 5-field format: minute hour dom month dow." }` |
| `postTweetForRow` writes error to col C | `{ success: false, error: <col C value> }` |
| Unknown `action` | `{ success: false, error: "Unknown action: <action>" }` |
| Any uncaught exception | `{ success: false, error: "Server error: " + e.message }` |

---

## Testing Strategy

### Test File: `tests/unit/webApp.test.js`

Loads `scripts/Constants.gs`, `scripts/Scheduler.gs` (for `parseCronExpression`), and `scripts/WebApp.gs` into a Node.js `vm` context with mocked GAS globals.

**Mocked functions:**
- `getOrCreateTweetSheet()` — returns a tracking mock sheet
- `writeCell()` — records calls to the mock sheet
- `postTweetForRow()` — configurable to write "sent" or "error: ..." to col C
- `parseCronExpression()` — uses the real implementation from `Scheduler.gs`

**Test coverage:**

| Test group | What is tested |
|---|---|
| `_validateTweetLink()` | Valid URLs, empty string, whitespace, non-matching URLs |
| `handleFormSubmit() — validation` | Empty link, invalid link, empty cron, invalid cron, empty title |
| `handleFormSubmit() — Send Now` | Success path, posting error propagation, empty title |
| `handleFormSubmit() — Cron` | Success path, message content, Send Now vs Cron messages differ |
| `doPost()` | JSON body parsing, action routing, ContentService output |
| `doGet()` | Confirmed not defined (frontend is on GitHub Pages) |
| HTML structure | Tab IDs, radio names/values, cron group IDs, feedback IDs |

Total webApp tests: part of the 228-test suite.
