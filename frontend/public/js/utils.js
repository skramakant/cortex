/**
 * utils.js — Shared utilities and validation helpers.
 */

/**
 * Validates a Twitter/X tweet URL.
 * @param {string} url
 * @returns {string|null}  null if valid; error message string if invalid
 */
function validateTweetLink(url) {
  if (!url || !url.trim()) {
    return 'Tweet link is required.';
  }
  const pattern = /https?:\/\/(twitter\.com|x\.com)\/[^/]+\/status\/\d+/;
  if (!pattern.test(url)) {
    return 'Tweet link must be a valid twitter.com or x.com status URL.';
  }
  return null;
}

/**
 * Validates a 5-field cron expression (client-side lightweight check).
 * @param {string} cron
 * @returns {string|null}  null if valid; error message string if invalid
 */
function validateCronExpression(cron) {
  if (!cron || !cron.trim()) {
    return 'Cron expression is required.';
  }
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return 'Cron expression must have exactly 5 fields: minute hour dom month dow.';
  }
  return null;
}

/**
 * Shows a feedback message in the given element.
 * @param {HTMLElement} el
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showFeedback(el, message, type) {
  el.textContent = message;
  el.className = [
    'mt-4 px-4 py-3 rounded text-sm font-medium border',
    type === 'success'
      ? 'text-green-800 bg-green-50 border-green-300'
      : 'text-red-800 bg-red-50 border-red-300',
  ].join(' ');
  el.classList.remove('hidden');
}

/**
 * Hides a feedback element.
 * @param {HTMLElement} el
 */
function hideFeedback(el) {
  el.classList.add('hidden');
  el.textContent = '';
}

/**
 * Updates a character counter element.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} counter
 * @param {number} [limit=280]
 */
function updateCharCount(textarea, counter, limit = 280) {
  const len = textarea.value.length;
  counter.textContent = `${len} / ${limit}`;
  if (len > limit) {
    counter.classList.add('text-red-500');
    counter.classList.remove('text-gray-400');
  } else {
    counter.classList.remove('text-red-500');
    counter.classList.add('text-gray-400');
  }
}

/**
 * Returns the value of the checked radio button in a group.
 * @param {string} name
 * @returns {string}
 */
function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}

/**
 * Escapes a string for safe insertion into HTML.
 * @param {any} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
