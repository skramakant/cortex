/**
 * api.js — All GAS API calls.
 * __GAS_URL__ and __API_KEY__ are replaced at build time by inject-env.js.
 * GAS_URL and API_KEY are stored as GitHub Secrets and injected by GitHub Actions.
 *
 * CORS note: Content-Type: text/plain is a "simple request" — no preflight.
 * GAS receives the raw body in e.postData.contents and we JSON.parse it there.
 */

const GAS_URL = '__GAS_URL__';
const API_KEY = '__API_KEY__';

/**
 * Low-level POST to the GAS backend.
 * Uses Content-Type: text/plain to avoid CORS preflight.
 * GAS reads the body via e.postData.contents and JSON.parses it.
 * @param {Object} params
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function gasPost(params) {
  let response;
  try {
    response = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify({ ...params, apiKey: API_KEY }),
    });
  } catch (err) {
    return { success: false, error: 'Network error: ' + err.message };
  }

  if (!response.ok) {
    return { success: false, error: 'Network error: HTTP ' + response.status };
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

/**
 * Fetches all tweet rows from the sheet.
 * @returns {Promise<{success: boolean, tweets?: Array<Object>, error?: string}>}
 */
async function listTweets() {
  return gasPost({ action: 'listTweets' });
}

/**
 * Updates editable fields of an existing tweet row.
 * @param {number} rowIndex  1-based sheet row number
 * @param {{ title?: string, resourceLinks?: string, cron?: string, maxCount?: number, status?: string }} data
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function updateTweet(rowIndex, data) {
  return gasPost({ action: 'updateTweet', rowIndex: rowIndex, ...data });
}

/**
 * Deletes a tweet row by its 1-based sheet row number.
 * @param {number} rowIndex
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function deleteTweet(rowIndex) {
  return gasPost({ action: 'deleteTweet', rowIndex: rowIndex });
}
