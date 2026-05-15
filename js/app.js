/**
 * app.js — Main UI logic.
 * Handles tab switching, form interactions, and wires up API calls.
 * Runs as a plain script (no ES module bundler needed for GitHub Pages).
 */

// ============================================================
// Tab switching
// ============================================================

function switchTab(tab) {
  document.getElementById('tabClone').classList.toggle('hidden', tab !== 'clone');
  document.getElementById('tabNew').classList.toggle('hidden',   tab !== 'new');

  ['tabCloneBtn', 'tabNewBtn'].forEach(id => {
    const btn    = document.getElementById(id);
    const active = (id === 'tabCloneBtn' && tab === 'clone') ||
                   (id === 'tabNewBtn'   && tab === 'new');
    btn.classList.toggle('border-b-2',           active);
    btn.classList.toggle('border-blue-500',      active);
    btn.classList.toggle('text-blue-500',        active);
    btn.classList.toggle('font-semibold',        active);
    btn.classList.toggle('text-gray-500',        !active);
  });
}

// ============================================================
// Clone Tweet tab
// ============================================================

(function initCloneTab() {
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

  // Toggle cron field
  document.querySelectorAll('input[name="cloneSchedule"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      cronGroup.classList.toggle('hidden', this.value !== 'cron');
    });
  });

  titleArea.addEventListener('input', function() {
    updateCharCount(titleArea, charCount);
  });

  // Fetch button
  fetchBtn.addEventListener('click', async function() {
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

      const mediaPreview = document.getElementById('cloneMediaPreview');
      const mediaUrlsDiv = document.getElementById('cloneMediaUrls');
      mediaPreview.innerHTML = '';
      mediaUrlsDiv.innerHTML = '';

      if (fetchedMediaUrls.length > 0) {
        fetchedMediaUrls.forEach(function(url) {
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
          a.className = 'block text-xs text-blue-500 hover:underline break-all';
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
  backBtn.addEventListener('click', function() {
    previewPanel.classList.add('hidden');
    fetchPanel.classList.remove('hidden');
    hideFeedback(feedbackEl);
  });

  // Submit button
  submitBtn.addEventListener('click', async function() {
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
        scheduleMode:   scheduleMode,
        cronExpression: cronExpression,
        title:          title,
        resourceLinks:  fetchedMediaUrls.join(','),
        maxCount:       scheduleMode === 'cron'
          ? (parseInt(document.getElementById('cloneMaxCount').value.trim(), 10) || 0)
          : 0,
      };

      const result = await submitCloneTweet(params);

      if (result.success) {
        showFeedback(feedbackEl, result.message, 'success');
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
}());

// ============================================================
// New Tweet tab
// ============================================================

(function initNewTab() {
  const feedbackEl = document.getElementById('newFeedback');
  const loadingEl  = document.getElementById('newLoading');
  const submitBtn  = document.getElementById('newSubmitBtn');
  const titleArea  = document.getElementById('newTitle');
  const charCount  = document.getElementById('newCharCount');
  const cronGroup  = document.getElementById('newCronGroup');

  document.querySelectorAll('input[name="newSchedule"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      cronGroup.classList.toggle('hidden', this.value !== 'cron');
    });
  });

  titleArea.addEventListener('input', function() {
    updateCharCount(titleArea, charCount);
  });

  submitBtn.addEventListener('click', async function() {
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
        title:          title,
        resourceLinks:  document.getElementById('newResourceLink').value.trim(),
        scheduleMode:   scheduleMode,
        cronExpression: cronExpression,
        maxCount:       scheduleMode === 'cron'
          ? (parseInt(document.getElementById('newMaxCount').value.trim(), 10) || 0)
          : 0,
      };

      const result = await submitNewTweet(params);

      if (result.success) {
        showFeedback(feedbackEl, result.message, 'success');
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
}());

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('tabCloneBtn').addEventListener('click', function() { switchTab('clone'); });
  document.getElementById('tabNewBtn').addEventListener('click',   function() { switchTab('new'); });
  switchTab('clone');
});
