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

  var prompt =
    'You are analysing a YouTube video transcript to find the best short clips for social media (Twitter/X).\n\n' +
    'Video title: ' + videoTitle + '\n\n' +
    'Identify 3 to 7 clips that:\n' +
    '- Each cover a single coherent topic, insight, or moment\n' +
    '- Are between 30 seconds and 3 minutes long\n' +
    '- Would stand alone as interesting content without the full video\n' +
    '- Focus on insights, interesting facts, or memorable moments — not introductions or sign-offs\n\n' +
    'For each clip return a JSON object with:\n' +
    '- clip_title: short catchy title (max 60 characters)\n' +
    '- start: start timestamp in MM:SS or HH:MM:SS format\n' +
    '- end: end timestamp in MM:SS or HH:MM:SS format\n' +
    '- summary: one sentence describing what this clip is about\n\n' +
    'Respond with valid JSON only:\n' +
    '{"clips": [{"clip_title": "...", "start": "MM:SS", "end": "MM:SS", "summary": "..."}]}\n\n' +
    'Transcript:\n' + truncated;

  var payload = {
    model:           'llama-3.3-70b-versatile',
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

    // Normalise and validate each clip
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
