/**
 * api.js — All GAS API calls.
 * https://script.google.com/macros/s/AKfycby6JpQtIcv2CkRoYJ1gu6Ow8L9SEo4xtsD9RDzoZdJSFT18CVVq8CepjlYjNdU6_kSt9Q/exec and 6237dcaf6cff0628deb88e76c9b22331dd525096ea394218cb4ddf54f9c6d259 are replaced at build time by inject-env.js.
 * GAS_URL and API_KEY are stored as GitHub Secrets and injected by GitHub Actions.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycby6JpQtIcv2CkRoYJ1gu6Ow8L9SEo4xtsD9RDzoZdJSFT18CVVq8CepjlYjNdU6_kSt9Q/exec';
const API_KEY = '6237dcaf6cff0628deb88e76c9b22331dd525096ea394218cb4ddf54f9c6d259';

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
