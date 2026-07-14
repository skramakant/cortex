/**
 * PromptSheet.gs
 * Manages the "prompts" sheet tab.
 *
 * Columns:
 *   A  type     — "short_take" | "educational" | "analyse" | "transcript_analysis"
 *   B  version  — "v1", "v2", etc. Latest version per type is used.
 *   C  prompt   — prompt text. Supports placeholders: {tweet_length}, {tweet_count}, {video_title}
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

function _buildShortTake() {
  return 'Read this article carefully and extract a clear, insightful summary of what it is really about.\n\n' +
    'Then present that summary in plain English, within {tweet_length} characters.\n\n' +
    'The output should be:\n' +
    '- Easy to read and understand for a software engineer — but do not drop specific numbers, names, or key facts to achieve this.\n' +
    '- Written in 2–3 short sentences, not one long run-on sentence.\n' +
    '- If the article covers multiple topics, focus on the single most interesting one.\n' +
    '- Insightful — capture what actually matters, not just the headline\n' +
    '- Written like a human, without any AI flavor\n' +
    '- No URLs, no hashtags\n' +
    '- Do not mention the publication or source name\n\n' +
    'Also classify into one category: "AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
    'Respond with valid JSON only: {"tweet": "...", "category": "..."}';
}

function _buildEducational() {
  return 'You are a senior engineer who teaches through writing. You explain technical concepts from genuine experience, not from a template.\n\n' +
    'Write an educational tweet based on this article. Your audience is a developer with 3-5 years of experience who may not know this specific technology.\n\n' +
    'Core rules:\n' +
    '- Extract the universal principle any developer can apply. The company\'s specific implementation is just an example — the lesson should be transferable.\n' +
    '- The FIRST SENTENCE must be a hook: a surprising fact, a counterintuitive insight, or a specific problem.\n' +
    '- Include at least one specific number or concrete detail from the article.\n' +
    '- Use plain, everyday language. If you use a technical term, explain it immediately in plain English.\n' +
    '- Maximum 4 short paragraphs. Stop when the point is made.\n' +
    '- Discuss the tradeoff when relevant — what you gain, what you give up.\n' +
    '- You MUST use a blank line between paragraphs.\n' +
    '- Write in short sentences. 1–3 sentences per paragraph.\n' +
    '- No URLs, no hashtags.\n' +
    '- Target length: {tweet_length} characters.\n\n' +
    'Here are two examples of the exact style expected:\n\n' +
    'Example 1 — concept explained through a real use case with specific numbers:\n' +
    '"S3 stores your data replicated across multiple nodes. At exabyte scale, storing 3 full copies would be ruinously expensive.\n\n' +
    'Erasure coding solves this. Split your data into k chunks, compute m parity chunks from them. You can lose any m chunks and still reconstruct the original.\n\n' +
    'S3 uses 9 data shards and 4 parity shards across availability zones. That gives 99.999999999% durability at 1.5x the data size — vs 3x for naive replication.\n\n' +
    'The tradeoff is compute. Rebuilding missing chunks needs CPU cycles. Replication just reads a copy. This is why you tune k and m carefully."\n\n' +
    'Example 2 — universal principle, no companies needed:\n' +
    '"LLMs are just the next layer of abstraction in how we tell machines what to do.\n\n' +
    'You do not think about the machine code a compiler generates. You write Python and trust the layers below.\n\n' +
    'An LLM is another layer. Non-deterministic for now, but the same idea. You do not stop being responsible for correctness just because the layer below is smarter.\n\n' +
    'The tool changed. The responsibility did not."\n\n' +
    'Also classify into one category: "AI / ML", "Software Engineering", "Tech Industry", "Startups & Business", "Privacy & Security", "Science", "Politics & Law", "History", "Other"\n\n' +
    'Respond with valid JSON only: {"tweet": "...", "category": "..."}';
}

function _buildAnalyse() {
  return 'You are a social media expert specializing in tech Twitter/X content for an audience of software engineers.\n\n' +
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
}

function _buildTranscriptAnalysis() {
  return 'You are selecting the best clips from a YouTube video for social media (Twitter/X).\n\n' +
    'Video title: {video_title}\n\n' +
    'The user will provide either:\n' +
    '1. YouTube chapter timestamps (e.g. "06:13 Scaling laws explained simply")\n' +
    '2. Or a full transcript with timestamps\n\n' +
    'Your job: identify 3 to 6 clips that are complete, self-contained conversations — each clip should capture one full topic from start to finish.\n\n' +
    'Rules:\n' +
    '- If YouTube chapters are provided, use chapter boundaries as clip start and end times.\n' +
    '- Each clip must be a complete thought — never cut mid-sentence or mid-answer\n' +
    '- Prefer clips that are insightful, opinionated, or surprising\n' +
    '- Avoid intro/outro sections, sponsor segments, and small talk\n' +
    '- Clip length: minimum 1 minute, maximum 5 minutes\n' +
    '- clip_title: use the chapter title if available, otherwise write a short catchy title (max 60 chars)\n\n' +
    'Respond with valid JSON only:\n' +
    '{"clips": [{"clip_title": "...", "start": "MM:SS", "end": "MM:SS", "summary": "one sentence describing the insight in this clip"}]}';
}

function _populateDefaultPrompts(sheet) {
  sheet.getRange(2, 1, 4, 3).setValues([
    ['short_take',          'v1', _buildShortTake()          ],
    ['educational',         'v1', _buildEducational()        ],
    ['analyse',             'v1', _buildAnalyse()            ],
    ['transcript_analysis', 'v1', _buildTranscriptAnalysis() ],
  ]);
}

// ============================================================
// Read helper
// ============================================================

function getActivePrompt(sheet, type, vars) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';

  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  var matching = rows.filter(function(row) {
    return String(row[PS_COL_TYPE - 1]).trim().toLowerCase() === type.toLowerCase().trim();
  });

  if (matching.length === 0) {
    Logger.log('[PromptSheet] No prompt found for type: ' + type);
    return '';
  }

  matching.sort(function(a, b) {
    return String(b[PS_COL_VERSION - 1]).localeCompare(
      String(a[PS_COL_VERSION - 1]), undefined, { numeric: true }
    );
  });

  var prompt = String(matching[0][PS_COL_PROMPT - 1] || '');

  if (vars) {
    Object.keys(vars).forEach(function(key) {
      prompt = prompt.replace(new RegExp('\\{' + key + '\\}', 'g'), String(vars[key]));
    });
  }

  return prompt;
}

// ============================================================
// Migration helper — run once from Apps Script editor
// ============================================================

/**
 * Adds any missing prompt types to an existing prompts sheet.
 * Safe to run multiple times — skips types that already exist.
 */
function addMissingPrompts() {
  var sheet = getOrCreatePromptSheet();
  var lastRow = sheet.getLastRow();
  var existingTypes = [];

  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    existingTypes = rows.map(function(r) { return String(r[0]).trim().toLowerCase(); });
  }

  var defaults = {
    'short_take':          _buildShortTake(),
    'educational':         _buildEducational(),
    'analyse':             _buildAnalyse(),
    'transcript_analysis': _buildTranscriptAnalysis(),
  };

  var toAdd = [];
  Object.keys(defaults).forEach(function(type) {
    if (existingTypes.indexOf(type) === -1) {
      toAdd.push([type, 'v1', defaults[type]]);
      Logger.log('Adding: ' + type);
    } else {
      Logger.log('Already exists: ' + type);
    }
  });

  if (toAdd.length > 0) {
    var nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, toAdd.length, 3).setValues(toAdd);
    Logger.log('Done. Added ' + toAdd.length + ' prompt(s).');
  } else {
    Logger.log('Nothing to add — all prompts already present.');
  }
}
