/**
 * app.js — Main UI logic.
 * Handles tab switching, cron builder, form interactions, and API calls.
 * Runs as a plain script (no ES module bundler needed for GitHub Pages).
 */

// ============================================================
// Tab switching
// ============================================================

function switchTab(tab) {
  document.getElementById('tabClone').classList.toggle('hidden',  tab !== 'clone');
  document.getElementById('tabNew').classList.toggle('hidden',    tab !== 'new');
  document.getElementById('tabView').classList.toggle('hidden',   tab !== 'view');
  document.getElementById('tabAuto').classList.toggle('hidden',   tab !== 'auto');
  document.getElementById('tabFeeds').classList.toggle('hidden',  tab !== 'feeds');
  document.getElementById('tabEngage').classList.toggle('hidden', tab !== 'engage');

  var tabMap = {
    'tabCloneBtn':  'clone',
    'tabNewBtn':    'new',
    'tabViewBtn':   'view',
    'tabAutoBtn':   'auto',
    'tabEngageBtn': 'engage',
    'tabFeedsBtn':  'feeds',
  };

  Object.keys(tabMap).forEach(function(id) {
    var btn    = document.getElementById(id);
    var active = tabMap[id] === tab;
    btn.classList.toggle('bg-blue-50',    active);
    btn.classList.toggle('text-blue-600', active);
    btn.classList.toggle('font-semibold', active);
    btn.classList.toggle('text-gray-600', !active);
    btn.classList.toggle('hover:bg-gray-50', !active);
  });

  // Close sidebar on mobile after selecting a tab
  _closeSidebar();
}

function _openSidebar() {
  document.getElementById('sidebar').classList.remove('-translate-x-full');
  document.getElementById('sidebar').classList.add('translate-x-0');
  document.getElementById('sidebarBackdrop').classList.remove('hidden');
}

function _closeSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.classList.add('-translate-x-full');
  sidebar.classList.remove('translate-x-0');
  document.getElementById('sidebarBackdrop').classList.add('hidden');
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
// Inline cron builder (used by the My Tweets edit form)
// Uses data-cb attributes instead of element IDs so multiple
// independent builders can exist on the page at the same time.
// ============================================================

/**
 * Parses a 5-field cron expression back to builder field values.
 * Returns a plain object with: freq, minute, hour, dow, dom, interval.
 * @param {string} cron
 * @returns {Object}
 */
function parseCronToBuilder(cron) {
  var d = { freq: 'daily', minute: 0, hour: 9, dow: 1, dom: 1, interval: 5 };
  if (!cron || !cron.trim()) return d;
  var f = cron.trim().split(/\s+/);
  if (f.length !== 5) return d;
  var min = f[0], hr = f[1], dom = f[2], mon = f[3], dow = f[4];

  // Custom: */N * * * *
  if (/^\*\/\d+$/.test(min) && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { freq: 'custom', minute: d.minute, hour: d.hour, dow: d.dow, dom: d.dom,
             interval: parseInt(min.slice(2), 10) || 5 };
  }
  // Hourly: N * * * *
  if (hr === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { freq: 'hourly', minute: parseInt(min, 10) || 0, hour: d.hour,
             dow: d.dow, dom: d.dom, interval: d.interval };
  }
  // Weekly: N H * * D
  if (dom === '*' && mon === '*' && dow !== '*') {
    return { freq: 'weekly', minute: parseInt(min, 10) || 0, hour: parseInt(hr, 10) || 9,
             dow: parseInt(dow, 10) || 1, dom: d.dom, interval: d.interval };
  }
  // Monthly: N H D * *
  if (dom !== '*' && mon === '*' && dow === '*') {
    return { freq: 'monthly', minute: parseInt(min, 10) || 0, hour: parseInt(hr, 10) || 9,
             dow: d.dow, dom: parseInt(dom, 10) || 1, interval: d.interval };
  }
  // Daily (default)
  return { freq: 'daily', minute: parseInt(min, 10) || 0, hour: parseInt(hr, 10) || 9,
           dow: d.dow, dom: d.dom, interval: d.interval };
}

/**
 * Injects a standalone cron builder into `container`.
 * Does not use element IDs — queries by data-cb attribute instead.
 * @param {HTMLElement} container
 * @param {Object} parsed  - result of parseCronToBuilder()
 * @returns {{ getCron: function(): string }}
 */
function initCronBuilderInEl(container, parsed) {
  container.innerHTML =
    '<div class="border border-gray-200 rounded-lg p-4 bg-gray-50">' +
      '<p class="text-sm font-medium text-gray-700 mb-3">Build your schedule</p>' +
      // Frequency
      '<div class="mb-3">' +
        '<label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Repeat</label>' +
        '<select data-cb="freq" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
          '<option value="hourly">Every hour</option>' +
          '<option value="daily">Every day</option>' +
          '<option value="weekly">Every week</option>' +
          '<option value="monthly">Every month</option>' +
          '<option value="custom">Custom interval (every N minutes)</option>' +
        '</select>' +
      '</div>' +
      // Day of week (weekly only)
      '<div data-cb="dowRow" class="hidden mb-3">' +
        '<label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">On</label>' +
        '<select data-cb="dow" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
          '<option value="1">Monday</option><option value="2">Tuesday</option>' +
          '<option value="3">Wednesday</option><option value="4">Thursday</option>' +
          '<option value="5">Friday</option><option value="6">Saturday</option>' +
          '<option value="0">Sunday</option>' +
        '</select>' +
      '</div>' +
      // Day of month (monthly only)
      '<div data-cb="domRow" class="hidden mb-3">' +
        '<label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">On day</label>' +
        '<select data-cb="dom" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"></select>' +
      '</div>' +
      // Time (daily / weekly / monthly)
      '<div data-cb="timeRow" class="mb-3">' +
        '<label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">At</label>' +
        '<div class="flex gap-2 items-center">' +
          '<select data-cb="hour" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"></select>' +
          '<span class="text-gray-400 text-sm">:</span>' +
          '<select data-cb="minute" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
            '<option value="0">00</option><option value="15">15</option>' +
            '<option value="30">30</option><option value="45">45</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      // Custom interval
      '<div data-cb="intervalRow" class="hidden mb-3">' +
        '<label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Every</label>' +
        '<select data-cb="interval" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
          '<option value="5">5 minutes</option><option value="10">10 minutes</option>' +
          '<option value="15">15 minutes</option><option value="30">30 minutes</option>' +
        '</select>' +
      '</div>' +
      // Expression preview
      '<div class="mt-3 flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2">' +
        '<span class="text-xs text-gray-400 shrink-0">Cron:</span>' +
        '<code data-cb="preview" class="text-sm font-mono text-blue-600 font-medium"></code>' +
      '</div>' +
    '</div>';

  function q(attr) { return container.querySelector('[data-cb="' + attr + '"]'); }

  // Populate hour select (0–23)
  var hourSel = q('hour');
  for (var h = 0; h < 24; h++) {
    var hOpt = document.createElement('option');
    hOpt.value = h;
    hOpt.textContent = (h < 10 ? '0' : '') + h + ':00';
    hourSel.appendChild(hOpt);
  }

  // Populate dom select (1–28)
  var domSel = q('dom');
  for (var d = 1; d <= 28; d++) {
    var dOpt = document.createElement('option');
    dOpt.value = d;
    dOpt.textContent = d;
    domSel.appendChild(dOpt);
  }

  function buildExpr() {
    var freq     = q('freq').value;
    var hour     = q('hour').value;
    var minute   = q('minute').value;
    var dow      = q('dow').value;
    var dom      = q('dom').value;
    var interval = q('interval').value;
    switch (freq) {
      case 'hourly':  return minute + ' * * * *';
      case 'daily':   return minute + ' ' + hour + ' * * *';
      case 'weekly':  return minute + ' ' + hour + ' * * ' + dow;
      case 'monthly': return minute + ' ' + hour + ' ' + dom + ' * *';
      case 'custom':  return '*/' + interval + ' * * * *';
      default:        return minute + ' ' + hour + ' * * *';
    }
  }

  function update() {
    var freq = q('freq').value;
    q('dowRow').classList.toggle('hidden',      freq !== 'weekly');
    q('domRow').classList.toggle('hidden',      freq !== 'monthly');
    q('timeRow').classList.toggle('hidden',     freq === 'custom' || freq === 'hourly');
    q('intervalRow').classList.toggle('hidden', freq !== 'custom');
    q('preview').textContent = buildExpr();
  }

  // Set initial values from parsed expression
  q('freq').value     = parsed.freq;
  q('hour').value     = parsed.hour;
  q('minute').value   = parsed.minute;
  q('dow').value      = parsed.dow;
  q('dom').value      = parsed.dom;
  q('interval').value = parsed.interval;

  ['freq', 'hour', 'minute', 'dow', 'dom', 'interval'].forEach(function(attr) {
    q(attr).addEventListener('change', update);
  });

  update();

  return { getCron: buildExpr };
}

