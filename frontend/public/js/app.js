/**
 * app.js — Main UI logic.
 * Handles tab switching, cron builder, form interactions, and API calls.
 * Runs as a plain script (no ES module bundler needed for GitHub Pages).
 */

// ============================================================
// Tab switching
// ============================================================

function switchTab(tab) {
  document.getElementById('tabClone').classList.toggle('hidden', tab !== 'clone');
  document.getElementById('tabNew').classList.toggle('hidden',   tab !== 'new');

  ['tabCloneBtn', 'tabNewBtn'].forEach(function(id) {
    var btn    = document.getElementById(id);
    var active = (id === 'tabCloneBtn' && tab === 'clone') ||
                 (id === 'tabNewBtn'   && tab === 'new');
    btn.classList.toggle('border-b-2',      active);
    btn.classList.toggle('border-blue-500', active);
    btn.classList.toggle('text-blue-500',   active);
    btn.classList.toggle('font-semibold',   active);
    btn.classList.toggle('text-gray-500',   !active);
  });
}

// ============================================================
// Cron Builder
// Builds a 5-field cron expression from dropdown selections
// and writes it to a hidden <input> + a preview <code> element.
// ============================================================

/**
 * Generates a cron expression string from the builder dropdowns.
 * @param {string} prefix  - 'clone' or 'new'
 * @returns {string}  5-field cron expression
 */
function buildCronExpression(prefix) {
  var freq    = document.getElementById(prefix + 'CronFreq').value;
  var hour    = document.getElementById(prefix + 'CronHour').value;
  var minute  = document.getElementById(prefix + 'CronMinute').value;
  var dow     = document.getElementById(prefix + 'CronDow').value;
  var dom     = document.getElementById(prefix + 'CronDom').value;
  var interval = document.getElementById(prefix + 'CronInterval').value;

  switch (freq) {
    case 'hourly':  return minute + ' * * * *';
    case 'daily':   return minute + ' ' + hour + ' * * *';
    case 'weekly':  return minute + ' ' + hour + ' * * ' + dow;
    case 'monthly': return minute + ' ' + hour + ' ' + dom + ' * *';
    case 'custom':  return '*/' + interval + ' * * * *';
    default:        return minute + ' ' + hour + ' * * *';
  }
}

/**
 * Updates the visible rows and preview for a cron builder.
 * @param {string} prefix  - 'clone' or 'new'
 */
function updateCronBuilder(prefix) {
  var freq = document.getElementById(prefix + 'CronFreq').value;

  // Show/hide rows based on frequency
  document.getElementById(prefix + 'CronDowRow').classList.toggle('hidden',      freq !== 'weekly');
  document.getElementById(prefix + 'CronDomRow').classList.toggle('hidden',      freq !== 'monthly');
  document.getElementById(prefix + 'CronTimeRow').classList.toggle('hidden',     freq === 'custom' || freq === 'hourly');
  document.getElementById(prefix + 'CronIntervalRow').classList.toggle('hidden', freq !== 'custom');

  // Generate expression and update hidden input + preview
  var expr = buildCronExpression(prefix);
  document.getElementById(prefix + 'Cron').value          = expr;
  document.getElementById(prefix + 'CronPreview').textContent = expr;
}

/**
 * Populates hour (0–23) and day-of-month (1–28) selects,
 * then wires all builder dropdowns to updateCronBuilder.
 * @param {string} prefix  - 'clone' or 'new'
 */
function initCronBuilder(prefix) {
  // Populate hour select (0–23, displayed as 00–23)
  var hourSel = document.getElementById(prefix + 'CronHour');
  for (var h = 0; h < 24; h++) {
    var opt = document.createElement('option');
    opt.value = h;
    opt.textContent = (h < 10 ? '0' : '') + h + ':00';
    if (h === 9) opt.selected = true;
    hourSel.appendChild(opt);
  }

  // Populate day-of-month select (1–28)
  var domSel = document.getElementById(prefix + 'CronDom');
  for (var d = 1; d <= 28; d++) {
    var opt2 = document.createElement('option');
    opt2.value = d;
    opt2.textContent = d;
    if (d === 1) opt2.selected = true;
    domSel.appendChild(opt2);
  }

  // Wire all dropdowns to update the expression on change
  var ids = [
    prefix + 'CronFreq',
    prefix + 'CronHour',
    prefix + 'CronMinute',
    prefix + 'CronDow',
    prefix + 'CronDom',
    prefix + 'CronInterval',
  ];
  ids.forEach(function(id) {
    document.getElementById(id).addEventListener('change', function() {
      updateCronBuilder(prefix);
    });
  });

  // Set initial state
  updateCronBuilder(prefix);
}

/**
 * Resets the cron builder dropdowns to defaults.
 * @param {string} prefix  - 'clone' or 'new'
 */
function resetCronBuilder(prefix) {
  document.getElementById(prefix + 'CronFreq').value   = 'daily';
  document.getElementById(prefix + 'CronHour').value   = '9';
  document.getElementById(prefix + 'CronMinute').value = '0';
  document.getElementById(prefix + 'CronDow').value    = '1';
  document.getElementById(prefix + 'CronDom').value    = '1';
  document.getElementById(prefix + 'CronInterval').value = '5';
  updateCronBuilder(prefix);
}

// ============================================================
// Clone Tweet tab
// ============================================================

