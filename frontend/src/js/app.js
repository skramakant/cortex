/**
 * app.js — Main UI logic.
 * Handles tab switching, form interactions, and wires up API calls.
 */

import { fetchTweetPreview, submitCloneTweet, submitNewTweet } from './api.js';
import {
  validateTweetLink,
  validateCronExpression,
  showFeedback,
  hideFeedback,
  updateCharCount,
  getRadioValue,
} from './utils.js';

// ============================================================
// Tab switching
// ============================================================

function switchTab(tab) {
  document.getElementById('tabClone').classList.toggle('hidden', tab !== 'clone');
  document.getElementById('tabNew').classList.toggle('hidden', tab !== 'new');
  document.getElementById('tabCloneBtn').dataset.active = tab === 'clone' ? 'true' : 'false';
  document.getElementById('tabNewBtn').dataset.active   = tab === 'new'   ? 'true' : 'false';

  // Update tab button styles
  ['tabCloneBtn', 'tabNewBtn'].forEach(id => {
    const btn = document.getElementById(id);
    const isActive = btn.dataset.active === 'true';
    btn.classList.toggle('border-b-2',        isActive);
    btn.classList.toggle('border-twitter-blue', isActive);
    btn.classList.toggle('text-twitter-blue',   isActive);
    btn.classList.toggle('text-gray-500',       !isActive);
  });
}

// ============================================================
// Clone Tweet tab
// ============================================================

