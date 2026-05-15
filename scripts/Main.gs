/**
 * Main.gs — Entry Point
 *
 * This file serves as the documented entry point for the Tweet Resource Extractor
 * Google Apps Script. In GAS, all .gs files share a single global scope, so the
 * functions defined in Extractor.gs, Scheduler.gs, and TriggerManager.gs are
 * already globally accessible. This file documents them in one place and explains
 * how to configure the script.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP: Storing credentials in PropertiesService
 * ─────────────────────────────────────────────────────────────────────────────
 * Before running any function that calls the Twitter/X API, store your OAuth 1.0a
 * credentials in the script's Properties Service:
 *
 *   1. Open the Apps Script editor (Extensions → Apps Script).
 *   2. Click "Project Settings" (gear icon) → "Script Properties".
 *   3. Add the following key/value pairs:
 *
 *      Key                         Value
 *      ──────────────────────────  ──────────────────────────────────────────
 *      TWITTER_API_KEY             Your OAuth consumer key
 *      TWITTER_API_SECRET          Your OAuth consumer secret
 *      TWITTER_ACCESS_TOKEN        Your OAuth user access token
 *      TWITTER_ACCESS_TOKEN_SECRET Your OAuth user access token secret
 *
 * Credentials are read at runtime via PropertiesService.getScriptProperties()
 * and are never stored in source code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PUBLIC ENTRY POINTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The four functions below can be run manually from the Apps Script editor
 * (select the function name in the toolbar and click "Run"), or invoked
 * programmatically by time-based triggers.
 *
 *   extractResources()  — Scans the "tweet" sheet for rows where column A
 *                         (tweet link) is non-empty and column B (resource links)
 *                         is empty, then fetches tweet text and media URLs from
 *                         the Twitter/X API and writes them to columns D and B.
 *                         Delegates to: Extractor.gs
 *                         Requirements: 7.1
 *
 *   runScheduler()      — Scans the "tweet" sheet for rows where column E
 *                         (cron expression) is non-empty and column C (status)
 *                         is not "sent", evaluates each cron expression against
 *                         the current time, and posts matching tweets via the
 *                         Twitter/X API.
 *                         Delegates to: Scheduler.gs
 *                         Requirements: 7.2
 *
 *   setupTriggers()     — Installs a time-based ScriptApp trigger that calls
 *                         runScheduler() every minute. Safe to call multiple
 *                         times — will not create duplicate triggers.
 *                         Delegates to: TriggerManager.gs
 *                         Requirements: 7.3
 *
 *   removeTriggers()    — Removes all time-based triggers installed by
 *                         setupTriggers() (those whose handler is runScheduler).
 *                         Delegates to: TriggerManager.gs
 *                         Requirements: 7.4
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE: Because GAS shares a single global scope across all .gs files in a
 * project, the functions above are already globally callable without any
 * re-declaration here. This file exists solely as documentation and a
 * single-file reference for operators and contributors.
 */
