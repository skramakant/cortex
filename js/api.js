/**
 * api.js — All GAS API calls.
 * https://script.google.com/macros/s/AKfycbxJt-KCEPHqPJvCC8mOVzLIAJCs0Ps2idjOpPQSBZN11Cu7UVKtP3VDDkgDiL8vMqse5g/exec and 6237dcaf6cff0628deb88e76c9b22331dd525096ea394218cb4ddf54f9c6d259 are replaced at build time by inject-env.js.
 * GAS_URL and API_KEY are stored as GitHub Secrets and injected by GitHub Actions.
 *
 * CORS note: Content-Type: text/plain is a "simple request" — no preflight.
 * GAS receives the raw body in e.postData.contents and we JSON.parse it there.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxJt-KCEPHqPJvCC8mOVzLIAJCs0Ps2idjOpPQSBZN11Cu7UVKtP3VDDkgDiL8vMqse5g/exec';
const API_KEY = '6237dcaf6cff0628deb88e76c9b22331dd525096ea394218cb4ddf54f9c6d259';

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

/**
 * Verifies a password against the APP_PASSWORD script property.
 * @param {string} password
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function verifyPassword(password) {
  return gasPost({ action: 'verifyPassword', password: password });
}

/**
 * Fetches all pending auto-tweet items from the auto_tweets sheet.
 * @returns {Promise<{success: boolean, items?: Array<Object>, error?: string}>}
 */
async function listPending() {
  return gasPost({ action: 'listPending' });
}

/**
 * Approves a pending item — posts the tweet and marks it as approved.
 * @param {number} rowIndex    1-based sheet row number
 * @param {string} tweetDraft  Final tweet text (may have been edited by user)
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function approveTweet(rowIndex, tweetDraft) {
  return gasPost({ action: 'approveTweet', rowIndex: rowIndex, tweetDraft: tweetDraft });
}

/**
 * Rejects a pending item — marks it as rejected, no tweet posted.
 * @param {number} rowIndex
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function rejectTweet(rowIndex) {
  return gasPost({ action: 'rejectTweet', rowIndex: rowIndex });
}

/**
 * Marks a pending row as approved without posting to X.
 * Used with the Copy & Approve flow where the user posts manually.
 * @param {number} rowIndex
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function markApproved(rowIndex) {
  return gasPost({ action: 'markApproved', rowIndex: rowIndex });
}

/**
 * Fetches all feeds from the rss_feeds sheet.
 * @returns {Promise<{success: boolean, feeds?: Array<Object>, error?: string}>}
 */
async function listFeeds() {
  return gasPost({ action: 'listFeeds' });
}

/**
 * Enables or disables a feed by row index.
 * @param {number} rowIndex
 * @param {boolean} enabled
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function toggleFeed(rowIndex, enabled) {
  return gasPost({ action: 'toggleFeed', rowIndex: rowIndex, enabled: enabled });
}

/**
 * Adds a new feed to the rss_feeds sheet.
 * @param {string} name
 * @param {string} url
 * @param {string} description
 * @param {boolean} skipDescription
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function addFeed(name, url, description, skipDescription) {
  return gasPost({ action: 'addFeed', name: name, url: url,
                   description: description, skipDescription: skipDescription });
}

/**
 * Deletes a feed row from the rss_feeds sheet.
 * @param {number} rowIndex
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function deleteFeed(rowIndex) {
  return gasPost({ action: 'deleteFeed', rowIndex: rowIndex });
}

/**
 * Sends the latest pending tweets to Groq for engagement analysis.
 * Returns approve/reject recommendations with scores and reasons.
 * @returns {Promise<{success: boolean, results?: Array<Object>, error?: string}>}
 */
async function analyzeEngagement() {
  return gasPost({ action: 'analyzeEngagement' });
}

/**
 * Updates config columns of an existing feed row.
 * @param {number} rowIndex
 * @param {{ maxNew, fetchFullArticle, tweetLength, promptStyle }} data
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function updateFeed(rowIndex, data) {
  return gasPost({ action: 'updateFeed', rowIndex: rowIndex, ...data });
}

/**
 * Analyses a YouTube transcript with Groq and returns suggested clip timestamps.
 * Does NOT save anything — user reviews before committing.
 * @param {string} videoTitle
 * @param {string} transcript
 * @returns {Promise<{success: boolean, clips?: Array, error?: string}>}
 */
async function analyseTranscript(videoTitle, transcript) {
  return gasPost({ action: 'analyseTranscript', videoTitle, transcript });
}

/**
 * Saves selected clips to the clips sheet with status = 'pending'.
 * @param {string} videoUrl
 * @param {string} videoTitle
 * @param {Array<{clipTitle, start, end, summary}>} clips
 * @returns {Promise<{success: boolean, message?: string, rowIndices?: number[], error?: string}>}
 */
async function saveClips(videoUrl, videoTitle, clips) {
  return gasPost({ action: 'saveClips', videoUrl, videoTitle, clips });
}

/**
 * Returns all clips from the clips sheet.
 * @returns {Promise<{success: boolean, clips?: Array, error?: string}>}
 */
async function listClips() {
  return gasPost({ action: 'listClips' });
}

/**
 * Deletes a clip row from the clips sheet.
 * @param {number} rowIndex
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function deleteClip(rowIndex) {
  return gasPost({ action: 'deleteClip', rowIndex });
}
