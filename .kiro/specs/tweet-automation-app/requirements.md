# Requirements Document

## Introduction

The Tweet Generator App is a cross-platform application (Android, iOS, and Web) that helps content creators generate tweet content from YouTube videos. The system extracts transcripts from YouTube videos, uses AI to convert them into self-contained tweets, and provides a copy-to-clipboard feature for manual posting to X (Twitter). The backend is deployed on AWS using Lambda functions behind API Gateway, with infrastructure managed through Terraform and secrets stored in AWS Secrets Manager.

## Glossary

- **Tweet Generator App**: The complete system including mobile apps, web app, and backend services
- **Transcript Extractor**: The component that retrieves text transcripts from YouTube videos
- **Tweet Generator**: The component that uses AWS Bedrock to convert video transcripts into tweet-formatted content
- **Backend Service**: Python-based AWS Lambda functions that handle business logic
- **Mobile Client**: React Native application running on Android and iOS devices
- **Web Client**: React-based web application accessible via browsers
- **API Gateway**: AWS service that routes HTTP requests to Lambda functions
- **AWS Secrets Manager**: AWS service that securely stores API credentials and secrets
- **AWS Bedrock**: AWS service that provides access to foundation models for AI-powered content generation
- **Generated Tweet**: AI-created tweet content ready for manual posting to X

## Requirements

### Requirement 1

**User Story:** As a content creator, I want to input a YouTube video link through the app, so that the system can extract the video transcript for tweet generation.

#### Acceptance Criteria

1. WHEN a user enters a YouTube video URL in the input field, THE Mobile Client SHALL validate the URL format before submission
2. WHEN a user submits a valid YouTube URL, THE Backend Service SHALL retrieve the video transcript using YouTube API or transcript extraction service
3. IF the YouTube video does not have a transcript available, THEN THE Backend Service SHALL return an error message to the user
4. WHEN transcript extraction is in progress, THE Mobile Client SHALL display a loading indicator to the user
5. WHEN transcript extraction completes successfully, THE Backend Service SHALL store the transcript and return a success confirmation

### Requirement 2

**User Story:** As a content creator, I want the system to convert video transcripts into self-contained tweets using AWS Bedrock, so that I have AI-generated, ready-to-post content without manual editing.

#### Acceptance Criteria

1. WHEN a transcript is available, THE Tweet Generator SHALL send the transcript to AWS Bedrock with appropriate prompts for tweet generation
2. WHEN generating tweets, THE Tweet Generator SHALL ensure each tweet is self-contained and understandable without additional context
3. WHEN creating tweet content, THE Tweet Generator SHALL limit each tweet to 280 characters or fewer
4. WHEN multiple tweets are generated from one transcript, THE Tweet Generator SHALL create a numbered sequence or thread structure
5. WHEN tweet generation completes, THE Backend Service SHALL store the generated tweets and make them available for review

### Requirement 3

**User Story:** As a content creator, I want to review and approve generated tweets before posting, so that I maintain control over my Twitter content.

#### Acceptance Criteria

1. WHEN tweets are generated, THE Mobile Client SHALL display all generated tweets in a review interface
2. WHEN reviewing tweets, THE Mobile Client SHALL allow the user to edit individual tweet content
3. WHEN reviewing tweets, THE Mobile Client SHALL allow the user to delete unwanted tweets from the batch
4. WHEN the user approves tweets, THE Mobile Client SHALL send the approved tweets to the Backend Service for posting
5. WHEN the user saves tweets without posting, THE Backend Service SHALL store them as drafts for later use

### Requirement 4

**User Story:** As a content creator, I want the system to post approved tweets to my Twitter profile at a rate of one tweet per hour, so that my content is published automatically while respecting API rate limits.

#### Acceptance Criteria

1. WHEN a user approves tweets for posting, THE Backend Service SHALL authenticate with Twitter API using credentials from AWS Secrets Manager
2. WHEN posting tweets, THE Tweet Scheduler SHALL post one tweet per hour to comply with the Posting Schedule
3. WHEN posting multiple tweets as a thread, THE Backend Service SHALL post them in sequence with proper thread linking across multiple hours
4. IF Twitter API returns a rate limit error, THEN THE Backend Service SHALL queue the tweet and retry after the rate limit resets
5. WHEN a tweet is successfully posted, THE Backend Service SHALL store the tweet ID and timestamp for future reference

### Requirement 5

**User Story:** As a content creator, I want the system to automatically retweet or quote my old tweets, so that I maintain engagement without manual effort.

#### Acceptance Criteria

1. WHEN the engagement schedule triggers, THE Tweet Scheduler SHALL retrieve a list of previously posted tweets from the database
2. WHEN selecting a tweet for engagement, THE Tweet Scheduler SHALL randomly choose from tweets older than 24 hours
3. WHEN performing an engagement action, THE Tweet Scheduler SHALL randomly decide between retweeting or quote tweeting
4. WHEN quote tweeting, THE Tweet Generator SHALL use AWS Bedrock to create contextually relevant commentary for the quoted tweet
5. WHEN the engagement action completes, THE Tweet Scheduler SHALL record the action timestamp to prevent duplicate engagement within 7 days

