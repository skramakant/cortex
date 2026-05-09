# Tweet Resource Extractor & Scheduler

A Google Apps Script project that extracts media resources (images and videos) from tweet URLs, schedules tweet posting via cron expressions, and provides a browser-based web app UI for managing submissions — all backed by a Google Sheet.

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Sheet Schema](#sheet-schema)
- [Prerequisites](#prerequisites)
- [Step 1 — Get Twitter/X API Credentials](#step-1--get-twitterx-api-credentials)
- [Step 2 — Create the Google Sheet](#step-2--create-the-google-sheet)
- [Step 3 — Set Up the Apps Script Project](#step-3--set-up-the-apps-script-project)
- [Step 4 — Copy the Source Files](#step-4--copy-the-source-files)
- [Step 5 — Store API Credentials](#step-5--store-api-credentials)
- [Step 6 — Run Initial Setup](#step-6--run-initial-setup)
- [Step 7 — Deploy the Web App](#step-7--deploy-the-web-app)
- [Step 8 — Enable the Scheduler Trigger](#step-8--enable-the-scheduler-trigger)
- [Using the Web App](#using-the-web-app)
- [Using the Sheet Directly](#using-the-sheet-directly)
- [Cron Expression Reference](#cron-expression-reference)
- [Manual Functions](#manual-functions)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Resource Extraction** — Paste a tweet URL; the script fetches the tweet text and all image/video URLs via the X API v2 and writes them to the sheet.
- **Immediate Posting** — "Send Now" extracts and posts the tweet in one click from the web app.
- **Scheduled Posting** — Enter a 5-field cron expression; the built-in scheduler evaluates it every minute and posts at the right time.
- **Web App UI** — A clean browser form for submitting tweet links without touching the spreadsheet.
- **Status Tracking** — The `status` column is updated to `sent` on success or `error: ...` on failure.

---

## Project Structure

```
appscript/
├── appsscript.json      # Manifest — OAuth scopes, runtime version
├── Constants.gs         # Column index constants (COL_TWEET_LINK, etc.)
├── SheetUtils.gs        # Sheet creation, row reading, cell writing
├── Extractor.gs         # Tweet URL parsing, media/title extraction
├── Scheduler.gs         # Cron parsing, schedule matching, scheduler loop
├── Poster.gs            # Tweet posting with status tracking
├── TwitterClient.gs     # OAuth 1.0a signing, X API v2 HTTP calls
├── TriggerManager.gs    # Idempotent trigger setup/teardown
├── Main.gs              # Documented entry point (no code, docs only)
├── WebApp.gs            # doGet / doPost / handleFormSubmit
├── Index.html           # Browser form UI (named Index to avoid conflict with WebApp.gs)
└── tests/               # Node.js unit tests (Jest + fast-check)
```

---

## Sheet Schema

The script reads from and writes to a sheet named **`tweet`** with the following columns:

| Column | Header | Description |
|--------|--------|-------------|
| A | `tweet link` | The source tweet URL (twitter.com or x.com) |
| B | `resource links` | Comma-separated image/video URLs extracted from the tweet, or `none`, or `error: ...` |
| C | `status` | Blank (pending), `sent`, or `error: ...` |
| D | `title` | The tweet text scraped from the API |
| E | `cron expression` | 5-field cron string for scheduled posting, or blank for no scheduling |

---

## Prerequisites

- A Google account with access to Google Sheets and Google Apps Script
- A Twitter/X developer account with an approved app (OAuth 1.0a credentials)
- Node.js ≥ 18 (only needed to run the local test suite)

---

## Step 1 — Get Twitter/X API Credentials

1. Go to [developer.twitter.com](https://developer.twitter.com) and sign in.
2. Create a new project and app (or use an existing one).
3. Under **Keys and Tokens**, generate:
   - **API Key** (Consumer Key)
   - **API Key Secret** (Consumer Secret)
   - **Access Token**
   - **Access Token Secret**
4. Make sure the app has **Read and Write** permissions (required for posting tweets).
5. Keep these four values — you will need them in Step 5.

> **Note:** The X API v2 `POST /2/tweets` endpoint requires at minimum the **Free** tier. The `GET /2/tweets/:id` endpoint (used for extraction) also requires API access. Check [developer.twitter.com/en/docs/twitter-api/getting-started/about-twitter-api](https://developer.twitter.com/en/docs/twitter-api/getting-started/about-twitter-api) for current tier requirements.

---

## Step 2 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it anything you like (e.g. **Tweet Scheduler**).
3. The script will automatically create a sheet tab named `tweet` with the correct headers the first time it runs. You do not need to create it manually.
4. Note the spreadsheet URL — you will need it when binding the Apps Script project.

---

## Step 3 — Set Up the Apps Script Project

### Option A — Bound to the spreadsheet (recommended)

1. Open your Google Sheet.
2. Click **Extensions → Apps Script**.
3. A new Apps Script project opens, already bound to your spreadsheet. This is the recommended approach because `SpreadsheetApp.getActiveSpreadsheet()` works automatically.

### Option B — Standalone project

1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. In `SheetUtils.gs`, replace `SpreadsheetApp.getActiveSpreadsheet()` with `SpreadsheetApp.openById('YOUR_SPREADSHEET_ID')` and supply your spreadsheet ID from the URL.

---

## Step 4 — Copy the Source Files

You need to copy each `.gs` file and the `.html` file into the Apps Script editor.

### Using the Apps Script editor UI

1. In the Apps Script editor, you will see a default file called `Code.gs`. You can rename it or delete it.
2. For each file in the `appscript/` directory, create a new script file:
   - Click the **+** button next to "Files" in the left sidebar.
   - Select **Script** (for `.gs` files) or **HTML** (for `.html` files).
   - Name it exactly as shown (without the extension): `Constants`, `SheetUtils`, `Extractor`, `Scheduler`, `Poster`, `TwitterClient`, `TriggerManager`, `Main`, `WebApp`.
   - Paste the contents of the corresponding file.
3. For `Index.html`:
   - Click **+** → **HTML**.
   - Name it `Index`.
   - Paste the contents of `appscript/Index.html`.
4. Replace the contents of `appsscript.json`:
   - Click **Project Settings** (gear icon) → check **Show "appsscript.json" manifest file in editor**.
   - Click `appsscript.json` in the file list.
   - Replace its contents with the contents of `appscript/appsscript.json`.

### Using clasp (command-line, advanced)

If you have [clasp](https://github.com/google/clasp) installed:

```bash
# Install clasp globally
npm install -g @google/clasp

# Log in to your Google account
clasp login

# Clone an existing Apps Script project (get the Script ID from Project Settings)
clasp clone <SCRIPT_ID>

# Or create a new project bound to a spreadsheet
clasp create --type sheets --title "Tweet Scheduler" --parentId <SPREADSHEET_ID>

# Copy the source files into the project directory, then push
cp appscript/*.gs .
cp appscript/*.html .
cp appscript/appsscript.json .
clasp push
```

---

## Step 5 — Store API Credentials

The script reads Twitter/X credentials from **Script Properties** — they are never stored in source code.

1. In the Apps Script editor, click **Project Settings** (gear icon ⚙️) in the left sidebar.
2. Scroll down to **Script Properties**.
3. Click **Add script property** and add each of the following four properties:

| Property Key | Value |
|---|---|
| `TWITTER_API_KEY` | Your OAuth Consumer Key |
| `TWITTER_API_SECRET` | Your OAuth Consumer Secret |
| `TWITTER_ACCESS_TOKEN` | Your OAuth Access Token |
| `TWITTER_ACCESS_TOKEN_SECRET` | Your OAuth Access Token Secret |

4. Click **Save script properties**.

> **Security:** Script Properties are stored encrypted by Google and are not visible in the source code or version history. Never paste credentials directly into `.gs` files.

---

## Step 6 — Run Initial Setup

Before deploying, verify the script can access the spreadsheet and the API credentials are correct.

1. In the Apps Script editor, select the function `getOrCreateTweetSheet` from the function dropdown at the top.
2. Click **Run**.
3. On first run, Google will ask you to **Review permissions** — click through and grant access to Sheets and external requests.
4. Check your spreadsheet — a `tweet` sheet tab should appear with the five column headers.

If you see an authorization error, make sure you are running the script as the same Google account that owns the spreadsheet.

---

## Step 7 — Deploy the Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Fill in the deployment settings:
   - **Description:** `Tweet Scheduler v1` (or any label)
   - **Execute as:** `Me` (the script runs with your credentials)
   - **Who has access:** `Anyone` (or `Anyone within [your organisation]` for restricted access)
4. Click **Deploy**.
5. Google will ask you to **Authorize access** — click through and grant the required permissions (Sheets, external requests, script triggers, web app deploy).
6. After authorization, you will see a **Web app URL** like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
7. Copy this URL — this is the address of your Tweet Scheduler web app.
8. Open the URL in a browser to verify the form loads correctly.

> **Important:** Every time you modify the source code and want the changes to take effect in the deployed web app, you must create a **new deployment** (Deploy → New deployment) or **manage deployments** and update the existing one. The URL changes with each new deployment unless you use a versioned deployment.

### Updating an existing deployment

1. Click **Deploy → Manage deployments**.
2. Find your existing deployment and click the pencil ✏️ icon.
3. Under **Version**, select **New version**.
4. Click **Deploy**.
5. The URL remains the same.

---

## Step 8 — Enable the Scheduler Trigger

The scheduler evaluates cron expressions every minute. To enable it:

1. In the Apps Script editor, select the function `setupTriggers` from the function dropdown.
2. Click **Run**.
3. This installs a time-based trigger that calls `runScheduler()` every minute.
4. To verify: click **Triggers** (clock icon ⏰) in the left sidebar — you should see a trigger for `runScheduler` with type "Time-driven, Every minute".

> **Note:** The trigger runs as long as the Apps Script project is active. Google Apps Script triggers have a [daily execution quota](https://developers.google.com/apps-script/guides/services/quotas) — running every minute uses approximately 1,440 executions per day.

To disable the scheduler:

1. Select `removeTriggers` from the function dropdown and click **Run**, or
2. Go to **Triggers** in the sidebar and delete the trigger manually.

---

## Using the Web App

Open the web app URL in any browser.

### Send Now

1. Paste a tweet URL (e.g. `https://x.com/user/status/1234567890`) into the **Tweet Link** field.
2. Select **Send Now** (the default).
3. Click **Submit**.
4. The script will:
   - Write the tweet link to the sheet.
   - Call the X API to extract the tweet text and media URLs.
   - Post the tweet immediately via the X API.
   - Show a green success message or a red error message.

### Schedule with Cron Expression

1. Paste a tweet URL into the **Tweet Link** field.
2. Select **Schedule with Cron Expression**.
3. Enter a cron expression in the field that appears (e.g. `0 9 * * 1` for every Monday at 9:00 AM).
4. Click **Submit**.
5. The tweet link and cron expression are saved to the sheet. The scheduler trigger will post the tweet when the schedule matches.

---

## Using the Sheet Directly

You can also add rows to the `tweet` sheet manually:

1. Open the spreadsheet and go to the `tweet` tab.
2. In column A, paste a tweet URL.
3. Leave columns B, C, D blank.
4. In column E, enter a cron expression (or leave blank to skip scheduling).
5. To extract resources immediately, run `extractResources()` from the Apps Script editor.
6. To post immediately, run `runScheduler()` (it will only post rows whose cron expression matches the current time).

---

## Cron Expression Reference

The scheduler uses standard 5-field cron syntax:

```
┌───────────── minute (0–59)
│ ┌─────────── hour (0–23)
│ │ ┌───────── day of month (1–31)
│ │ │ ┌─────── month (1–12)
│ │ │ │ ┌───── day of week (0–6, Sunday=0)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `30 18 * * 5` | Every Friday at 6:30 PM |
| `0 12 1 * *` | 1st of every month at noon |
| `*/5 * * * *` | Every 5 minutes |
| `0 9,17 * * 1-5` | Weekdays at 9:00 AM and 5:00 PM |

**Supported syntax:**
- `*` — wildcard (matches any value)
- `5` — specific value
- `1-5` — range
- `*/5` — step (every N units)
- `1,3,5` — comma-separated list

---

## Manual Functions

These functions can be run directly from the Apps Script editor (select from the dropdown → Run):

| Function | Description |
|---|---|
| `extractResources()` | Scans all rows with a tweet link but no resource links, fetches media/title from the X API, and writes results to columns B and D. |
| `runScheduler()` | Evaluates cron expressions for all pending rows and posts tweets whose schedule matches the current time. |
| `setupTriggers()` | Installs a per-minute time-based trigger for `runScheduler`. Safe to call multiple times — will not create duplicates. |
| `removeTriggers()` | Removes all triggers installed by `setupTriggers`. |
| `getOrCreateTweetSheet()` | Creates the `tweet` sheet with headers if it doesn't exist. |

---

## Running Tests

The test suite uses Jest and fast-check, running in Node.js with mocked GAS globals.

```bash
# Install dependencies
cd appscript/tests
npm install

# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only property-based tests
npm run test:property
```

The suite covers 222 tests across 7 modules: SheetUtils, Extractor, Scheduler, Poster, TwitterClient, TriggerManager, and WebApp.

---

## Troubleshooting

### "Missing Twitter API credentials in PropertiesService"
Script Properties are not set. Follow [Step 5](#step-5--store-api-credentials) to add all four credential keys.

### "Tweet link must be a valid twitter.com or x.com status URL."
The URL must match the pattern `https://twitter.com/{user}/status/{id}` or `https://x.com/{user}/status/{id}`. Profile URLs, search URLs, and shortened links are not supported.

### "error: HTTP 401" in the resource links or status column
Your API credentials are invalid or expired. Regenerate your Access Token and Access Token Secret on the Twitter developer portal and update Script Properties.

### "error: HTTP 403" when posting
Your app does not have **Write** permissions. Go to the Twitter developer portal → your app → **User authentication settings** → set App permissions to **Read and Write**.

### The web app shows a blank page or "Script function not found: doGet"
Make sure `WebApp.gs` is present in the project and the deployment is up to date. Create a new deployment after any code changes.

### Cron expression is not triggering
- Verify the trigger is installed: Apps Script editor → **Triggers** (clock icon) → confirm `runScheduler` appears.
- Check that column C (status) is not already `sent` — the scheduler skips sent rows.
- Verify the cron expression is valid using the [Cron Expression Reference](#cron-expression-reference).
- The scheduler runs every minute but only posts when the current minute matches the expression. For `0 9 * * 1`, it will only fire at exactly 9:00 AM on Monday.

### Authorization errors on first run
When running a function for the first time, Google shows an authorization dialog. Click **Review permissions → Advanced → Go to [project name] (unsafe) → Allow**. This is expected for any new Apps Script project.
