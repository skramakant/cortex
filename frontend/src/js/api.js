/**
 * api.js — Source module
 * All communication with the Google Apps Script backend.
 *
 * __GAS_URL__ is replaced with the actual deployed GAS web app URL
 * by the inject-env.js build script (GitHub Actions injects GAS_URL secret).
 *
 * All functions return a Promise that resolves to:
 *   { success: true,  message: string }   on success
 *   { success: false, error: string }     on failure
 */

const GAS_URL = '__GAS_URL__';

/**
 * Low-level POST to the GAS backend.
 * @param {Object} params  - form parameters to send as JSON body
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function gasPost(params) {
  const response = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });

  if (!response.ok) {
    return { success: false, error: `Network error: HTTP ${response.status}` };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { success: false, error: 'Invalid JSON response from server.' };
  }

  return data;
}

/**
 * Fetches tweet preview data (text + media URLs) without writing to the sheet.
 * @param {string} tweetUrl
 * @returns {Promise<{success: boolean, text?: string, mediaUrls?: string[], error?: string}>}
 */
export async function fetchTweetPreview(tweetUrl) {
  return gasPost({ action: 'fetchPreview', tweetUrl });
}

/**
 * Submits a cloned tweet (from an existing tweet URL) for immediate posting
 * or cron-based scheduling.
 * @param {{ tweetLink: string, scheduleMode: string, title: string, resourceLinks: string, cronExpression?: string, maxCount?: number }} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function submitCloneTweet(params) {
  return gasPost({ action: 'submitTweet', ...params });
}

/**
 * Submits a brand-new tweet (no source URL) for immediate posting
 * or cron-based scheduling.
 * @param {{ title: string, resourceLinks: string, scheduleMode: string, cronExpression?: string, maxCount?: number }} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function submitNewTweet(params) {
  return gasPost({ action: 'newTweet', ...params });
}
