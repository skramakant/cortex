# Requirements Document

## Introduction

This feature adds a static web frontend hosted on GitHub Pages that communicates with the Google Apps Script backend via `fetch()` POST requests. The frontend provides two workflows: (1) **Clone Tweet** — fetch an existing tweet's text and media, edit it, then post immediately or schedule it; (2) **New Tweet** — compose a tweet from scratch and post immediately or schedule it. The GAS backend exposes a JSON API via `doPost()` with action-based routing. The frontend URL is injected at build time via GitHub Actions.

## Glossary

- **Frontend**: The static HTML/CSS/JS site hosted on GitHub Pages (`frontend/public/`)
- **Backend**: The Google Apps Script web app exposing a `doPost()` JSON API
- **GAS_URL**: The deployed GAS web app URL, stored as a GitHub Secret and injected into `api.js` at build time
- **Clone_Tweet_Tab**: The "Clone Tweet" tab — fetches an existing tweet for preview, allows editing, then posts or schedules
- **New_Tweet_Tab**: The "New Tweet" tab — composes a tweet from scratch, then posts or schedules
- **Schedule_Mode**: The user's choice — "Send Now" or "Schedule with Cron"
- **Cron_Expression**: A 5-field cron string (minute hour dom month dow)
- **Max_Count**: Optional limit on how many times a scheduled tweet is posted (0 = unlimited)
- **Feedback_Area**: The element that displays success or error messages after an action
- **Sheet**: The "tweet" Google Sheet managed by the GAS backend

---

## Requirements

### Requirement 1: Static Frontend Hosting

**User Story:** As a user, I want to open the app in a browser via a public URL, so that I can schedule tweets without installing anything.

#### Acceptance Criteria

1. THE Frontend SHALL be a static site deployable to GitHub Pages with no server-side rendering.
2. THE Frontend SHALL load the page title "Tweet Scheduler".
3. THE Frontend SHALL use Tailwind CSS v3 for styling and the Inter font (Google Fonts).
4. THE Frontend SHALL communicate with the GAS backend exclusively via `fetch()` POST requests to the GAS_URL.
5. THE GAS_URL SHALL be injected into `frontend/public/js/api.js` at build time by replacing the `__GAS_URL__` placeholder; it SHALL NOT be hardcoded in source.

---

### Requirement 2: Two-Tab Layout

**User Story:** As a user, I want separate tabs for cloning an existing tweet and composing a new one, so that both workflows are clearly separated.

#### Acceptance Criteria

1. THE Frontend SHALL display two tabs: "Clone Tweet" and "New Tweet".
2. WHEN the page first loads, THE Frontend SHALL show the "Clone Tweet" tab as active.
3. WHEN the user clicks a tab button, THE Frontend SHALL switch to that tab without a page reload.
4. Only one tab SHALL be visible at a time.

---

### Requirement 3: Clone Tweet Tab — Fetch Step

**User Story:** As a user, I want to paste a tweet URL and fetch its content for preview before posting, so that I can review and edit the tweet text.

#### Acceptance Criteria

1. THE Clone_Tweet_Tab SHALL display a text input for the tweet URL and a "Fetch Tweet" button.
2. WHEN the user clicks "Fetch Tweet" with an empty URL, THE Frontend SHALL display an error in the Feedback_Area and SHALL NOT call the backend.
3. WHEN the user clicks "Fetch Tweet" with an invalid URL (not matching `https?://(twitter\.com|x\.com)/[^/]+/status/\d+`), THE Frontend SHALL display an error and SHALL NOT call the backend.
4. WHEN the user clicks "Fetch Tweet" with a valid URL, THE Frontend SHALL call the backend `fetchPreview` action and show a loading indicator.
5. WHEN the backend returns a successful preview, THE Frontend SHALL transition to the preview/edit step, populating the tweet text textarea and rendering any media images.
6. WHEN the backend returns an error, THE Frontend SHALL display the error in the Feedback_Area and remain on the fetch step.

---

### Requirement 4: Clone Tweet Tab — Preview and Edit Step

**User Story:** As a user, I want to review and edit the fetched tweet text before posting, so that I can customize the content.

#### Acceptance Criteria

1. THE preview step SHALL display an editable textarea pre-populated with the fetched tweet text.
2. THE preview step SHALL display a character counter showing current length / 280.
3. WHEN the character count exceeds 280, THE counter SHALL change to a red color.
4. IF the fetched tweet has media URLs, THE preview step SHALL display thumbnail images and the raw URLs.
5. THE preview step SHALL display a "Back" button that returns to the fetch step without losing the entered URL.
6. THE preview step SHALL display the Schedule Mode selection and cron fields (same as Requirement 6).

---

### Requirement 5: New Tweet Tab

**User Story:** As a user, I want to compose a tweet from scratch without needing a source URL, so that I can post original content.

#### Acceptance Criteria

1. THE New_Tweet_Tab SHALL display a textarea for tweet text with a character counter (current / 280).
2. THE New_Tweet_Tab SHALL display an optional text input for a resource link (image or video URL).
3. THE New_Tweet_Tab SHALL display the Schedule Mode selection and cron fields (same as Requirement 6).
4. WHEN the user submits with an empty tweet text field, THE Frontend SHALL display an error and SHALL NOT call the backend.

