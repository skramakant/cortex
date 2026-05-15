/**
 * api.js — All GAS API calls.
 * __GAS_URL__ and __API_KEY__ are replaced at build time by inject-env.js.
 * GAS_URL and API_KEY are stored as GitHub Secrets and injected by GitHub Actions.
 */

const GAS_URL = '__GAS_URL__';
const API_KEY = '__API_KEY__';

/**
 * Low-level POST to the GAS backend.
 * Automatically includes the API key in every request body.
 * @param {Object} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function gasPost(params) {
  let response;
  try {
    response = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...params, apiKey: API_KEY }),
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