### Requirement 6

**User Story:** As a content creator, I want to use the app on Android, iOS, and web platforms, so that I can manage my tweets from any device.

#### Acceptance Criteria

1. WHEN a user installs the Mobile Client on Android, THE Mobile Client SHALL provide full functionality on Android devices running version 8.0 or higher
2. WHEN a user installs the Mobile Client on iOS, THE Mobile Client SHALL provide full functionality on iOS devices running version 13.0 or higher
3. WHEN a user accesses the Web Client through a browser, THE Web Client SHALL provide full functionality on Chrome, Firefox, Safari, and Edge browsers
4. WHEN a user switches between devices, THE Backend Service SHALL maintain consistent state and data across all platforms
5. WHEN the user interface renders, THE Mobile Client SHALL adapt layouts appropriately for different screen sizes and orientations

### Requirement 7

**User Story:** As a system administrator, I want the backend deployed on AWS using Lambda and API Gateway, so that the system scales automatically and minimizes operational costs.

#### Acceptance Criteria

1. WHEN API requests are received, THE API Gateway SHALL route requests to appropriate Lambda functions based on endpoint paths
2. WHEN Lambda functions execute, THE Backend Service SHALL process requests and return responses within the API Gateway timeout limits
3. WHEN Lambda functions need to access secrets, THE Backend Service SHALL retrieve credentials from AWS Secrets Manager
4. WHEN system load increases, THE API Gateway SHALL automatically scale Lambda function instances to handle concurrent requests
5. WHEN errors occur in Lambda functions, THE Backend Service SHALL log errors to CloudWatch for monitoring and debugging

### Requirement 8

**User Story:** As a system administrator, I want infrastructure managed through Terraform, so that deployments are reproducible and version-controlled.

#### Acceptance Criteria

1. WHEN infrastructure is provisioned, THE Terraform Configuration SHALL create all required AWS resources including Lambda functions, API Gateway, and Secrets Manager entries
2. WHEN Terraform applies changes, THE Terraform Configuration SHALL manage resource dependencies to ensure correct creation order
3. WHEN infrastructure is updated, THE Terraform Configuration SHALL apply changes without destroying existing data or causing downtime
4. WHEN infrastructure is destroyed, THE Terraform Configuration SHALL cleanly remove all created resources
5. WHEN Terraform state is managed, THE Terraform Configuration SHALL store state in a secure remote backend

### Requirement 9

**User Story:** As a system administrator, I want API credentials and secrets stored in AWS Secrets Manager, so that sensitive information is protected and not hardcoded.

#### Acceptance Criteria

1. WHEN the Backend Service needs Twitter API credentials, THE Backend Service SHALL retrieve them from AWS Secrets Manager at runtime
2. WHEN the Backend Service needs YouTube API credentials, THE Backend Service SHALL retrieve them from AWS Secrets Manager at runtime
3. WHEN the Backend Service needs AWS Bedrock access, THE Backend Service SHALL use IAM roles with appropriate Bedrock permissions
4. WHEN secrets are rotated, THE Backend Service SHALL retrieve updated credentials without requiring code changes or redeployment
5. WHEN accessing secrets, THE Backend Service SHALL use IAM roles with least-privilege permissions

### Requirement 10

**User Story:** As a system administrator, I want the system to work within Twitter API rate limits, so that the service remains operational and cost-effective.

#### Acceptance Criteria

1. WHEN configuring Twitter API access, THE Backend Service SHALL require Twitter API Basic tier or higher credentials
2. WHEN posting tweets, THE Tweet Scheduler SHALL limit posting to approximately 720 tweets per month to stay within Basic tier limits
3. WHEN Twitter API rate limits are approached, THE Backend Service SHALL throttle requests to prevent exceeding monthly quotas
4. WHEN rate limit information is available from Twitter API, THE Backend Service SHALL monitor and log current usage against limits
5. WHEN rate limits are exceeded, THE Backend Service SHALL queue pending actions and notify the system administrator

### Requirement 11

**User Story:** As a content creator, I want the system to handle errors gracefully, so that I understand what went wrong and can take corrective action.

#### Acceptance Criteria

1. WHEN an API error occurs, THE Backend Service SHALL return structured error responses with clear error messages and error codes
2. WHEN a network error occurs, THE Mobile Client SHALL display a user-friendly error message and provide retry options
3. WHEN Twitter API rate limits are exceeded, THE Backend Service SHALL queue pending actions and retry after the rate limit resets
4. WHEN authentication fails, THE Mobile Client SHALL prompt the user to re-authenticate with Twitter
5. WHEN critical errors occur, THE Backend Service SHALL log detailed error information to CloudWatch for troubleshooting