(function initCloneTab() {
  var fetchedMediaUrls = [];

  var fetchPanel   = document.getElementById('cloneFetchPanel');
  var previewPanel = document.getElementById('clonePreviewPanel');
  var feedbackEl   = document.getElementById('cloneFeedback');
  var loadingEl    = document.getElementById('cloneLoading');
  var fetchBtn     = document.getElementById('cloneFetchBtn');
  var backBtn      = document.getElementById('cloneBackBtn');
  var submitBtn    = document.getElementById('cloneSubmitBtn');
  var titleArea    = document.getElementById('cloneEditTitle');
  var charCount    = document.getElementById('cloneCharCount');
  var cronGroup    = document.getElementById('cloneCronGroup');

  // Toggle cron builder visibility
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
    var tweetLink = document.getElementById('cloneTweetLink').value.trim();
    var linkError = validateTweetLink(tweetLink);
    if (linkError) { showFeedback(feedbackEl, linkError, 'error'); return; }

    fetchBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.classList.remove('hidden');

    try {
      var result = await fetchTweetPreview(tweetLink);
      if (!result.success) {
        showFeedback(feedbackEl, result.error, 'error');
        return;
      }

      titleArea.value = result.text || '';
      updateCharCount(titleArea, charCount);
      fetchedMediaUrls = result.mediaUrls || [];

      var mediaPreview = document.getElementById('cloneMediaPreview');
      var mediaUrlsDiv = document.getElementById('cloneMediaUrls');
      mediaPreview.innerHTML = '';
      mediaUrlsDiv.innerHTML = '';

      if (fetchedMediaUrls.length > 0) {
        fetchedMediaUrls.forEach(function(url) {
          var img = document.createElement('img');
          img.src = url;
          img.alt = 'media';
          img.className = 'w-28 h-20 object-cover rounded border border-gray-200';
          mediaPreview.appendChild(img);

          var a = document.createElement('a');
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
    var title = titleArea.value.trim();
    if (!title) { showFeedback(feedbackEl, 'Tweet text is required.', 'error'); return; }

    var scheduleMode   = getRadioValue('cloneSchedule');
    var cronExpression = document.getElementById('cloneCron').value.trim();

    // Cron expression is always valid when built from dropdowns,
    // but run a quick sanity check anyway
    if (scheduleMode === 'cron' && !cronExpression) {
      showFeedback(feedbackEl, 'Could not build cron expression.', 'error');
      return;
    }

    submitBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.textContent = scheduleMode === 'now' ? 'Posting tweet…' : 'Scheduling tweet…';
    loadingEl.classList.remove('hidden');

    try {
      var params = {
        tweetLink:      document.getElementById('cloneTweetLink').value.trim(),
        scheduleMode:   scheduleMode,
        cronExpression: cronExpression,
        title:          title,
        resourceLinks:  fetchedMediaUrls.join(','),
        maxCount:       scheduleMode === 'cron'
          ? (parseInt(document.getElementById('cloneMaxCount').value.trim(), 10) || 0)
          : 0,
      };

      var result = await submitCloneTweet(params);

      if (result.success) {
        showFeedback(feedbackEl, result.message, 'success');
        previewPanel.classList.add('hidden');
        fetchPanel.classList.remove('hidden');
        document.getElementById('cloneTweetLink').value = '';
        document.getElementById('cloneMaxCount').value  = '';
        document.querySelector('input[name="cloneSchedule"][value="now"]').checked = true;
        cronGroup.classList.add('hidden');
        resetCronBuilder('clone');
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
  var feedbackEl = document.getElementById('newFeedback');
  var loadingEl  = document.getElementById('newLoading');
  var submitBtn  = document.getElementById('newSubmitBtn');
  var titleArea  = document.getElementById('newTitle');
  var charCount  = document.getElementById('newCharCount');
  var cronGroup  = document.getElementById('newCronGroup');

  document.querySelectorAll('input[name="newSchedule"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      cronGroup.classList.toggle('hidden', this.value !== 'cron');
    });
  });

  titleArea.addEventListener('input', function() {
    updateCharCount(titleArea, charCount);
  });

  submitBtn.addEventListener('click', async function() {
    var title = titleArea.value.trim();
    if (!title) { showFeedback(feedbackEl, 'Tweet text is required.', 'error'); return; }

    var scheduleMode   = getRadioValue('newSchedule');
    var cronExpression = document.getElementById('newCron').value.trim();

    if (scheduleMode === 'cron' && !cronExpression) {
      showFeedback(feedbackEl, 'Could not build cron expression.', 'error');
      return;
    }

    submitBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.textContent = scheduleMode === 'now' ? 'Posting tweet…' : 'Scheduling tweet…';
    loadingEl.classList.remove('hidden');

    try {
      var params = {
        title:          title,
        resourceLinks:  document.getElementById('newResourceLink').value.trim(),
        scheduleMode:   scheduleMode,
        cronExpression: cronExpression,
        maxCount:       scheduleMode === 'cron'
          ? (parseInt(document.getElementById('newMaxCount').value.trim(), 10) || 0)
          : 0,
      };

      var result = await submitNewTweet(params);

      if (result.success) {
        showFeedback(feedbackEl, result.message, 'success');
        titleArea.value = '';
        document.getElementById('newResourceLink').value = '';
        document.getElementById('newMaxCount').value     = '';
        document.querySelector('input[name="newSchedule"][value="now"]').checked = true;
        cronGroup.classList.add('hidden');
        resetCronBuilder('new');
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
  // Init cron builders (populates hour/dom selects and sets initial expression)
  initCronBuilder('clone');
  initCronBuilder('new');

  document.getElementById('tabCloneBtn').addEventListener('click', function() { switchTab('clone'); });
  document.getElementById('tabNewBtn').addEventListener('click',   function() { switchTab('new'); });
  switchTab('clone');
});
