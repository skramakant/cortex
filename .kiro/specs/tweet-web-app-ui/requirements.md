# Requirements Document

## Introduction

This feature adds a Google Apps Script Web App UI to the existing tweet-resource-extractor project. The web app provides a browser-accessible form that allows users to submit tweet links with either an immediate "Send Now" action or a scheduled cron expression. On submission, the Web_App writes the data to the "tweet" sheet and, when "Send Now" is selected, immediately triggers extraction and posting for that row. The web app is served via a `doGet()` function using `HtmlService` and integrates with the existing SheetUtils, Extractor, Poster, and Scheduler modules.

## Glossary

- **Web_App**: The Google Apps Script web application served by the `doGet()` function via `HtmlService`.
- **Form**: The HTML form rendered by the Web_App containing the tweet link input and scheduling controls.
- **Tweet_Link**: A URL pointing to a tweet on twitter.com or x.com, entered by the user in the Form.
- **Schedule_Mode**: The user's choice of scheduling — either "Send Now" or "Cron Expression".
- **Cron_Expression**: A 5-field cron string (minute hour dom month dow) entered by the user when Schedule_Mode is "Cron Expression".
- **Sheet**: The "tweet" Google Sheets spreadsheet sheet managed by SheetUtils.gs.
- **Row**: A single data row in the Sheet, with columns A–E corresponding to COL_TWEET_LINK, COL_RESOURCE_LINKS, COL_STATUS, COL_TITLE, and COL_CRON.
- **Extractor**: The `extractResources()` / `processExtractionRow()` functions in Extractor.gs.
- **Poster**: The `postTweetForRow()` function in Poster.gs.
- **Feedback_Area**: The region of the Form page that displays success or error messages to the user after submission.

---

## Requirements

### Requirement 1: Web App Entry Point

**User Story:** As a user, I want to open the web app in a browser, so that I can access the tweet submission form.

#### Acceptance Criteria

1. THE Web_App SHALL expose a `doGet()` function that returns an `HtmlService.HtmlOutput` object.
2. WHEN a browser navigates to the deployed web app URL, THE Web_App SHALL render the Form as an HTML page.
3. THE Web_App SHALL set the page title to "Tweet Scheduler".
4. THE Web_App SHALL be deployable as a Google Apps Script Web App with "Execute as: Me" and "Who has access: Anyone" (or "Anyone within organisation") settings without requiring code changes.

---

### Requirement 2: Tweet Link Input

**User Story:** As a user, I want to enter a tweet link in the form, so that I can specify which tweet to process.

#### Acceptance Criteria

1. THE Form SHALL display a labelled text input field for the Tweet_Link.
2. WHEN the user submits the Form with an empty Tweet_Link field, THE Web_App SHALL display an error message in the Feedback_Area and SHALL NOT write any data to the Sheet.
3. WHEN the user submits the Form with a Tweet_Link that does not match the pattern `https?://(twitter\.com|x\.com)/[^/]+/status/\d+`, THE Web_App SHALL display an error message in the Feedback_Area and SHALL NOT write any data to the Sheet.
4. WHEN the user submits the Form with a valid Tweet_Link, THE Web_App SHALL write the Tweet_Link to column A (COL_TWEET_LINK) of a new Row in the Sheet.

---

### Requirement 3: Schedule Mode Selection

**User Story:** As a user, I want to choose between sending a tweet immediately or scheduling it with a cron expression, so that I can control when the tweet is posted.

#### Acceptance Criteria

1. THE Form SHALL display two mutually exclusive Schedule_Mode options: "Send Now" and "Cron Expression".
2. WHEN the Form is first loaded, THE Web_App SHALL default the selected Schedule_Mode to "Send Now".
3. WHEN the user selects "Send Now", THE Form SHALL hide the Cron_Expression input field.
4. WHEN the user selects "Cron Expression", THE Form SHALL show a labelled text input field for the Cron_Expression.
5. WHEN the user submits the Form with Schedule_Mode set to "Send Now", THE Web_App SHALL write an empty string to column E (COL_CRON) of the new Row.
6. WHEN the user submits the Form with Schedule_Mode set to "Cron Expression", THE Web_App SHALL write the entered Cron_Expression value to column E (COL_CRON) of the new Row.

---

### Requirement 4: Cron Expression Validation

**User Story:** As a user, I want the form to validate my cron expression before saving, so that I don't accidentally schedule a tweet with an invalid schedule.

#### Acceptance Criteria