function initCloneTab() {
  let fetchedMediaUrls = [];

  const fetchPanel   = document.getElementById('cloneFetchPanel');
  const previewPanel = document.getElementById('clonePreviewPanel');
  const feedbackEl   = document.getElementById('cloneFeedback');
  const loadingEl    = document.getElementById('cloneLoading');
  const fetchBtn     = document.getElementById('cloneFetchBtn');
  const backBtn      = document.getElementById('cloneBackBtn');
  const submitBtn    = document.getElementById('cloneSubmitBtn');
  const titleArea    = document.getElementById('cloneEditTitle');
  const charCount    = document.getElementById('cloneCharCount');
  const cronGroup    = document.getElementById('cloneCronGroup');

  // Toggle cron field visibility
  document.querySelectorAll('input[name="cloneSchedule"]').forEach(radio => {
    radio.addEventListener('change', () => {
      cronGroup.classList.toggle('hidden', radio.value !== 'cron' || !radio.checked);
    });
  });

  titleArea.addEventListener('input', () => updateCharCount(titleArea, charCount));

  // Fetch button — preview tweet
  fetchBtn.addEventListener('click', async () => {
    const tweetLink = document.getElementById('cloneTweetLink').value.trim();
    const linkError = validateTweetLink(tweetLink);
    if (linkError) { showFeedback(feedbackEl, linkError, 'error'); return; }

    fetchBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.classList.remove('hidden');

    try {
      const result = await fetchTweetPreview(tweetLink);
      if (!result.success) {
        showFeedback(feedbackEl, result.error, 'error');
        return;
      }

      titleArea.value = result.text || '';
      updateCharCount(titleArea, charCount);
      fetchedMediaUrls = result.mediaUrls || [];

      // Render media preview
      const mediaPreview = document.getElementById('cloneMediaPreview');
      const mediaUrlsDiv = document.getElementById('cloneMediaUrls');
      mediaPreview.innerHTML = '';
      mediaUrlsDiv.innerHTML = '';

      if (fetchedMediaUrls.length > 0) {
        fetchedMediaUrls.forEach(url => {
          const img = document.createElement('img');
          img.src = url;
          img.alt = 'media';
          img.className = 'w-28 h-20 object-cover rounded border border-gray-200';
          mediaPreview.appendChild(img);

          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = url;
          a.className = 'block text-xs text-twitter-blue hover:underline break-all';
          mediaUrlsDiv.appendChild(a);
        });
        document.getElementById('cloneMediaSection').classList.remove('hidden');
      } else {
        document.getElementById('cloneMediaSection').classList.add('hidden');
      }

      fetchPanel.classList.add('hidden');
      previewPanel.classList.remove('hidden');
    } catch (err) {
      showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
    } finally {
      fetchBtn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    previewPanel.classList.add('hidden');
    fetchPanel.classList.remove('hidden');
    hideFeedback(feedbackEl);
  });

  // Submit button — post or schedule
  submitBtn.addEventListener('click', async () => {
    const title = titleArea.value.trim();
    if (!title) { showFeedback(feedbackEl, 'Tweet text is required.', 'error'); return; }

    const scheduleMode   = getRadioValue('cloneSchedule');
    const cronExpression = document.getElementById('cloneCron').value.trim();

    if (scheduleMode === 'cron') {
      const cronError = validateCronExpression(cronExpression);
      if (cronError) { showFeedback(feedbackEl, cronError, 'error'); return; }
    }

    submitBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.textContent = scheduleMode === 'now' ? 'Posting tweet…' : 'Scheduling tweet…';
    loadingEl.classList.remove('hidden');

    try {
      const params = {
        tweetLink:      document.getElementById('cloneTweetLink').value.trim(),
        scheduleMode,
        cronExpression,
        title,
        resourceLinks:  fetchedMediaUrls.join(','),
        maxCount:       scheduleMode === 'cron'
          ? (parseInt(document.getElementById('cloneMaxCount').value.trim(), 10) || 0)
          : 0,
      };

      const result = await submitCloneTweet(params);

      if (result.success) {
        showFeedback(feedbackEl, result.message, 'success');
        // Reset to step 1
        previewPanel.classList.add('hidden');
        fetchPanel.classList.remove('hidden');
        document.getElementById('cloneTweetLink').value = '';
        document.getElementById('cloneCron').value = '';
        document.getElementById('cloneMaxCount').value = '';
        document.querySelector('input[name="cloneSchedule"][value="now"]').checked = true;
        cronGroup.classList.add('hidden');
        fetchedMediaUrls = [];
      } else {
        showFeedback(feedbackEl, result.error, 'error');
      }
    } catch (err) {
      showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });
}

// ============================================================
// New Tweet tab
// ============================================================

function initNewTab() {
  const feedbackEl = document.getElementById('newFeedback');
  const loadingEl  = document.getElementById('newLoading');
  const submitBtn  = document.getElementById('newSubmitBtn');
  const titleArea  = document.getElementById('newTitle');
  const charCount  = document.getElementById('newCharCount');
  const cronGroup  = document.getElementById('newCronGroup');

  // Toggle cron field visibility
  document.querySelectorAll('input[name="newSchedule"]').forEach(radio => {
    radio.addEventListener('change', () => {
      cronGroup.classList.toggle('hidden', radio.value !== 'cron' || !radio.checked);
    });
  });

  titleArea.addEventListener('input', () => updateCharCount(titleArea, charCount));

  submitBtn.addEventListener('click', async () => {
    const title = titleArea.value.trim();
    if (!title) { showFeedback(feedbackEl, 'Tweet text is required.', 'error'); return; }

    const scheduleMode   = getRadioValue('newSchedule');
    const cronExpression = document.getElementById('newCron').value.trim();

    if (scheduleMode === 'cron') {
      const cronError = validateCronExpression(cronExpression);
      if (cronError) { showFeedback(feedbackEl, cronError, 'error'); return; }
    }

    submitBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.textContent = scheduleMode === 'now' ? 'Posting tweet…' : 'Scheduling tweet…';
    loadingEl.classList.remove('hidden');

    try {
      const params = {
        title,
        resourceLinks:  document.getElementById('newResourceLink').value.trim(),
        scheduleMode,
        cronExpression,
        maxCount:       scheduleMode === 'cron'
          ? (parseInt(document.getElementById('newMaxCount').value.trim(), 10) || 0)
          : 0,
      };

      const result = await submitNewTweet(params);

      if (result.success) {
        showFeedback(feedbackEl, result.message, 'success');
        // Reset form
        titleArea.value = '';
        document.getElementById('newResourceLink').value = '';
        document.getElementById('newCron').value = '';
        document.getElementById('newMaxCount').value = '';
        document.querySelector('input[name="newSchedule"][value="now"]').checked = true;
        cronGroup.classList.add('hidden');
        updateCharCount(titleArea, charCount);
      } else {
        showFeedback(feedbackEl, result.error, 'error');
      }
    } catch (err) {
      showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });
}

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tabCloneBtn').addEventListener('click', () => switchTab('clone'));
  document.getElementById('tabNewBtn').addEventListener('click',   () => switchTab('new'));

  initCloneTab();
  initNewTab();

  // Set initial tab state
  switchTab('clone');
});
