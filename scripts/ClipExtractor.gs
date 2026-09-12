/**
 * ClipExtractor.gs
 * Analyses a YouTube video transcript with Groq and returns suggested clip timestamps.
 *
 * Script Properties used:
 *   GEMINI_API_KEY  — Groq API key (reuses the same key as the tweet generator)
 */

/**
 * Calls Groq to analyse a video transcript and return suggested clips.
 *
 * @param {string} videoTitle   — video title for context
 * @param {string} transcript   — full transcript text with timestamps
 * @returns {{ clips: Array<{clipTitle, start, end, summary}> } | { error: string }}
 */
function analyseTranscriptWithGroq(videoTitle, transcript) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY not set in Script Properties.' };
  }

  // Truncate very long transcripts to keep within token limits (~12k chars)
  var truncated = transcript.length > 12000
    ? transcript.substring(0, 12000) + '\n\n[transcript truncated]'
    : transcript;

  // Read prompt and model from the prompts sheet
  var promptSheet = getOrCreatePromptSheet();
  var sheetResult = getActivePrompt(promptSheet, 'transcript_analysis', { video_title: videoTitle });
  if (!sheetResult) {
    return { error: 'No prompt found for type "transcript_analysis" in the prompts sheet.' };
  }
  var groqModel = sheetResult.model;
  var prompt    = sheetResult.prompt + '\n\nTranscript:\n' + truncated;

  var payload = {
    model:           groqModel,
    messages:        [{ role: 'user', content: prompt }],
    max_tokens:      1000,
    temperature:     0.3,
    response_format: { type: 'json_object' }
  };

  try {
    var response = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:             'POST',
      contentType:        'application/json',
      headers:            { 'Authorization': 'Bearer ' + apiKey },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return {
        error: 'Groq HTTP ' + response.getResponseCode() + ': ' +
               response.getContentText().substring(0, 300)
      };
    }

    var body = JSON.parse(response.getContentText());
    var raw  = body.choices &&
               body.choices[0] &&
               body.choices[0].message &&
               body.choices[0].message.content;

    if (!raw) return { error: 'Empty response from Groq.' };

    var parsed = JSON.parse(raw);
    var clips  = parsed.clips || [];

    if (!Array.isArray(clips) || clips.length === 0) {
      return { error: 'Groq returned no clips. Try a longer or more structured transcript.' };
    }

    // ── Deduplicate by start time, then sort and compute end times ──────────
    var seen = {};
    clips = clips.filter(function(c) {
      var key = String(c.start || '').trim();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });

    clips.sort(function(a, b) {
      return _tsToSecs(String(a.start || '0')) - _tsToSecs(String(b.start || '0'));
    });

    for (var i = 0; i < clips.length; i++) {
      if (i < clips.length - 1) {
        clips[i].end = clips[i + 1].start;             // end = next clip's start
      } else {
        clips[i].end = _secsToTs(_tsToSecs(String(clips[i].start)) + 300); // last clip +5 min
      }
    }

    var valid = clips.filter(function(c) {
      return c.clip_title && c.start && c.end;
    }).map(function(c) {
      return {
        clipTitle: String(c.clip_title).substring(0, 60),
        start:     String(c.start).trim(),
        end:       String(c.end).trim(),
        summary:   String(c.summary || '').substring(0, 200),
      };
    });

    return { clips: valid };

  } catch (e) {
    return { error: 'Groq call failed: ' + e.message };
  }
}

/**
 * Converts a timestamp string (MM:SS or HH:MM:SS) to total seconds.
 * @param {string} ts
 * @returns {number}
 */
function _tsToSecs(ts) {
  var parts = String(ts).trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

/**
 * Converts total seconds to MM:SS or HH:MM:SS string.
 * @param {number} secs
 * @returns {string}
 */
function _secsToTs(secs) {
  secs = Math.max(0, Math.floor(secs));
  var h = Math.floor(secs / 3600);
  var m = Math.floor((secs % 3600) / 60);
  var s = secs % 60;
  var mm = (m < 10 ? '0' : '') + m;
  var ss = (s < 10 ? '0' : '') + s;
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}
