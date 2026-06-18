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
  document.getElementById('tabView').classList.toggle('hidden',  tab !== 'view');

  ['tabCloneBtn', 'tabNewBtn', 'tabViewBtn'].forEach(function(id) {
    var btn    = document.getElementById(id);
    var active = (id === 'tabCloneBtn' && tab === 'clone') ||
                 (id === 'tabNewBtn'   && tab === 'new')   ||
                 (id === 'tabViewBtn'  && tab === 'view');
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
            (tweet.cron    ? '<span class="js-cron-display text-xs text-gray-400 font-mono"></span>' : '') +
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
        '<div class="flex gap-3">' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-medium text-gray-500 mb-1">Cron Expression</label>' +
            '<input type="text" class="js-edit-cron w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" placeholder="e.g. 0 9 * * *">' +
          '</div>' +
          '<div class="w-28">' +
            '<label class="block text-xs font-medium text-gray-500 mb-1">Max Posts</label>' +
            '<input type="number" class="js-edit-max w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" min="0" placeholder="0">' +
          '</div>' +
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
      div.querySelector('.js-cron-display').textContent = tweet.cron;
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
    div.querySelector('.js-edit-cron').value     = tweet.cron          || '';
    div.querySelector('.js-edit-max').value      = tweet.maxCount      || 0;
    div.querySelector('.js-edit-status').value   = tweet.status === 'sent' ? 'sent' : '';

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
      var cron          = div.querySelector('.js-edit-cron').value.trim();
      var maxCount      = parseInt(div.querySelector('.js-edit-max').value, 10) || 0;
      var status        = div.querySelector('.js-edit-status').value;

      if (!title) {
        showFeedback(itemFeedback, 'Tweet text is required.', 'error');
        return;
      }

      if (cron && validateCronExpression(cron)) {
        showFeedback(itemFeedback, validateCronExpression(cron), 'error');
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
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // Init cron builders (populates hour/dom selects and sets initial expression)
  initCronBuilder('clone');
  initCronBuilder('new');

  var viewTabLoaded = false;

  document.getElementById('tabCloneBtn').addEventListener('click', function() { switchTab('clone'); });
  document.getElementById('tabNewBtn').addEventListener('click',   function() { switchTab('new'); });
  document.getElementById('tabViewBtn').addEventListener('click',  function() {
    switchTab('view');
    // Load tweets on first activation only; Refresh button handles subsequent reloads
    if (!viewTabLoaded) {
      viewTabLoaded = true;
      window._loadViewTweets();
    }
  });

  switchTab('clone');
});
