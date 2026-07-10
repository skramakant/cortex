/**
 * PromptSheet.gs
 * Manages the "prompts" sheet tab.
 *
 * Columns:
 *   A  type     — "short_take" | "analyse"
 *   B  version  — "v1", "v2", etc. Latest version per type is used.
 *   C  prompt   — prompt text. Supports placeholders: {tweet_length}, {tweet_count}
 *
 * To update a prompt: add a new row with the same type and a higher version.
 * The poller and analyser will automatically pick up the latest version.
 */

var PS_COL_TYPE    = 1;
var PS_COL_VERSION = 2;
var PS_COL_PROMPT  = 3;

// ============================================================
// Sheet bootstrap
// ============================================================

/**
 * Returns the prompts sheet, creating it with default prompts if it doesn't exist.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreatePromptSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('prompts');
  if (!sheet) {
    sheet = ss.insertSheet('prompts');
    sheet.getRange(1, 1, 1, 3).setValues([['type', 'version', 'prompt']]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(PS_COL_TYPE,     120);
    sheet.setColumnWidth(PS_COL_VERSION,   80);
    sheet.setColumnWidth(PS_COL_PROMPT,   700);
    sheet.getRange('C:C').setWrap(true);
    _populateDefaultPrompts(sheet);
  }
  return sheet;
}

/**
 * Pre-populates the sheet with the current short_take and analyse prompts.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function _populateDefaultPrompts(sheet) {
  var shortTake =
    'Read this article carefully and extract a clear, insightful summary of what it is really about.\n\n' +
    'Then present that summary in plain English, within {tweet_length} characters.\n\n' +
    'The output should be:\n' +
    '- Easy to read and understand for a software engineer — but do not drop specific numbers, names, or key facts to achieve this. Those details are what make it worth reading.\n' +
    '- Written in 2–3 short sentences, not one long run-on sentence.\n' +
    '- If the article covers multiple topics, focus on the single most interesting one. Do not try to summarise everything.\n' +
    '- Insightful — capture what actually matters, not just the headline\n' +
    '- Written like a human, without any AI flavor\n' +
    '- No URLs, no hashtags\n' +
    '- Do not mention the publication or source name\n\n' +
    'Also classify into one category: "AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
    'Respond with valid JSON only: {"tweet": "...", "category": "..."}';

  var analyse =
    'You are a social media expert specializing in tech Twitter/X content for an audience of software engineers.\n\n' +
    'Analyze these {tweet_count} pending tweet drafts and recommend whether to post each one.\n\n' +
    'APPROVE if the tweet:\n' +
    '- Has a strong hook that makes a developer stop scrolling\n' +
    '- Is specific — uses real names, numbers, product names, or concrete facts\n' +
    '- Is opinionated, educational, or surprising\n' +
    '- Avoids clichéd endings ("left behind", "change is coming", "thoughts?")\n\n' +
    'REJECT if the tweet:\n' +
    '- Is generic or could apply to anything\n' +
    '- Is about politics, entertainment, or history unrelated to tech\n' +
    '- Has multiple "will be left behind" or fear-based endings\n' +
    '- Is about a product release note nobody outside that product cares about\n\n' +
    'Return valid JSON only (json object format). No markdown:\n' +
    '{"results": [{"rowIndex": <number>, "decision": "approve", "score": <1-10>, "reason": "<one sentence why>"}]}';

  sheet.getRange(2, 1, 3, 3).setValues([
    ['short_take', 'v1', shortTake],
    ['analyse',    'v1', analyse  ],
    ['transcript_analysis', 'v1',
      'You are analysing a YouTube video transcript to find the best short clips for social media (Twitter/X).\n\n' +
      'Video title: {video_title}\n\n' +
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
      '{"clips": [{"clip_title": "...", "start": "MM:SS", "end": "MM:SS", "summary": "..."}]}'
    ],
  ]);
}

// ============================================================
// Read helper
// ============================================================

/**
 * Returns the prompt text for the latest version of a given type.
 * If multiple rows exist for the same type, the highest version string wins.
 * Substitutes {tweet_length} and {tweet_count} placeholders before returning.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} type  — "short_take" or "analyse"
 * @param {Object} [vars]  — e.g. { tweet_length: 500, tweet_count: 10 }
 * @returns {string}  prompt text, or empty string if not found
 */
function getActivePrompt(sheet, type, vars) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';

  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  // Filter rows matching the requested type
  var matching = rows.filter(function(row) {
    return String(row[PS_COL_TYPE - 1]).trim().toLowerCase() === type.toLowerCase().trim();
  });

  if (matching.length === 0) {
    Logger.log('[PromptSheet] No prompt found for type: ' + type + '. Using fallback.');
    return '';
  }

  // Sort by version descending so "v2" beats "v1"
  matching.sort(function(a, b) {
    return String(b[PS_COL_VERSION - 1]).localeCompare(
      String(a[PS_COL_VERSION - 1]), undefined, { numeric: true }
    );
  });

  var prompt = String(matching[0][PS_COL_PROMPT - 1] || '');

  // Substitute placeholders
  if (vars) {
    Object.keys(vars).forEach(function(key) {
      prompt = prompt.replace(new RegExp('\\{' + key + '\\}', 'g'), String(vars[key]));
    });
  }

  return prompt;
}
