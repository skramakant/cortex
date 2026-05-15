# Requirements Document

## Introduction

A Google Apps Script that integrates with a Google Sheet named "tweet" to automate two workflows: (1) extracting media resources (images and videos) and text content from tweet URLs, and (2) scheduling and posting tweets at user-defined times using cron expressions. The script reads tweet links entered by the user, fetches associated resources and titles, and posts tweets on schedule while tracking status and post counts in the sheet.

## Glossary

- **Script**: The Google Apps Script bound to the Google Sheet
- **Sheet**: The Google Sheet named "tweet" containing all tweet data
- **Tweet_Link**: A URL pointing to a tweet on Twitter/X (column A)
- **Resource_Links**: A comma-separated list of image and/or video URLs extracted from a tweet (column B)
- **Status**: A text field indicating the posting state of a row — blank (not yet posted) or "sent" (column C)
- **Title**: The text content of the tweet to post (column D)
- **Cron_Expression**: A cron-format string entered by the user to schedule tweet posting (column E)
- **Max_Count**: The maximum number of times a scheduled tweet should be posted; 0 means unlimited (column F)
- **Post_Count**: The number of times a scheduled tweet has been posted so far (column G)
- **Extractor**: The component of the Script responsible for fetching resource links and title from a Tweet_Link
- **Scheduler**: The component of the Script responsible for evaluating Cron_Expressions and triggering tweet posting
- **Poster**: The component of the Script responsible for posting tweets via the Twitter/X API

## Requirements

### Requirement 1: Sheet Structure Initialization

**User Story:** As a user, I want the script to validate and initialize the expected sheet structure, so that I can be confident the script will work correctly with my data.

#### Acceptance Criteria

1. WHEN the Script is run for the first time, THE Script SHALL verify that a sheet named "tweet" exists in the active Google Spreadsheet.
2. IF no sheet named "tweet" exists, THEN THE Script SHALL create a sheet named "tweet" with the following column headers in row 1: "tweet link", "resource links", "status", "title", "cron expression", "max count", "post count".
3. THE Sheet SHALL maintain columns in the fixed order: A (tweet link), B (resource links), C (status), D (title), E (cron expression), F (max count), G (post count).

---

### Requirement 2: Resource Extraction from Tweet Links

**User Story:** As a user, I want the script to automatically extract images and videos from tweet URLs I enter, so that I can collect media resources without manually visiting each tweet.

#### Acceptance Criteria

1. WHEN the Extractor is triggered, THE Extractor SHALL scan all rows in the Sheet where column A (tweet link) is non-empty and column B (resource links) is empty.
2. WHEN a valid Tweet_Link is provided, THE Extractor SHALL fetch the tweet page and extract all image and video URLs present in the tweet.
3. WHEN resource URLs are found, THE Extractor SHALL write them as a comma-separated list into the corresponding row's column B (resource links).
4. IF no media resources are found in a tweet, THEN THE Extractor SHALL write the value "none" into column B of that row.
5. IF the Tweet_Link is malformed or the tweet page is inaccessible, THEN THE Extractor SHALL write "error: [reason]" into column B of that row.
6. THE Extractor SHALL process only rows where column B is empty, preserving any previously extracted resource links.

---

### Requirement 3: Tweet Title Extraction

**User Story:** As a user, I want the script to populate the title column with the tweet's text content, so that I can identify what each tweet is about without opening the link.

#### Acceptance Criteria

1. WHEN the Extractor processes a Tweet_Link, THE Extractor SHALL also extract the text content of the tweet.
2. WHEN tweet text is successfully extracted, THE Extractor SHALL write it into column D (title) of the corresponding row.
3. IF tweet text cannot be extracted, THEN THE Extractor SHALL write "error: unable to extract title" into column D of that row.
4. THE Extractor SHALL process the title for the same rows it processes for resource links (column B empty, column A non-empty).

---

### Requirement 4: Cron-Based Tweet Scheduling