---

### Requirement 6: Schedule Mode Selection

**User Story:** As a user, I want to choose between posting immediately or scheduling with a cron expression, so that I can control when the tweet is published.

#### Acceptance Criteria

1. BOTH tabs SHALL display two mutually exclusive Schedule_Mode options: "Send Now" and "Schedule with Cron".
2. WHEN the page first loads, THE default Schedule_Mode SHALL be "Send Now" on both tabs.
3. WHEN "Send Now" is selected, THE cron expression input and max count input SHALL be hidden.
4. WHEN "Schedule with Cron" is selected, THE cron expression input and max count input SHALL be shown.
5. WHEN the user submits with Schedule_Mode "Schedule with Cron" and an empty cron field, THE Frontend SHALL display an error and SHALL NOT call the backend.
6. WHEN the user submits with Schedule_Mode "Schedule with Cron" and a cron expression that fails the 5-field format check, THE Frontend SHALL display an error and SHALL NOT call the backend.
7. THE max count input SHALL accept a numeric value; 0 means unlimited.

---

### Requirement 7: Immediate Posting ("Send Now")

**User Story:** As a user, I want the tweet to be posted immediately when I select "Send Now", so that I don't have to wait for a scheduled trigger.

#### Acceptance Criteria

1. WHEN the user submits with Schedule_Mode "Send Now", THE Frontend SHALL call the appropriate backend action (`submitTweet` for clone, `newTweet` for new).
2. WHEN the backend returns `{ success: true }`, THE Frontend SHALL display a success message in the Feedback_Area.
3. WHEN the backend returns `{ success: false }`, THE Frontend SHALL display the error in the Feedback_Area.
4. WHEN posting succeeds, THE Frontend SHALL reset the form (clear inputs, return to "Send Now" mode, return clone tab to fetch step).

---

### Requirement 8: Scheduled Posting ("Schedule with Cron")

**User Story:** As a user, I want my tweet saved to the sheet with a cron expression so the scheduler posts it at the right time.

#### Acceptance Criteria

1. WHEN the user submits with Schedule_Mode "Schedule with Cron" and valid inputs, THE Frontend SHALL call the appropriate backend action.
2. WHEN the backend returns `{ success: true }`, THE Frontend SHALL display a success message containing "scheduled" in the Feedback_Area.
3. WHEN posting succeeds, THE Frontend SHALL reset the form.

---

### Requirement 9: User Feedback

**User Story:** As a user, I want clear success or error messages after every action, so that I know whether it worked.

#### Acceptance Criteria

1. THE Feedback_Area SHALL be hidden on page load and shown after any action completes.
2. Success messages SHALL be styled in green; error messages SHALL be styled in red.
3. WHEN a submission succeeds, THE success message SHALL distinguish between "sent immediately" and "scheduled" outcomes.
4. WHEN a submission fails due to validation, THE error message SHALL identify the invalid field.
5. WHEN a submission fails due to a backend error, THE error detail from the backend response SHALL be displayed.

---

### Requirement 10: Form Reset After Submission

**User Story:** As a user, I want the form to remain usable after a submission so I can submit multiple tweets without reloading.

#### Acceptance Criteria

1. WHEN a submission completes (success or error), THE page SHALL NOT perform a full reload.
2. WHEN a submission succeeds, THE form SHALL clear all inputs and reset Schedule_Mode to "Send Now".
3. WHEN a submission fails, THE form SHALL retain all entered values so the user can correct and resubmit.

---

### Requirement 11: Backend JSON API

**User Story:** As a developer, I want the GAS backend to expose a clean JSON API so the static frontend can call it without `google.script.run`.

#### Acceptance Criteria

1. THE Backend SHALL expose a `doPost(e)` function that reads the request body from `e.postData.contents` as JSON.
2. THE Backend SHALL route requests by the `action` field in the JSON body.
3. THE Backend SHALL support the following actions: `fetchPreview`, `submitTweet`, `newTweet`.
4. THE Backend SHALL return all responses as JSON via `ContentService.createTextOutput(...).setMimeType(ContentService.MimeType.JSON)`.
5. ALL responses SHALL contain a `success` boolean and either a `message` string (on success) or an `error` string (on failure).
6. THE Backend SHALL validate all inputs server-side regardless of client-side validation.
7. THE Backend SHALL wrap the entire `doPost` body in a try/catch and return `{ success: false, error: "Server error: ..." }` for any uncaught exception.

---

### Requirement 12: CI/CD Deployment

**User Story:** As a developer, I want the frontend to deploy automatically on every push to main, so that changes go live without manual steps.

#### Acceptance Criteria

1. THE repository SHALL contain a GitHub Actions workflow at `.github/workflows/deploy.yml`.
2. WHEN a commit is pushed to the `main` branch, THE workflow SHALL build the Tailwind CSS, inject the `GAS_URL` secret, and deploy `frontend/public/` to the `gh-pages` branch.
3. THE `GAS_URL` SHALL be stored as a GitHub repository secret named `GAS_URL` and injected by replacing `__GAS_URL__` in `frontend/public/js/api.js`.
4. THE workflow SHALL also be triggerable manually via `workflow_dispatch`.