1. WHEN the user submits the Form with Schedule_Mode set to "Cron Expression" and an empty Cron_Expression field, THE Web_App SHALL display an error message in the Feedback_Area and SHALL NOT write any data to the Sheet.
2. WHEN the user submits the Form with Schedule_Mode set to "Cron Expression" and a Cron_Expression that does not parse successfully via `parseCronExpression()`, THE Web_App SHALL display an error message in the Feedback_Area and SHALL NOT write any data to the Sheet.
3. WHEN the user submits the Form with Schedule_Mode set to "Cron Expression" and a valid Cron_Expression, THE Web_App SHALL write the Cron_Expression to column E (COL_CRON) of the new Row.

---

### Requirement 5: Send Now — Immediate Extraction and Posting

**User Story:** As a user, I want the tweet to be extracted and posted immediately when I select "Send Now", so that I don't have to wait for a scheduled trigger.

#### Acceptance Criteria

1. WHEN the user submits the Form with Schedule_Mode set to "Send Now" and a valid Tweet_Link, THE Web_App SHALL call `processExtractionRow()` for the newly written Row before attempting to post.
2. WHEN `processExtractionRow()` completes without writing an error value to column B (COL_RESOURCE_LINKS), THE Web_App SHALL call `postTweetForRow()` for that Row using the values written to columns B and D.
3. WHEN `processExtractionRow()` writes a value beginning with "error:" to column B (COL_RESOURCE_LINKS), THE Web_App SHALL display an error message in the Feedback_Area and SHALL NOT call `postTweetForRow()`.
4. WHEN `postTweetForRow()` writes "sent" to column C (COL_STATUS), THE Web_App SHALL display a success message in the Feedback_Area.
5. WHEN `postTweetForRow()` writes a value beginning with "error:" to column C (COL_STATUS), THE Web_App SHALL display an error message in the Feedback_Area.

---

### Requirement 6: Scheduled Posting — Cron Row Write

**User Story:** As a user, I want my tweet link and cron expression saved to the sheet when I choose "Cron Expression", so that the existing scheduler can pick it up and post at the right time.

#### Acceptance Criteria

1. WHEN the user submits the Form with Schedule_Mode set to "Cron Expression" and both a valid Tweet_Link and valid Cron_Expression, THE Web_App SHALL write the Tweet_Link to column A and the Cron_Expression to column E of a new Row in the Sheet.
2. WHEN the Form submission for a "Cron Expression" row succeeds, THE Web_App SHALL display a success message in the Feedback_Area confirming the tweet has been scheduled.
3. WHEN a "Cron Expression" row is written to the Sheet, THE Web_App SHALL NOT call `processExtractionRow()` or `postTweetForRow()` immediately; those are handled by the existing Extractor and Scheduler triggers.

---

### Requirement 7: User Feedback

**User Story:** As a user, I want to see clear success or error messages after submitting the form, so that I know whether my action succeeded.

#### Acceptance Criteria

1. THE Feedback_Area SHALL be visible on the page after every form submission.
2. WHEN a submission succeeds, THE Web_App SHALL display a success message that distinguishes between "sent immediately" and "scheduled" outcomes.
3. WHEN a submission fails due to a validation error, THE Web_App SHALL display a descriptive error message identifying the invalid field.
4. WHEN a submission fails due to a runtime error during extraction or posting, THE Web_App SHALL display the error detail returned by the failing function.
5. WHEN the Form is first loaded (before any submission), THE Feedback_Area SHALL be hidden or empty.

---

### Requirement 8: Form Reset After Submission

**User Story:** As a user, I want the form to remain usable after a submission, so that I can submit multiple tweets without reloading the page.

#### Acceptance Criteria

1. WHEN a form submission completes (success or error), THE Form SHALL remain on the page without a full page reload.
2. WHEN a form submission succeeds, THE Form SHALL clear the Tweet_Link input field and reset the Schedule_Mode to "Send Now".
3. WHEN a form submission fails, THE Form SHALL retain the entered values so the user can correct and resubmit.

---

### Requirement 9: Server-Side Form Handler

**User Story:** As a developer, I want a server-side `doPost()` handler that processes form submissions, so that the web app logic runs securely in the Apps Script environment.

#### Acceptance Criteria

1. THE Web_App SHALL expose a `doPost(e)` function that accepts form parameters from the client.
2. WHEN `doPost(e)` is called, THE Web_App SHALL read `tweetLink` and `scheduleMode` from the form parameters.
3. WHEN `scheduleMode` is "cron", THE Web_App SHALL also read `cronExpression` from the form parameters.
4. THE Web_App SHALL return a JSON-serialisable response object containing a `success` boolean and either a `message` string (on success) or an `error` string (on failure).
5. THE Web_App SHALL use `ContentService.createTextOutput()` with MIME type `APPLICATION_JSON` to return the response from `doPost(e)`.