**User Story:** As a user, I want to schedule tweet posting by entering a cron expression, so that my tweets are posted automatically at the right time without manual intervention.

#### Acceptance Criteria

1. WHEN the Scheduler is triggered, THE Scheduler SHALL scan all rows in the Sheet where column E (cron expression) is non-empty and column C (status) is not "sent".
2. WHEN a valid Cron_Expression is found in column E, THE Scheduler SHALL evaluate whether the current time matches the schedule defined by the Cron_Expression.
3. WHEN the current time matches a row's Cron_Expression, THE Scheduler SHALL invoke the Poster to post the tweet for that row.
4. IF column E is empty for a row, THEN THE Scheduler SHALL skip that row without taking any action.
5. IF a Cron_Expression is malformed or cannot be parsed, THEN THE Scheduler SHALL write "error: invalid cron expression" into column C (status) of that row.
6. THE Scheduler SHALL support standard 5-field cron expressions in the format: minute hour day-of-month month day-of-week.

---

### Requirement 4a: Repeat Posting with Max Count

**User Story:** As a user, I want to limit how many times a scheduled tweet is posted, so that recurring tweets stop automatically after a set number of posts.

#### Acceptance Criteria

1. WHEN a row has a non-zero value in column F (max count), THE Scheduler SHALL not invoke the Poster for that row if column G (post count) is already greater than or equal to column F.
2. WHEN the Scheduler skips a row because max count has been reached, THE Scheduler SHALL write "sent" into column C (status) of that row.
3. WHEN the Poster successfully posts a tweet for a scheduled row, THE Scheduler SHALL increment column G (post count) by 1.
4. WHEN column F (max count) is 0, THE Scheduler SHALL treat the row as having unlimited posts and SHALL NOT enforce any post count limit.

---

### Requirement 5: Tweet Posting

**User Story:** As a user, I want the script to post tweets on my behalf using the Twitter/X API, so that scheduled content is published automatically.

#### Acceptance Criteria

1. WHEN the Poster is invoked for a row, THE Poster SHALL post the content from column D (title) as a tweet via the Twitter/X API.
2. WHERE resource links are present in column B and are not "none", THE Poster SHALL attempt to upload and attach the media resources to the tweet when posting.
3. WHEN a tweet is successfully posted, THE Poster SHALL write "sent" into column C (status) of that row.
4. IF the Twitter/X API returns an error, THEN THE Poster SHALL write "error: [API error message]" into column C (status) of that row.
5. THE Poster SHALL not post a tweet for any row where column C (status) is already "sent".

---

### Requirement 6: Scheduled Trigger Setup

**User Story:** As a user, I want the script to automatically run on a recurring schedule, so that cron-based posting is evaluated without me manually running the script.

#### Acceptance Criteria

1. THE Script SHALL provide a setup function that installs a time-based Google Apps Script trigger to run the Scheduler at a regular interval.
2. WHEN the setup function is run, THE Script SHALL create a trigger that invokes the Scheduler every minute.
3. IF a trigger for the Scheduler already exists, THEN THE Script SHALL not create a duplicate trigger.
4. THE Script SHALL provide a teardown function that removes all installed triggers created by the setup function.

---

### Requirement 7: Manual Execution Entry Points

**User Story:** As a user, I want clearly named functions I can run manually from the Apps Script editor, so that I can trigger extraction and scheduling on demand.

#### Acceptance Criteria

1. THE Script SHALL expose a function named `extractResources` that triggers the Extractor for all eligible rows.
2. THE Script SHALL expose a function named `runScheduler` that triggers the Scheduler for all eligible rows.
3. THE Script SHALL expose a function named `setupTriggers` that installs the recurring time-based trigger.
4. THE Script SHALL expose a function named `removeTriggers` that removes all installed triggers.
5. THE Script SHALL expose a function named `diagnoseCreds` that verifies all four Twitter/X API credentials are present in Script Properties and logs the result to the Execution Log.
