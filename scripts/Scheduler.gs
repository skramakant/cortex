/**
 * Scheduler.gs
 * Evaluates cron expressions and triggers tweet posting for matching rows.
 */

/**
 * Entry point: scans all rows where col E is non-empty and col C is not "sent",
 * evaluates cron expressions, and posts matching tweets.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
function runScheduler() {
  var sheet = getOrCreateTweetSheet();
  var rows = getAllRows(sheet);
  var now = new Date();

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = row[COL_STATUS - 1];
    var cronExpr = row[COL_CRON - 1];

    if (!cronExpr) continue;
    if (status === 'sent') continue;

    var rowIndex = i + 2; // +1 for header, +1 for 1-based index
    var parsed = parseCronExpression(cronExpr);

    if (!parsed) {
      writeCell(sheet, rowIndex, COL_STATUS, 'error: invalid cron expression');
      continue;
    }

    if (matchesCronSchedule(parsed, now)) {
      var title         = row[COL_TITLE - 1];
      var resourceLinks = row[COL_RESOURCE_LINKS - 1];
      var tweetLink     = row[COL_TWEET_LINK - 1];
      var maxCount      = parseInt(row[COL_MAX_COUNT - 1], 10) || 0;
      var postCount     = parseInt(row[COL_POST_COUNT - 1], 10) || 0;

      // Skip if max count reached (0 means unlimited)
      if (maxCount > 0 && postCount >= maxCount) {
        writeCell(sheet, rowIndex, COL_STATUS, 'sent');
        continue;
      }

      var newPostCount = postCount + 1;

      try {
        postTweetForRow(sheet, rowIndex, title, resourceLinks, maxCount, newPostCount, tweetLink);

        // Only increment post count if the post didn't error
        var statusAfter = sheet.getRange(rowIndex, COL_STATUS).getValue();
        if (String(statusAfter).indexOf('error:') !== 0) {
          writeCell(sheet, rowIndex, COL_POST_COUNT, newPostCount);
        }
      } catch (e) {
        // Safety net: if postTweetForRow throws despite its own try/catch,
        // write the error and continue to the next row
        writeCell(sheet, rowIndex, COL_STATUS, 'error: ' + e.message);
      }
    }
  }
}

/**
 * Parses a 5-field cron expression into a structured object.
 * Fields: minute hour day-of-month month day-of-week
 * Supports: * (wildcard), specific values, ranges (1-5), step values (*\/5), lists (1,3,5)
 * @param {string} cronStr
 * @returns {{ minute, hour, dom, month, dow } | null}  null if invalid
 */
function parseCronExpression(cronStr) {
  if (!cronStr || typeof cronStr !== 'string') return null;
  var fields = cronStr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  // Validate each field is non-empty
  for (var i = 0; i < fields.length; i++) {
    if (!fields[i]) return null;
  }

  var parsed = {
    minute: fields[0],
    hour:   fields[1],
    dom:    fields[2],
    month:  fields[3],
    dow:    fields[4]
  };

  // Validate each field against its allowed range
  if (!isValidCronField(parsed.minute, 0, 59)) return null;
  if (!isValidCronField(parsed.hour,   0, 23)) return null;
  if (!isValidCronField(parsed.dom,    1, 31)) return null;
  if (!isValidCronField(parsed.month,  1, 12)) return null;
  if (!isValidCronField(parsed.dow,    0,  6)) return null;

  return parsed;
}

/**
 * Validates that a cron field string is syntactically correct for the given range.
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isValidCronField(field, min, max) {
  if (field === '*') return true;

  // Comma-separated list — validate each token
  if (field.indexOf(',') !== -1) {
    var parts = field.split(',');
    for (var i = 0; i < parts.length; i++) {
      if (!isValidCronToken(parts[i], min, max)) return false;
    }
    return true;
  }

  return isValidCronToken(field, min, max);
}

/**
 * Validates a single cron token (no commas).
 * @param {string} token
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isValidCronToken(token, min, max) {
  // Step expression: */N or A-B/N
  if (token.indexOf('/') !== -1) {
    var slashParts = token.split('/');
    if (slashParts.length !== 2) return false;
    var step = parseInt(slashParts[1], 10);
    if (isNaN(step) || step < 1) return false;
    if (slashParts[0] !== '*') {
      if (!isValidCronToken(slashParts[0], min, max)) return false;
    }
    return true;
  }

  // Range: A-B
  if (token.indexOf('-') !== -1) {
    var rangeParts = token.split('-');
    if (rangeParts.length !== 2) return false;
    var lo = parseInt(rangeParts[0], 10);
    var hi = parseInt(rangeParts[1], 10);
    if (isNaN(lo) || isNaN(hi)) return false;
    if (lo < min || hi > max || lo > hi) return false;
    return true;
  }

  // Specific numeric value
  var num = parseInt(token, 10);
  if (isNaN(num) || String(num) !== token) return false;
  return num >= min && num <= max;
}

/**
 * Returns true if the given Date matches the parsed cron schedule.
 * @param {Object} parsedCron  result of parseCronExpression
 * @param {Date} date
 * @returns {boolean}
 */
function matchesCronSchedule(parsedCron, date) {
  return (
    matchesCronField(parsedCron.minute, date.getMinutes(),  0, 59) &&
    matchesCronField(parsedCron.hour,   date.getHours(),    0, 23) &&
    matchesCronField(parsedCron.dom,    date.getDate(),     1, 31) &&
    matchesCronField(parsedCron.month,  date.getMonth() + 1, 1, 12) &&
    matchesCronField(parsedCron.dow,    date.getDay(),      0,  6)
  );
}

/**
 * Evaluates whether a single cron field value matches a given numeric value.
 * Handles wildcards, lists, ranges, and step expressions.
 * @param {string} field  one cron field token (e.g. "*\/5", "1-5", "3,7")
 * @param {number} value  the current time component value
 * @param {number} min    minimum valid value for this field
 * @param {number} max    maximum valid value for this field
 * @returns {boolean}
 */
function matchesCronField(field, value, min, max) {
  if (field === '*') return true;

  // Comma-separated list
  if (field.indexOf(',') !== -1) {
    var parts = field.split(',');
    for (var i = 0; i < parts.length; i++) {
      if (matchesCronField(parts[i].trim(), value, min, max)) return true;
    }
    return false;
  }

  // Step expression: */N or A-B/N
  if (field.indexOf('/') !== -1) {
    var slashParts = field.split('/');
    if (slashParts.length !== 2) return false;
    var step = parseInt(slashParts[1], 10);
    if (isNaN(step) || step < 1) return false;

    var rangeMin = min;
    var rangeMax = max;
    if (slashParts[0] !== '*') {
      if (slashParts[0].indexOf('-') !== -1) {
        var rp = slashParts[0].split('-');
        rangeMin = parseInt(rp[0], 10);
        rangeMax = parseInt(rp[1], 10);
      } else {
        rangeMin = parseInt(slashParts[0], 10);
      }
    }
    if (value < rangeMin || value > rangeMax) return false;
    return (value - rangeMin) % step === 0;
  }

  // Range: A-B
  if (field.indexOf('-') !== -1) {
    var rangeParts = field.split('-');
    if (rangeParts.length !== 2) return false;
    var lo = parseInt(rangeParts[0], 10);
    var hi = parseInt(rangeParts[1], 10);
    if (isNaN(lo) || isNaN(hi)) return false;
    return value >= lo && value <= hi;
  }

  // Specific numeric value
  var num = parseInt(field, 10);
  if (isNaN(num)) return false;
  return value === num;
}
