/**
 * api.js — All GAS API calls.
 * __GAS_URL__ is replaced with the actual GAS web app URL at build time
 * by the GitHub Actions workflow (GAS_URL secret → inject-env.js).
 */

const GAS_URL = '__GAS_URL__';

/**
 * Low-level POST to the GAS backend.
 * @param {Object} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function gasPost(params) {
  let response;
  try {
    response = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
  } catch (err) {
    return { success: false, error: 'Network error: ' + err.message };
  }

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
async function fetchTweetPreview(tweetUrl) {
  return gasPost({ action: 'fetchPreview', tweetUrl });
}

/**
 * Submits a cloned tweet for immediate posting or cron-based scheduling.
 * @param {Object} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function submitCloneTweet(params) {
  return gasPost({ action: 'submitTweet', ...params });
}

/**
 * Submits a brand-new tweet for immediate posting or cron-based scheduling.
 * @param {Object} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function submitNewTweet(params) {
  return gasPost({ action: 'newTweet', ...params });
}