/**
 * Converts a 5-field cron expression to a plain-English string.
 * Uses parseCronToBuilder() for the heavy lifting.
 * Falls back to the raw expression if the format is unrecognised.
 * @param {string} cron
 * @returns {string}
 */
function cronToHuman(cron) {
  if (!cron || !cron.trim()) return '';
  var p    = parseCronToBuilder(cron);
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var pad  = function(n) { return (n < 10 ? '0' : '') + n; };
  var time = pad(p.hour) + ':' + pad(p.minute);

  switch (p.freq) {
    case 'hourly':  return 'Every hour' + (p.minute > 0 ? ' at :' + pad(p.minute) : '');
    case 'daily':   return 'Every day at ' + time;
    case 'weekly':  return 'Every ' + (DAYS[p.dow] || 'week') + ' at ' + time;
    case 'monthly': return 'Monthly on day ' + p.dom + ' at ' + time;
    case 'custom':  return 'Every ' + p.interval + ' min';
    default:        return cron; // unrecognised — show raw
  }
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
  var feedbackEl  = document.getElementById('newFeedback');
  var loadingEl   = document.getElementById('newLoading');
  var submitBtn   = document.getElementById('newSubmitBtn');
  var titleArea   = document.getElementById('newTitle');
  var charCount   = document.getElementById('newCharCount');
  var cronGroup   = document.getElementById('newCronGroup');
  var fileInput   = document.getElementById('newImageFile');
  var dropZone    = document.getElementById('newImageDropZone');
  var previewBox  = document.getElementById('newImagePreview');
  var thumb       = document.getElementById('newImageThumb');
  var nameEl      = document.getElementById('newImageName');
  var sizeEl      = document.getElementById('newImageSize');
  var clearBtn    = document.getElementById('newImageClear');

  var selectedImageBase64 = null;  // stores the Base64 string of the selected file

  // ---- Image file handling ----

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showFeedback(feedbackEl, 'Please select a valid image file.', 'error');
      return;
    }
    var MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_BYTES) {
      showFeedback(feedbackEl, 'Image must be smaller than 5 MB.', 'error');
      return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
      var dataUrl = e.target.result;
      // Strip the "data:image/...;base64," prefix — send only the raw Base64
      selectedImageBase64 = dataUrl.split(',')[1];

      // Show preview
      thumb.src      = dataUrl;
      nameEl.textContent = file.name;
      sizeEl.textContent = formatBytes(file.size);
      previewBox.classList.remove('hidden');
      hideFeedback(feedbackEl);
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', function() {
    if (this.files && this.files[0]) handleImageFile(this.files[0]);
  });

  // Drag-and-drop
  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('dragleave', function() {
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  });

  // Clear button
  clearBtn.addEventListener('click', function() {
    selectedImageBase64 = null;
    fileInput.value     = '';
    thumb.src           = '';
    previewBox.classList.add('hidden');
  });

  // ---- Schedule mode toggle ----

  document.querySelectorAll('input[name="newSchedule"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      cronGroup.classList.toggle('hidden', this.value !== 'cron');
    });
  });

  titleArea.addEventListener('input', function() {
    updateCharCount(titleArea, charCount);
  });

  // ---- Submit ----

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
        // Uploaded file takes priority over URL if both are provided
        resourceLinks:  selectedImageBase64
          ? ''
          : document.getElementById('newResourceLink').value.trim(),
        imageBase64:    selectedImageBase64 || '',
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
        // Clear image
        selectedImageBase64 = null;
        fileInput.value     = '';
        previewBox.classList.add('hidden');
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
// My Tweets tab
// ============================================================

(function initViewTab() {
  var refreshBtn = document.getElementById('viewRefreshBtn');
  var loadingEl  = document.getElementById('viewLoading');
  var feedbackEl = document.getElementById('viewFeedback');
  var emptyEl    = document.getElementById('viewEmpty');
  var listEl     = document.getElementById('viewList');

  // ---- Load & render ----------------------------------------

  function loadTweets() {
    refreshBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    hideFeedback(feedbackEl);

    listTweets()
      .then(function(result) {
        if (!result.success) {
          showFeedback(feedbackEl, result.error || 'Failed to load tweets.', 'error');
          return;
        }
        renderList(result.tweets || []);
      })
      .catch(function(err) {
        showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
      })
      .finally(function() {
        refreshBtn.disabled = false;
        loadingEl.classList.add('hidden');
      });
  }

  function renderList(tweets) {
    listEl.innerHTML = '';
    if (tweets.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    tweets.forEach(function(tweet) {
      listEl.appendChild(createTweetItem(tweet));
    });
    listEl.classList.remove('hidden');
  }

  // ---- Build one tweet card ----------------------------------

  function createTweetItem(tweet) {
    // Determine status label.
    // Status column values: '' (active), 'sent' (max count reached), 'error: ...' (posting failure)
    var statusKey;
    if (tweet.status === 'sent') {
      statusKey = 'sent';
    } else if (tweet.status && tweet.status.indexOf('error:') === 0) {
      statusKey = 'error';
    } else {
      statusKey = 'active';
    }

    var badgeClass = {
      sent:   'bg-green-100 text-green-700',
      error:  'bg-red-100 text-red-700',
      active: 'bg-gray-100 text-gray-600',
    }[statusKey];

    var postCountText = '';
    if (tweet.maxCount > 0) {
      postCountText = tweet.postCount + '\u202f/\u202f' + tweet.maxCount + ' posts';
    } else if (tweet.postCount > 0) {
      postCountText = tweet.postCount + ' post' + (tweet.postCount !== 1 ? 's' : '');
    }

    var div = document.createElement('div');
    div.className = 'border border-gray-200 rounded-lg p-4';

    div.innerHTML =
      '<div class="flex items-start gap-3">' +
        '<div class="flex-1 min-w-0">' +
          '<p class="js-tweet-text text-sm text-gray-800 line-clamp-2 break-words"></p>' +
          '<div class="flex flex-wrap items-center gap-2 mt-1.5">' +
            '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + badgeClass + '">' + escapeHtml(statusKey) + '</span>' +
            (tweet.cron    ? '<span class="js-cron-display text-xs text-gray-400"></span>' : '') +
            (postCountText ? '<span class="text-xs text-gray-400">' + escapeHtml(postCountText) + '</span>' : '') +
          '</div>' +
          (tweet.tweetLink ? '<a class="js-source-link text-xs text-blue-400 hover:underline mt-1 block truncate" target="_blank" rel="noopener noreferrer"></a>' : '') +
          (statusKey === 'error' ? '<p class="js-error-text text-xs text-red-400 mt-1 break-all"></p>' : '') +
        '</div>' +
        '<div class="flex gap-2 shrink-0 mt-0.5">' +
          '<button class="js-edit-btn px-3 py-1.5 text-xs font-medium text-blue-500 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors">Edit</button>' +
          '<button class="js-delete-btn px-3 py-1.5 text-xs font-medium text-red-500 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Delete</button>' +
        '</div>' +
      '</div>' +

      // Inline edit form (hidden by default)
      '<div class="js-edit-form hidden mt-4 pt-4 border-t border-gray-100 space-y-3">' +
        '<div>' +
          '<label class="block text-xs font-medium text-gray-500 mb-1">Tweet Text</label>' +
          '<textarea class="js-edit-title w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" rows="3"></textarea>' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-medium text-gray-500 mb-1">Resource Links <span class="font-normal text-gray-400">(URL or drive:fileId, comma-separated)</span></label>' +
          '<input type="text" class="js-edit-resource w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent">' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-medium text-gray-500 mb-2">Schedule</label>' +
          '<div class="flex gap-6 mb-2">' +
            '<label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">' +
              '<input type="radio" class="js-sched-now accent-blue-500" name="viewSched_' + tweet.rowIndex + '" value="now"> Active (no repeat)' +
            '</label>' +
            '<label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">' +
              '<input type="radio" class="js-sched-cron accent-blue-500" name="viewSched_' + tweet.rowIndex + '" value="cron"> Schedule with Cron' +
            '</label>' +
          '</div>' +
          '<div class="js-edit-cron-builder"></div>' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-medium text-gray-500 mb-1">Max Posts <span class="font-normal text-gray-400">(0 = unlimited)</span></label>' +
          '<input type="number" class="js-edit-max w-28 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" min="0" placeholder="0">' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-medium text-gray-500 mb-1">Status</label>' +
          '<select class="js-edit-status w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
            '<option value="">Active</option>' +
            '<option value="sent">Sent (max count reached)</option>' +
          '</select>' +
          '<p class="js-edit-status-note hidden mt-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"></p>' +
        '</div>' +
        '<div class="js-item-feedback hidden"></div>' +
        '<div class="flex gap-2 pt-1">' +
          '<button class="js-save-btn flex-1 py-2 text-sm font-semibold text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors">Save changes</button>' +
          '<button class="js-cancel-btn flex-1 py-2 text-sm font-semibold text-blue-500 bg-white border border-blue-300 rounded-md hover:bg-blue-50 transition-colors">Cancel</button>' +
        '</div>' +
      '</div>';

    // Set text content safely (avoids innerHTML XSS)
    div.querySelector('.js-tweet-text').textContent = tweet.title || '(no text)';
    if (tweet.cron) {
      div.querySelector('.js-cron-display').textContent = cronToHuman(tweet.cron);
    }
    if (tweet.tweetLink) {
      var link     = div.querySelector('.js-source-link');
      link.href        = tweet.tweetLink;
      link.textContent = tweet.tweetLink;
    }
    if (statusKey === 'error') {
      div.querySelector('.js-error-text').textContent = tweet.status;
    }

    // Pre-fill edit form
    div.querySelector('.js-edit-title').value    = tweet.title         || '';
    div.querySelector('.js-edit-resource').value = tweet.resourceLinks || '';
    div.querySelector('.js-edit-max').value      = tweet.maxCount      || 0;
    div.querySelector('.js-edit-status').value   = tweet.status === 'sent' ? 'sent' : '';

    // Initialize inline cron builder
    var hasCron       = !!(tweet.cron && tweet.cron.trim());
    var schedNowRadio = div.querySelector('.js-sched-now');
    var schedCronRadio = div.querySelector('.js-sched-cron');
    var cronBuilderEl = div.querySelector('.js-edit-cron-builder');

    schedNowRadio.checked  = !hasCron;
    schedCronRadio.checked = hasCron;

    var cronBuilder = initCronBuilderInEl(cronBuilderEl, parseCronToBuilder(tweet.cron || ''));
    cronBuilderEl.classList.toggle('hidden', !hasCron);

    schedNowRadio.addEventListener('change', function() {
      cronBuilderEl.classList.add('hidden');
    });
    schedCronRadio.addEventListener('change', function() {
      cronBuilderEl.classList.remove('hidden');
    });

    // If there's a current error, show a note explaining the reset path
    if (tweet.status && tweet.status.indexOf('error:') === 0) {
      var statusNote = div.querySelector('.js-edit-status-note');
      statusNote.textContent = tweet.status + ' — select "Active" to clear this error and allow a retry.';
      statusNote.classList.remove('hidden');
    }

    // ---- Wire up buttons ----

    var editBtn      = div.querySelector('.js-edit-btn');
    var deleteBtn    = div.querySelector('.js-delete-btn');
    var editForm     = div.querySelector('.js-edit-form');
    var saveBtn      = div.querySelector('.js-save-btn');
    var cancelBtn    = div.querySelector('.js-cancel-btn');
    var itemFeedback = div.querySelector('.js-item-feedback');

    // Toggle inline edit form
    editBtn.addEventListener('click', function() {
      var isOpen = !editForm.classList.contains('hidden');
      editForm.classList.toggle('hidden', isOpen);
      editBtn.textContent = isOpen ? 'Edit' : 'Cancel edit';
    });

    cancelBtn.addEventListener('click', function() {
      editForm.classList.add('hidden');
      editBtn.textContent = 'Edit';
      hideFeedback(itemFeedback);
    });

    // Delete — reload full list afterward so row indices stay accurate
    deleteBtn.addEventListener('click', function() {
      if (!confirm('Delete this tweet? This cannot be undone.')) return;
      deleteBtn.disabled = true;
      deleteTweet(tweet.rowIndex)
        .then(function(result) {
          if (result.success) {
            showFeedback(feedbackEl, 'Tweet deleted.', 'success');
            loadTweets();
          } else {
            deleteBtn.disabled = false;
            alert('Error: ' + (result.error || 'Unknown error'));
          }
        })
        .catch(function(err) {
          deleteBtn.disabled = false;
          alert('Unexpected error: ' + err.message);
        });
    });

    // Save — re-render just this card on success
    saveBtn.addEventListener('click', function() {
      var title         = div.querySelector('.js-edit-title').value.trim();
      var resourceLinks = div.querySelector('.js-edit-resource').value.trim();
      var cron          = div.querySelector('.js-sched-now').checked ? '' : cronBuilder.getCron();
      var maxCount      = parseInt(div.querySelector('.js-edit-max').value, 10) || 0;
      var status        = div.querySelector('.js-edit-status').value;

      if (!title) {
        showFeedback(itemFeedback, 'Tweet text is required.', 'error');
        return;
      }

      saveBtn.disabled = true;
      hideFeedback(itemFeedback);

      updateTweet(tweet.rowIndex, {
        title:         title,
        resourceLinks: resourceLinks,
        cron:          cron,
        maxCount:      maxCount,
        status:        status,
      })
        .then(function(result) {
          if (result.success) {
            // Mutate local data object and swap out the card
            tweet.title         = title;
            tweet.resourceLinks = resourceLinks;
            tweet.cron          = cron;
            tweet.maxCount      = maxCount;
            tweet.status        = status;
            div.replaceWith(createTweetItem(tweet));
            showFeedback(feedbackEl, 'Tweet updated.', 'success');
          } else {
            showFeedback(itemFeedback, result.error || 'Failed to save.', 'error');
            saveBtn.disabled = false;
          }
        })
        .catch(function(err) {
          showFeedback(itemFeedback, 'Unexpected error: ' + err.message, 'error');
          saveBtn.disabled = false;
        });
    });

    return div;
  }

  refreshBtn.addEventListener('click', loadTweets);

  // Expose loader so the bootstrap can trigger it on first activation
  window._loadViewTweets = loadTweets;
}());

// ============================================================
// Engagement tab
// ============================================================

(function initEngagementTab() {
  var analyzeBtn = document.getElementById('engageAnalyzeBtn');
  var loadingEl  = document.getElementById('engageLoading');
  var feedbackEl = document.getElementById('engageFeedback');
  var emptyEl    = document.getElementById('engageEmpty');
  var listEl     = document.getElementById('engageList');

  analyzeBtn.addEventListener('click', function() {
    analyzeBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    hideFeedback(feedbackEl);

    analyzeEngagement()
      .then(function(result) {
        if (!result.success) {
          showFeedback(feedbackEl, result.error || 'Analysis failed.', 'error');
          return;
        }
        var items = result.results || [];
        if (items.length === 0) {
          emptyEl.classList.remove('hidden');
          return;
        }
        renderResults(items);
      })
      .catch(function(err) {
        showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
      })
      .finally(function() {
        analyzeBtn.disabled = false;
        loadingEl.classList.add('hidden');
      });
  });

  function renderResults(items) {
    listEl.innerHTML = '';

    // Sort: approve first, then by score descending
    items.sort(function(a, b) {
      if (a.decision !== b.decision) return a.decision === 'approve' ? -1 : 1;
      return b.score - a.score;
    });

    items.forEach(function(item) {
      listEl.appendChild(createResultCard(item));
    });
    listEl.classList.remove('hidden');
  }

  function createResultCard(item) {
    var isApprove  = item.decision === 'approve';
    var scoreColor = item.score >= 7 ? 'text-green-600 bg-green-50'
                   : item.score >= 5 ? 'text-yellow-600 bg-yellow-50'
                   : 'text-red-600 bg-red-50';

    var div = document.createElement('div');
    div.className = 'border rounded-lg p-4 space-y-3 ' +
      (isApprove ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30');

    div.innerHTML =
      // Header row
      '<div class="flex items-start gap-3">' +
        '<div class="flex-1 min-w-0">' +
          '<p class="js-eng-title text-sm font-medium text-gray-800 break-words"></p>' +
          '<div class="flex flex-wrap items-center gap-2 mt-1.5">' +
            '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' +
              (isApprove ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') + '">' +
              (isApprove ? '✓ Approve' : '✗ Reject') +
            '</span>' +
            '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + scoreColor + '">' +
              item.score + '/10' +
            '</span>' +
            (item.category ? '<span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full js-eng-cat"></span>' : '') +
            (item.source   ? '<span class="text-xs text-gray-400 js-eng-src"></span>' : '') +
          '</div>' +
          '<p class="js-eng-reason text-xs text-gray-600 mt-2 italic"></p>' +
        '</div>' +
      '</div>' +

      // Tweet draft
      '<div>' +
        '<label class="block text-xs font-medium text-gray-500 mb-1">Tweet draft</label>' +
        '<textarea class="js-eng-draft w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" rows="4"></textarea>' +
        '<p class="js-eng-count text-right text-xs text-gray-400 mt-1">0 / 280</p>' +
      '</div>' +

      '<div class="js-eng-card-feedback hidden"></div>' +

      // Action buttons
      '<div class="flex gap-2">' +
        '<button class="js-eng-approve flex-1 py-2 text-sm font-semibold text-white bg-green-500 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Approve &amp; Post</button>' +
        '<button class="js-eng-copy flex-1 py-2 text-sm font-semibold text-blue-500 bg-white border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Copy &amp; Approve</button>' +
        '<button class="js-eng-reject flex-1 py-2 text-sm font-semibold text-red-500 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Reject</button>' +
      '</div>';

    // Set text safely
    div.querySelector('.js-eng-title').textContent  = item.title      || '(no title)';
    div.querySelector('.js-eng-reason').textContent = item.reason     || '';
    if (item.category) div.querySelector('.js-eng-cat').textContent = item.category;
    if (item.source)   div.querySelector('.js-eng-src').textContent  = item.source;

    var draftArea = div.querySelector('.js-eng-draft');
    var charCount = div.querySelector('.js-eng-count');
    draftArea.value = item.tweetDraft || '';
    updateCharCount(draftArea, charCount, 280);
    draftArea.addEventListener('input', function() { updateCharCount(draftArea, charCount, 280); });

    // ---- Wire buttons ----
    var approveBtn   = div.querySelector('.js-eng-approve');
    var copyBtn      = div.querySelector('.js-eng-copy');
    var rejectBtn    = div.querySelector('.js-eng-reject');
    var cardFeedback = div.querySelector('.js-eng-card-feedback');

    function disableAll() { approveBtn.disabled = copyBtn.disabled = rejectBtn.disabled = true; }
    function enableAll()  { approveBtn.disabled = copyBtn.disabled = rejectBtn.disabled = false; }

    approveBtn.addEventListener('click', function() {
      var draft = draftArea.value.trim();
      if (!draft) { showFeedback(cardFeedback, 'Tweet text is required.', 'error'); return; }
      if (draft.length > 280) { showFeedback(cardFeedback, 'Tweet exceeds 280 characters.', 'error'); return; }
      disableAll();
      approveTweet(item.rowIndex, draft)
        .then(function(r) {
          if (r.success) { div.remove(); showFeedback(feedbackEl, 'Tweet posted.', 'success'); }
          else { showFeedback(cardFeedback, r.error || 'Failed.', 'error'); enableAll(); }
        })
        .catch(function(e) { showFeedback(cardFeedback, e.message, 'error'); enableAll(); });
    });

    copyBtn.addEventListener('click', function() {
      var draft = draftArea.value.trim();
      if (!draft) { showFeedback(cardFeedback, 'Tweet text is required.', 'error'); return; }
      disableAll();
      if (navigator.clipboard) navigator.clipboard.writeText(draft).catch(function() { draftArea.select(); });
      else draftArea.select();
      markApproved(item.rowIndex)
        .then(function(r) {
          if (r.success) { div.remove(); showFeedback(feedbackEl, 'Copied — paste it in the X app.', 'success'); }
          else { showFeedback(cardFeedback, r.error || 'Failed.', 'error'); enableAll(); }
        })
        .catch(function(e) { showFeedback(cardFeedback, e.message, 'error'); enableAll(); });
    });

    rejectBtn.addEventListener('click', function() {
      disableAll();
      rejectTweet(item.rowIndex)
        .then(function(r) {
          if (r.success) div.remove();
          else { showFeedback(cardFeedback, r.error || 'Failed.', 'error'); enableAll(); }
        })
        .catch(function(e) { showFeedback(cardFeedback, e.message, 'error'); enableAll(); });
    });

    return div;
  }
}());

// ============================================================
// Feeds tab
// ============================================================

(function initFeedsTab() {
  var showAddBtn    = document.getElementById('feedsShowAddBtn');
  var addForm       = document.getElementById('feedsAddForm');
  var saveBtn       = document.getElementById('feedsSaveBtn');
  var cancelBtn     = document.getElementById('feedsCancelBtn');
  var loadingEl     = document.getElementById('feedsLoading');
  var feedbackEl    = document.getElementById('feedsFeedback');
  var formFeedback  = document.getElementById('feedsFormFeedback');
  var emptyEl       = document.getElementById('feedsEmpty');
  var listEl        = document.getElementById('feedsList');

  var allFeeds = [];

  // ---- Load & render ----------------------------------------

  function loadFeeds() {
    loadingEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    hideFeedback(feedbackEl);

    listFeeds()
      .then(function(result) {
        if (!result.success) {
          showFeedback(feedbackEl, result.error || 'Failed to load feeds.', 'error');
          return;
        }
        allFeeds = result.feeds || [];
        renderFeeds();
      })
      .catch(function(err) {
        showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
      })
      .finally(function() {
        loadingEl.classList.add('hidden');
      });
  }

  function renderFeeds() {
    listEl.innerHTML = '';
    if (allFeeds.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    allFeeds.forEach(function(feed) {
      listEl.appendChild(createFeedRow(feed));
    });
    listEl.classList.remove('hidden');
  }

  // ---- Build one feed row -----------------------------------

  function createFeedRow(feed) {
    var div = document.createElement('div');
    div.className = 'border border-gray-200 rounded-lg p-4 space-y-3';

    div.innerHTML =
      // Main row: info + actions
      '<div class="flex items-start gap-3">' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<p class="js-feed-name text-sm font-medium text-gray-800"></p>' +
            (feed.skipDescription ? '<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">title only</span>' : '') +
          '</div>' +
          '<p class="js-feed-desc text-xs text-gray-500 mt-0.5 leading-relaxed"></p>' +
          '<a class="js-feed-url text-xs text-blue-400 hover:underline block mt-1 truncate" target="_blank" rel="noopener noreferrer"></a>' +
          // Config summary badges
          '<div class="flex flex-wrap items-center gap-2 mt-2">' +
            '<span class="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">max: ' + escapeHtml(String(feed.maxNew || 1)) + '</span>' +
            '<span class="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">length: ' + escapeHtml(String(feed.tweetLength || 280)) + '</span>' +
            '<span class="text-xs px-2 py-0.5 rounded border ' + (feed.promptStyle === 'educational' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-600') + '">' + escapeHtml(feed.promptStyle || 'short_take') + '</span>' +
            '<span class="text-xs px-2 py-0.5 rounded border ' + (feed.fetchFullArticle ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500') + '">' + (feed.fetchFullArticle ? 'full article' : 'rss desc') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 shrink-0 mt-0.5">' +
          '<button class="js-edit-btn text-xs px-2.5 py-1.5 font-medium text-blue-500 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors">Edit</button>' +
          '<button class="js-toggle-btn px-3 py-1 text-xs font-medium rounded-full transition-colors ' +
            (feed.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200') + '">' +
            (feed.enabled ? 'Enabled' : 'Disabled') +
          '</button>' +
          '<button class="js-delete-btn text-gray-400 hover:text-red-500 transition-colors" aria-label="Delete feed">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // Inline edit form (hidden by default)
      '<div class="js-edit-form hidden pt-3 border-t border-gray-100 space-y-3">' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-500 mb-1">Max new per run</label>' +
            '<input type="number" class="js-edit-max w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" min="1" max="10">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-500 mb-1">Tweet length (chars)</label>' +
            '<input type="number" class="js-edit-length w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" min="100" max="25000">' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-500 mb-1">Prompt style</label>' +
            '<select class="js-edit-style w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
              '<option value="short_take">short_take — 3-line hot take</option>' +
              '<option value="educational">educational — long-form with examples</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-500 mb-1">Article context</label>' +
            '<select class="js-edit-fetch w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">' +
              '<option value="false">RSS description (fast)</option>' +
              '<option value="true">Fetch full article (richer, slower)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="js-edit-feedback hidden"></div>' +
        '<div class="flex gap-2 pt-1">' +
          '<button class="js-save-btn flex-1 py-2 text-sm font-semibold text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors">Save</button>' +
          '<button class="js-cancel-btn flex-1 py-2 text-sm font-semibold text-blue-500 bg-white border border-blue-300 rounded-md hover:bg-blue-50 transition-colors">Cancel</button>' +
        '</div>' +
      '</div>';

    // Set text safely
    div.querySelector('.js-feed-name').textContent = feed.name;
    div.querySelector('.js-feed-desc').textContent = feed.description || '';
    var urlEl = div.querySelector('.js-feed-url');
    urlEl.href        = feed.url;
    urlEl.textContent = feed.url;

    // Pre-fill edit form
    div.querySelector('.js-edit-max').value    = feed.maxNew      || 1;
    div.querySelector('.js-edit-length').value = feed.tweetLength || 280;
    div.querySelector('.js-edit-style').value  = feed.promptStyle === 'educational' ? 'educational' : 'short_take';
    div.querySelector('.js-edit-fetch').value  = feed.fetchFullArticle ? 'true' : 'false';

    // ---- Wire buttons ----

    var editBtn      = div.querySelector('.js-edit-btn');
    var editForm     = div.querySelector('.js-edit-form');
    var saveBtn      = div.querySelector('.js-save-btn');
    var cancelBtn    = div.querySelector('.js-cancel-btn');
    var editFeedback = div.querySelector('.js-edit-feedback');
    var toggleBtn    = div.querySelector('.js-toggle-btn');

    editBtn.addEventListener('click', function() {
      var isOpen = !editForm.classList.contains('hidden');
      editForm.classList.toggle('hidden', isOpen);
      editBtn.textContent = isOpen ? 'Edit' : 'Cancel';
    });

    cancelBtn.addEventListener('click', function() {
      editForm.classList.add('hidden');
      editBtn.textContent = 'Edit';
      hideFeedback(editFeedback);
    });

    saveBtn.addEventListener('click', function() {
      saveBtn.disabled = true;
      hideFeedback(editFeedback);

      var data = {
        maxNew:           parseInt(div.querySelector('.js-edit-max').value,    10) || 1,
        tweetLength:      parseInt(div.querySelector('.js-edit-length').value, 10) || 280,
        promptStyle:      div.querySelector('.js-edit-style').value,
        fetchFullArticle: div.querySelector('.js-edit-fetch').value === 'true',
      };

      updateFeed(feed.rowIndex, data)
        .then(function(result) {
          if (result.success) {
            // Update local data and re-render card
            feed.maxNew           = data.maxNew;
            feed.tweetLength      = data.tweetLength;
            feed.promptStyle      = data.promptStyle;
            feed.fetchFullArticle = data.fetchFullArticle;
            var newRow = createFeedRow(feed);
            div.replaceWith(newRow);
            showFeedback(feedbackEl, '"' + feed.name + '" updated.', 'success');
          } else {
            showFeedback(editFeedback, result.error || 'Failed to save.', 'error');
            saveBtn.disabled = false;
          }
        })
        .catch(function(err) {
          showFeedback(editFeedback, 'Unexpected error: ' + err.message, 'error');
          saveBtn.disabled = false;
        });
    });

    // Toggle enable/disable
    toggleBtn.addEventListener('click', function() {
      var nowEnabled = toggleBtn.textContent.trim() === 'Disabled';
      toggleBtn.disabled = true;

      toggleFeed(feed.rowIndex, nowEnabled)
        .then(function(result) {
          if (result.success) {
            feed.enabled = nowEnabled;
            toggleBtn.textContent = nowEnabled ? 'Enabled' : 'Disabled';
            toggleBtn.className = 'js-toggle-btn px-3 py-1 text-xs font-medium rounded-full transition-colors ' +
              (nowEnabled ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200');
          } else {
            showFeedback(feedbackEl, result.error || 'Failed to update feed.', 'error');
          }
        })
        .catch(function(err) {
          showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
        })
        .finally(function() {
          toggleBtn.disabled = false;
        });
    });

    // Delete
    div.querySelector('.js-delete-btn').addEventListener('click', function() {
      if (!confirm('Delete "' + feed.name + '"? This cannot be undone.')) return;

      deleteFeed(feed.rowIndex)
        .then(function(result) {
          if (result.success) {
            allFeeds = allFeeds.filter(function(f) { return f.rowIndex !== feed.rowIndex; });
            div.remove();
            if (allFeeds.length === 0) {
              listEl.classList.add('hidden');
              emptyEl.classList.remove('hidden');
            }
            showFeedback(feedbackEl, '"' + feed.name + '" deleted.', 'success');
          } else {
            showFeedback(feedbackEl, result.error || 'Failed to delete.', 'error');
          }
        })
        .catch(function(err) {
          showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
        });
    });

    return div;
  }

  // ---- Add feed form ----------------------------------------

  showAddBtn.addEventListener('click', function() {
    addForm.classList.remove('hidden');
    showAddBtn.classList.add('hidden');
    document.getElementById('feedsNewName').focus();
  });

  cancelBtn.addEventListener('click', function() {
    addForm.classList.add('hidden');
    showAddBtn.classList.remove('hidden');
    _resetForm();
  });

  saveBtn.addEventListener('click', function() {
    var name     = document.getElementById('feedsNewName').value.trim();
    var url      = document.getElementById('feedsNewUrl').value.trim();
    var desc     = document.getElementById('feedsNewDesc').value.trim();
    var skipDesc = document.getElementById('feedsNewSkipDesc').checked;

    if (!name) { showFeedback(formFeedback, 'Name is required.', 'error'); return; }
    if (!url)  { showFeedback(formFeedback, 'Feed URL is required.', 'error'); return; }

    saveBtn.disabled = true;
    hideFeedback(formFeedback);

    addFeed(name, url, desc, skipDesc)
      .then(function(result) {
        if (result.success) {
          addForm.classList.add('hidden');
          showAddBtn.classList.remove('hidden');
          _resetForm();
          showFeedback(feedbackEl, result.message || '"' + name + '" added.', 'success');
          loadFeeds(); // reload to get the rowIndex of the new entry
        } else {
          showFeedback(formFeedback, result.error || 'Failed to add feed.', 'error');
        }
      })
      .catch(function(err) {
        showFeedback(formFeedback, 'Unexpected error: ' + err.message, 'error');
      })
      .finally(function() {
        saveBtn.disabled = false;
      });
  });

  function _resetForm() {
    document.getElementById('feedsNewName').value    = '';
    document.getElementById('feedsNewUrl').value     = '';
    document.getElementById('feedsNewDesc').value    = '';
    document.getElementById('feedsNewSkipDesc').checked = false;
    hideFeedback(formFeedback);
  }

  window._loadFeeds = loadFeeds;
}());

// ============================================================
// Authentication — login screen + 24 h localStorage session
// ============================================================

var AUTH_KEY = 'tweetgen_auth';
var AUTH_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

/** Returns true if a valid auth timestamp exists in localStorage. */
function isAuthenticated() {
  try {
    var stored = localStorage.getItem(AUTH_KEY);
    if (!stored) return false;
    var data = JSON.parse(stored);
    return !!(data && data.ts && (Date.now() - data.ts < AUTH_TTL));
  } catch (e) {
    return false;
  }
}

/** Writes the current timestamp to localStorage to start a 24 h session. */
function setAuthenticated() {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ ts: Date.now() }));
}

/** Hides the login screen and reveals the main app. */
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
}

/** Hides the main app and shows the login screen. */
function showLogin() {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

/** Wires up the login form — password submit via button click or Enter key. */
function initLoginForm() {
  var passwordInput = document.getElementById('loginPassword');
  var loginBtn      = document.getElementById('loginBtn');
  var loadingEl     = document.getElementById('loginLoading');
  var feedbackEl    = document.getElementById('loginFeedback');

  function doLogin() {
    var password = passwordInput.value;
    if (!password) {
      showFeedback(feedbackEl, 'Password is required.', 'error');
      return;
    }

    loginBtn.disabled = true;
    hideFeedback(feedbackEl);
    loadingEl.classList.remove('hidden');

    verifyPassword(password)
      .then(function(result) {
        if (result.success) {
          setAuthenticated();
          showApp();
          switchTab('clone');
        } else {
          showFeedback(feedbackEl, result.error || 'Incorrect password.', 'error');
          passwordInput.value = '';
          passwordInput.focus();
        }
      })
      .catch(function(err) {
        showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
      })
      .finally(function() {
        loginBtn.disabled = false;
        loadingEl.classList.add('hidden');
      });
  }

  loginBtn.addEventListener('click', doLogin);
  passwordInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });

  passwordInput.focus();
}

// ============================================================
// Auto Tweets tab
// ============================================================

(function initAutoTab() {
  var refreshBtn      = document.getElementById('autoRefreshBtn');
  var loadingEl       = document.getElementById('autoLoading');
  var feedbackEl      = document.getElementById('autoFeedback');
  var emptyEl         = document.getElementById('autoEmpty');
  var listEl          = document.getElementById('autoList');
  var filterRow       = document.getElementById('autoFilterRow');
  var sourceFilter    = document.getElementById('autoSourceFilter');
  var categoryFilter  = document.getElementById('autoCategoryFilter');

  var allItems = []; // full list, never mutated by filters

  // ---- Load & render ----------------------------------------

  function loadPending() {
    refreshBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    filterRow.classList.add('hidden');
    hideFeedback(feedbackEl);

    listPending()
      .then(function(result) {
        if (!result.success) {
          showFeedback(feedbackEl, result.error || 'Failed to load pending articles.', 'error');
          return;
        }
        allItems = result.items || [];
        populateFilters(allItems);
        applyFilters();
      })
      .catch(function(err) {
        showFeedback(feedbackEl, 'Unexpected error: ' + err.message, 'error');
      })
      .finally(function() {
        refreshBtn.disabled = false;
        loadingEl.classList.add('hidden');
      });
  }

  // ---- Filters ----------------------------------------------

  function populateFilters(items) {
    // Reset to default option only
    sourceFilter.innerHTML   = '<option value="">All sources</option>';
    categoryFilter.innerHTML = '<option value="">All categories</option>';

    var sources    = {};
    var categories = {};

    items.forEach(function(item) {
      if (item.source   && !sources[item.source])     sources[item.source]     = true;
      if (item.category && !categories[item.category]) categories[item.category] = true;
    });

    Object.keys(sources).sort().forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sourceFilter.appendChild(opt);
    });

    Object.keys(categories).sort().forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      categoryFilter.appendChild(opt);
    });

    // Only show filter row if there's something to filter
    if (items.length > 0) filterRow.classList.remove('hidden');
  }

  function applyFilters() {
    var selectedSource   = sourceFilter.value;
    var selectedCategory = categoryFilter.value;

    var filtered = allItems.filter(function(item) {
      var matchSource   = !selectedSource   || item.source   === selectedSource;
      var matchCategory = !selectedCategory || item.category === selectedCategory;
      return matchSource && matchCategory;
    });

    renderCards(filtered);
  }

  sourceFilter.addEventListener('change',   applyFilters);
  categoryFilter.addEventListener('change', applyFilters);

  // ---- Render & empty state ---------------------------------

  function renderCards(items) {
    listEl.innerHTML = '';
    if (items.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    // Sort: approve verdict first → reject verdict → unanalyzed, then by score desc
    items.sort(function(a, b) {
      var av = a.aiVerdict || '', bv = b.aiVerdict || '';
      var aIsApprove = av.indexOf('approve') === 0;
      var bIsApprove = bv.indexOf('approve') === 0;
      var aIsReject  = av.indexOf('reject')  === 0;
      var bIsReject  = bv.indexOf('reject')  === 0;
      if (aIsApprove !== bIsApprove) return aIsApprove ? -1 : 1;
      if (aIsReject  !== bIsReject)  return aIsReject  ? -1 : 1;
      // Both same bucket — sort by score descending
      var aScore = parseInt((av.match(/\((\d+)\//) || [])[1] || '0', 10);
      var bScore = parseInt((bv.match(/\((\d+)\//) || [])[1] || '0', 10);
      return bScore - aScore;
    });
    items.forEach(function(item) {
      listEl.appendChild(createCard(item));
    });
    listEl.classList.remove('hidden');
  }

  function checkIfEmpty() {
    // Remove card from allItems then re-apply filters so count stays correct
    var visibleCards = listEl.querySelectorAll('.border');
    if (visibleCards.length === 0) applyFilters();
  }

  // ---- Build one pending article card -----------------------

  function createCard(item) {
    var fetchedDate = '';
    if (item.fetchedAt) {
      var d = new Date(item.fetchedAt);
      fetchedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
                    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    // Parse ai_verdict: "approve (8/10): reason text" or "reject (3/10): reason text"
    var verdict = null;
    if (item.aiVerdict && item.aiVerdict.trim()) {
      var colonIdx    = item.aiVerdict.indexOf(':');
      var decPart     = colonIdx !== -1 ? item.aiVerdict.substring(0, colonIdx).trim() : item.aiVerdict.trim();
      var reasonPart  = colonIdx !== -1 ? item.aiVerdict.substring(colonIdx + 1).trim() : '';
      var isApprove   = decPart.toLowerCase().indexOf('approve') !== -1;
      var scoreMatch  = decPart.match(/\((\d+)\/10\)/);
      verdict = {
        decision:  isApprove ? 'approve' : 'reject',
        score:     scoreMatch ? scoreMatch[1] : '',
        reason:    reasonPart,
        badgeClass: isApprove ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
        label:      isApprove
          ? '✓ AI: approve' + (scoreMatch ? ' (' + scoreMatch[1] + '/10)' : '')
          : '✗ AI: reject'  + (scoreMatch ? ' (' + scoreMatch[1] + '/10)' : ''),
      };
    }

    var div = document.createElement('div');
    div.className = 'border border-gray-200 rounded-lg p-4 space-y-3';

    div.innerHTML =
      // Article title + meta
      '<div>' +
        '<a class="js-article-link text-sm font-medium text-blue-600 hover:underline break-words" target="_blank" rel="noopener noreferrer"></a>' +
        '<div class="flex flex-wrap items-center gap-2 mt-1.5">' +
          '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 js-source-badge"></span>' +
          '<span class="js-category-badge hidden inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600"></span>' +
          (verdict ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + verdict.badgeClass + '">' + escapeHtml(verdict.label) + '</span>' : '') +
          (fetchedDate ? '<span class="text-xs text-gray-400">Fetched: ' + escapeHtml(fetchedDate) + '</span>' : '') +
        '</div>' +
        (verdict && verdict.reason ? '<p class="js-verdict-reason text-xs text-gray-500 italic mt-1 break-words"></p>' : '') +
      '</div>' +

      // Tweet draft editor
      '<div>' +
        '<label class="block text-xs font-medium text-gray-500 mb-1">' +
          'Tweet draft <span class="font-normal text-gray-400">(edit before approving)</span>' +
        '</label>' +
        '<textarea class="js-draft w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" rows="5"></textarea>' +
        '<p class="js-char-count text-right text-xs text-gray-400 mt-1">0 / 280</p>' +
      '</div>' +

      // Per-card feedback
      '<div class="js-card-feedback hidden"></div>' +

      // Action buttons
      '<div class="flex gap-2">' +
        '<button class="js-approve-btn flex-1 py-2 text-sm font-semibold text-white bg-green-500 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Approve &amp; Post</button>' +
        '<button class="js-copy-btn flex-1 py-2 text-sm font-semibold text-blue-500 bg-white border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Copy &amp; Approve</button>' +
        '<button class="js-reject-btn flex-1 py-2 text-sm font-semibold text-red-500 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Reject</button>' +
      '</div>';

    // Set text content safely
    var articleLink = div.querySelector('.js-article-link');
    articleLink.href        = item.articleUrl;
    articleLink.textContent = item.title || item.articleUrl;
    div.querySelector('.js-source-badge').textContent = item.source || 'Unknown';

    // Show category badge if present
    if (item.category) {
      var catBadge = div.querySelector('.js-category-badge');
      catBadge.textContent = item.category;
      catBadge.classList.remove('hidden');
    }

    // Show verdict reason if present
    if (verdict && verdict.reason) {
      var reasonEl = div.querySelector('.js-verdict-reason');
      if (reasonEl) reasonEl.textContent = verdict.reason;
    }

    // Pre-fill draft
    var draftArea  = div.querySelector('.js-draft');
    var charCount  = div.querySelector('.js-char-count');
    draftArea.value = item.tweetDraft || '';
    updateCharCount(draftArea, charCount, 260);

    draftArea.addEventListener('input', function() {
      updateCharCount(draftArea, charCount, 260);
    });

    // ---- Wire up buttons ----

    var approveBtn   = div.querySelector('.js-approve-btn');
    var copyBtn      = div.querySelector('.js-copy-btn');
    var rejectBtn    = div.querySelector('.js-reject-btn');
    var cardFeedback = div.querySelector('.js-card-feedback');

    approveBtn.addEventListener('click', function() {
      var draft = draftArea.value.trim();
      if (!draft) {
        showFeedback(cardFeedback, 'Tweet text is required.', 'error');
        return;
      }
      if (draft.length > 280) {
        showFeedback(cardFeedback, 'Tweet exceeds 280 characters.', 'error');
        return;
      }

      approveBtn.disabled = true;
      rejectBtn.disabled  = true;
      hideFeedback(cardFeedback);

      approveTweet(item.rowIndex, draft)
        .then(function(result) {
          if (result.success) {
            // Remove from allItems so filter count stays accurate
            allItems = allItems.filter(function(i) { return i.rowIndex !== item.rowIndex; });
            div.remove();
            checkIfEmpty();
            showFeedback(feedbackEl, 'Tweet posted: "' + draft.substring(0, 60) + (draft.length > 60 ? '…' : '') + '"', 'success');
          } else {
            showFeedback(cardFeedback, result.error || 'Failed to post.', 'error');
            approveBtn.disabled = false;
            rejectBtn.disabled  = false;
          }
        })
        .catch(function(err) {
          showFeedback(cardFeedback, 'Unexpected error: ' + err.message, 'error');
          approveBtn.disabled = false;
          rejectBtn.disabled  = false;
        });
    });

    // Copy & Approve — copies draft to clipboard, marks approved, removes card
    copyBtn.addEventListener('click', function() {
      var draft = draftArea.value.trim();
      if (!draft) {
        showFeedback(cardFeedback, 'Tweet text is empty.', 'error');
        return;
      }

      copyBtn.disabled    = true;
      approveBtn.disabled = true;
      rejectBtn.disabled  = true;

      // Copy to clipboard, fall back to textarea select if API unavailable
      var copyPromise = navigator.clipboard
        ? navigator.clipboard.writeText(draft)
        : Promise.reject(new Error('Clipboard API unavailable'));

      copyPromise.catch(function() {
        // Fallback: select the textarea so the user can Ctrl+C manually
        draftArea.select();
      });

      markApproved(item.rowIndex)
        .then(function(result) {
          if (result.success) {
            allItems = allItems.filter(function(i) { return i.rowIndex !== item.rowIndex; });
            div.remove();
            checkIfEmpty();
            showFeedback(feedbackEl, 'Copied to clipboard — paste it in the X app.', 'success');
          } else {
            showFeedback(cardFeedback, result.error || 'Failed to mark approved.', 'error');
            copyBtn.disabled    = false;
            approveBtn.disabled = false;
            rejectBtn.disabled  = false;
          }
        })
        .catch(function(err) {
          showFeedback(cardFeedback, 'Unexpected error: ' + err.message, 'error');
          copyBtn.disabled    = false;
          approveBtn.disabled = false;
          rejectBtn.disabled  = false;
        });
    });

    rejectBtn.addEventListener('click', function() {      approveBtn.disabled = true;
      rejectBtn.disabled  = true;
      hideFeedback(cardFeedback);

      rejectTweet(item.rowIndex)
        .then(function(result) {
          if (result.success) {
            allItems = allItems.filter(function(i) { return i.rowIndex !== item.rowIndex; });
            div.remove();
            checkIfEmpty();
          } else {
            showFeedback(cardFeedback, result.error || 'Failed to reject.', 'error');
            approveBtn.disabled = false;
            rejectBtn.disabled  = false;
          }
        })
        .catch(function(err) {
          showFeedback(cardFeedback, 'Unexpected error: ' + err.message, 'error');
          approveBtn.disabled = false;
          rejectBtn.disabled  = false;
        });
    });

    return div;
  }

  refreshBtn.addEventListener('click', loadPending);

  // Expose loader for bootstrap lazy-load on first tab activation
  window._loadAutoPending = loadPending;
}());

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // Init cron builders (populates hour/dom selects and sets initial expression)
  initCronBuilder('clone');
  initCronBuilder('new');

  var viewTabLoaded  = false;
  var autoTabLoaded  = false;
  var feedsTabLoaded = false;

  document.getElementById('tabCloneBtn').addEventListener('click', function() { switchTab('clone'); });
  document.getElementById('tabNewBtn').addEventListener('click',   function() { switchTab('new'); });
  document.getElementById('tabViewBtn').addEventListener('click',  function() {
    switchTab('view');
    if (!viewTabLoaded) { viewTabLoaded = true; window._loadViewTweets(); }
  });
  document.getElementById('tabAutoBtn').addEventListener('click',  function() {
    switchTab('auto');
    if (!autoTabLoaded) { autoTabLoaded = true; window._loadAutoPending(); }
  });
  document.getElementById('tabFeedsBtn').addEventListener('click', function() {
    switchTab('feeds');
    if (!feedsTabLoaded) { feedsTabLoaded = true; window._loadFeeds(); }
  });
  document.getElementById('tabEngageBtn').addEventListener('click', function() {
    switchTab('engage');
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebarToggle').addEventListener('click', _openSidebar);
  document.getElementById('sidebarBackdrop').addEventListener('click', _closeSidebar);

  // Auth gate: show app immediately if a valid session exists, otherwise show login
  if (isAuthenticated()) {
    showApp();
    switchTab('clone');
  } else {
    initLoginForm();
  }
});
