'use strict';

/**
 * Unit tests for TwitterClient.gs — getCredentials()
 *
 * Since GAS files use global scope (no exports), we load the .gs file
 * using Node's `vm` module, injecting mocked GAS globals into the context.
 *
 * Requirements: 5.1, 5.4
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const {
  createMockPropertiesService,
  createMockUrlFetchApp,
  MockUtilities,
} = require('../gasGlobals');

// Path to the GAS source file under test
const TWITTER_CLIENT_PATH = path.resolve(__dirname, '../../scripts/TwitterClient.gs');
const twitterClientCode = fs.readFileSync(TWITTER_CLIENT_PATH, 'utf8');

/**
 * Loads TwitterClient.gs into a fresh vm context with the provided GAS globals.
 * Returns the context so tests can call functions defined in it.
 */
function loadTwitterClient(props) {
  const context = vm.createContext({
    PropertiesService: createMockPropertiesService(props),
    UrlFetchApp: createMockUrlFetchApp({}),
    Utilities: MockUtilities,
  });
  vm.runInContext(twitterClientCode, context);
  return context;
}

// Full set of valid credentials
const VALID_CREDENTIALS = {
  TWITTER_API_KEY: 'test-api-key',
  TWITTER_API_SECRET: 'test-api-secret',
  TWITTER_ACCESS_TOKEN: 'test-access-token',
  TWITTER_ACCESS_TOKEN_SECRET: 'test-access-token-secret',
};

describe('buildOAuth1Header()', () => {
  describe('when credentials are valid', () => {
    let ctx;
    let header;

    beforeEach(() => {
      ctx = loadTwitterClient(VALID_CREDENTIALS);
      header = ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', { 'tweet.fields': 'text' });
    });

    it('returns a string starting with "OAuth "', () => {
      expect(header).toMatch(/^OAuth /);
    });

    it('includes oauth_consumer_key', () => {
      expect(header).toContain('oauth_consumer_key=');
    });

    it('includes oauth_signature_method', () => {
      expect(header).toContain('oauth_signature_method=');
    });

    it('includes oauth_version', () => {
      expect(header).toContain('oauth_version=');
    });

    it('includes oauth_token', () => {
      expect(header).toContain('oauth_token=');
    });

    it('sets oauth_signature_method to "HMAC-SHA1"', () => {
      expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    });

    it('sets oauth_version to "1.0"', () => {
      expect(header).toContain('oauth_version="1.0"');
    });

    it('includes oauth_nonce', () => {
      expect(header).toContain('oauth_nonce=');
    });

    it('includes oauth_timestamp', () => {
      expect(header).toContain('oauth_timestamp=');
    });

    it('includes oauth_signature', () => {
      expect(header).toContain('oauth_signature=');
    });

    it('encodes the consumer key value from credentials', () => {
      // oauth_consumer_key should contain the api key value
      expect(header).toContain('"test-api-key"');
    });

    it('encodes the access token value from credentials', () => {
      // oauth_token should contain the access token value
      expect(header).toContain('"test-access-token"');
    });
  });

  describe('when credentials are missing', () => {
    it('throws when TWITTER_API_KEY is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_API_KEY;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', {})).toThrow();
    });

    it('throws when TWITTER_API_SECRET is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_API_SECRET;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', {})).toThrow();
    });

    it('throws when TWITTER_ACCESS_TOKEN is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_ACCESS_TOKEN;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', {})).toThrow();
    });

    it('throws when TWITTER_ACCESS_TOKEN_SECRET is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_ACCESS_TOKEN_SECRET;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', {})).toThrow();
    });

    it('throws with a descriptive message when credentials are missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_API_KEY;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', {}))
        .toThrow('Missing Twitter API credentials');
    });
  });

  describe('with different HTTP methods', () => {
    it('works with POST method', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      const header = ctx.buildOAuth1Header('POST', 'https://api.x.com/2/tweets', {});
      expect(header).toMatch(/^OAuth /);
    });

    it('works with lowercase method (normalizes to uppercase)', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      const header = ctx.buildOAuth1Header('get', 'https://api.x.com/2/tweets/123', {});
      expect(header).toMatch(/^OAuth /);
    });
  });

  describe('with null or empty params', () => {
    it('works when params is null', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      const header = ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', null);
      expect(header).toMatch(/^OAuth /);
    });

    it('works when params is an empty object', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      const header = ctx.buildOAuth1Header('GET', 'https://api.x.com/2/tweets/123', {});
      expect(header).toMatch(/^OAuth /);
    });
  });
});

describe('fetchTweetData()', () => {
  const TWEET_API_BASE = 'https://api.x.com/2/tweets/';

  /**
   * Builds a mock UrlFetchApp that returns the given status and body for any URL.
   */
  function makeFetchApp(statusCode, bodyObj) {
    return createMockUrlFetchApp({
      '*': () => ({
        getResponseCode() { return statusCode; },
        getContentText() { return JSON.stringify(bodyObj); },
      }),
    });
  }

  /**
   * Loads TwitterClient with valid credentials and a custom UrlFetchApp.
   */
  function loadWithFetch(fetchApp) {
    const context = vm.createContext({
      PropertiesService: createMockPropertiesService(VALID_CREDENTIALS),
      UrlFetchApp: fetchApp,
      Utilities: MockUtilities,
    });
    vm.runInContext(twitterClientCode, context);
    return context;
  }

  describe('successful fetch with photo media', () => {
    it('returns text and photo url in mediaUrls', () => {
      const body = {
        data: { id: '123', text: 'Hello world' },
        includes: {
          media: [
            { media_key: '3_1', type: 'photo', url: 'https://pbs.twimg.com/media/photo.jpg' },
          ],
        },
      };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('123');

      expect(result).toEqual({
        text: 'Hello world',
        mediaUrls: ['https://pbs.twimg.com/media/photo.jpg'],
      });
    });

    it('includes all photo urls when multiple photos are present', () => {
      const body = {
        data: { id: '123', text: 'Multiple photos' },
        includes: {
          media: [
            { media_key: '3_1', type: 'photo', url: 'https://pbs.twimg.com/media/photo1.jpg' },
            { media_key: '3_2', type: 'photo', url: 'https://pbs.twimg.com/media/photo2.jpg' },
          ],
        },
      };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('123');

      expect(result.mediaUrls).toEqual([
        'https://pbs.twimg.com/media/photo1.jpg',
        'https://pbs.twimg.com/media/photo2.jpg',
      ]);
    });
  });

  describe('successful fetch with video media', () => {
    it('returns text and preview_image_url for video in mediaUrls', () => {
      const body = {
        data: { id: '456', text: 'Watch this video' },
        includes: {
          media: [
            {
              media_key: '7_1',
              type: 'video',
              preview_image_url: 'https://pbs.twimg.com/ext_tw_video_thumb/thumb.jpg',
            },
          ],
        },
      };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('456');

      expect(result).toEqual({
        text: 'Watch this video',
        mediaUrls: ['https://pbs.twimg.com/ext_tw_video_thumb/thumb.jpg'],
      });
    });

    it('does not include video url field (only preview_image_url)', () => {
      const body = {
        data: { id: '456', text: 'Video tweet' },
        includes: {
          media: [
            {
              media_key: '7_1',
              type: 'video',
              url: 'https://should-not-be-used.com/video.mp4',
              preview_image_url: 'https://pbs.twimg.com/ext_tw_video_thumb/thumb.jpg',
            },
          ],
        },
      };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('456');

      expect(result.mediaUrls).toEqual(['https://pbs.twimg.com/ext_tw_video_thumb/thumb.jpg']);
    });
  });

  describe('successful fetch with no media', () => {
    it('returns empty mediaUrls when includes.media is absent', () => {
      const body = {
        data: { id: '789', text: 'Text only tweet' },
      };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('789');

      expect(result).toEqual({ text: 'Text only tweet', mediaUrls: [] });
    });

    it('returns empty mediaUrls when includes is present but media array is empty', () => {
      const body = {
        data: { id: '789', text: 'Text only tweet' },
        includes: { media: [] },
      };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('789');

      expect(result.mediaUrls).toEqual([]);
    });
  });

  describe('HTTP error response', () => {
    it('returns { error: "HTTP 404" } on a 404 response', () => {
      const ctx = loadWithFetch(makeFetchApp(404, { title: 'Not Found' }));
      const result = ctx.fetchTweetData('nonexistent');

      expect(result).toEqual({ error: 'HTTP 404' });
    });

    it('returns { error: "HTTP 401" } on a 401 response', () => {
      const ctx = loadWithFetch(makeFetchApp(401, { title: 'Unauthorized' }));
      const result = ctx.fetchTweetData('123');

      expect(result).toEqual({ error: 'HTTP 401' });
    });

    it('returns { error: "HTTP 500" } on a 500 response', () => {
      const ctx = loadWithFetch(makeFetchApp(500, {}));
      const result = ctx.fetchTweetData('123');

      expect(result).toEqual({ error: 'HTTP 500' });
    });
  });

  describe('missing credentials', () => {
    it('returns an auth error when credentials are absent', () => {
      const context = vm.createContext({
        PropertiesService: createMockPropertiesService({}),
        UrlFetchApp: createMockUrlFetchApp({}),
        Utilities: MockUtilities,
      });
      vm.runInContext(twitterClientCode, context);
      const result = context.fetchTweetData('123');

      expect(result.error).toMatch(/auth error|missing credentials/i);
    });
  });

  describe('malformed JSON response', () => {
    it('returns { error: "invalid JSON response" } when body is not valid JSON', () => {
      const fetchApp = createMockUrlFetchApp({
        '*': () => ({
          getResponseCode() { return 200; },
          getContentText() { return 'not-valid-json{{'; },
        }),
      });
      const ctx = loadWithFetch(fetchApp);
      const result = ctx.fetchTweetData('123');

      expect(result).toEqual({ error: 'invalid JSON response' });
    });
  });

  describe('missing data field in response', () => {
    it('returns { error: "no data in response" } when body has no data field', () => {
      const body = { meta: { result_count: 0 } };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.fetchTweetData('123');

      expect(result).toEqual({ error: 'no data in response' });
    });
  });
});

describe('postTweet()', () => {
  /**
   * Loads TwitterClient with valid credentials and a custom UrlFetchApp.
   */
  function loadWithFetch(fetchApp) {
    const context = vm.createContext({
      PropertiesService: createMockPropertiesService(VALID_CREDENTIALS),
      UrlFetchApp: fetchApp,
      Utilities: MockUtilities,
    });
    vm.runInContext(twitterClientCode, context);
    return context;
  }

  /**
   * Builds a mock UrlFetchApp that returns the given status and body for any URL.
   */
  function makeFetchApp(statusCode, bodyObj) {
    return createMockUrlFetchApp({
      '*': () => ({
        getResponseCode() { return statusCode; },
        getContentText() { return JSON.stringify(bodyObj); },
      }),
    });
  }

  describe('successful post', () => {
    it('returns { id } when API responds with HTTP 201', () => {
      const body = { data: { id: '1234567890' } };
      const ctx = loadWithFetch(makeFetchApp(201, body));
      const result = ctx.postTweet('Hello world', []);

      expect(result).toEqual({ id: '1234567890' });
    });

    it('returns { id } when API responds with HTTP 200', () => {
      const body = { data: { id: '9876543210' } };
      const ctx = loadWithFetch(makeFetchApp(200, body));
      const result = ctx.postTweet('Another tweet', []);

      expect(result).toEqual({ id: '9876543210' });
    });

    it('calls POST https://api.x.com/2/tweets', () => {
      let capturedUrl = null;
      let capturedOptions = null;
      const fetchApp = createMockUrlFetchApp({
        '*': (url, options) => {
          capturedUrl = url;
          capturedOptions = options;
          return {
            getResponseCode() { return 201; },
            getContentText() { return JSON.stringify({ data: { id: '111' } }); },
          };
        },
      });
      const ctx = loadWithFetch(fetchApp);
      ctx.postTweet('Test tweet', []);

      expect(capturedUrl).toBe('https://api.x.com/2/tweets');
      expect(capturedOptions.method).toBe('POST');
    });

    it('sends the tweet text in the JSON body', () => {
      let capturedPayload = null;
      const fetchApp = createMockUrlFetchApp({
        '*': (url, options) => {
          capturedPayload = JSON.parse(options.payload);
          return {
            getResponseCode() { return 201; },
            getContentText() { return JSON.stringify({ data: { id: '222' } }); },
          };
        },
      });
      const ctx = loadWithFetch(fetchApp);
      ctx.postTweet('My tweet text', []);

      expect(capturedPayload).toEqual({ text: 'My tweet text' });
    });

    it('includes Authorization header in the request', () => {
      let capturedHeaders = null;
      const fetchApp = createMockUrlFetchApp({
        '*': (url, options) => {
          capturedHeaders = options.headers;
          return {
            getResponseCode() { return 201; },
            getContentText() { return JSON.stringify({ data: { id: '333' } }); },
          };
        },
      });
      const ctx = loadWithFetch(fetchApp);
      ctx.postTweet('Tweet with auth', []);

      expect(capturedHeaders.Authorization).toMatch(/^OAuth /);
    });
  });

  describe('HTTP error response', () => {
    it('returns { error: "HTTP 403" } on a 403 response without detail', () => {
      const ctx = loadWithFetch(makeFetchApp(403, { title: 'Forbidden' }));
      const result = ctx.postTweet('Forbidden tweet', []);

      expect(result).toEqual({ error: 'HTTP 403' });
    });

    it('returns { error: "HTTP 429" } on a 429 rate-limit response without detail', () => {
      const ctx = loadWithFetch(makeFetchApp(429, { title: 'Too Many Requests' }));
      const result = ctx.postTweet('Rate limited tweet', []);

      expect(result).toEqual({ error: 'HTTP 429' });
    });

    it('returns { error: "HTTP 500" } on a 500 response without detail', () => {
      const ctx = loadWithFetch(makeFetchApp(500, {}));
      const result = ctx.postTweet('Server error tweet', []);

      expect(result).toEqual({ error: 'HTTP 500' });
    });
  });

  describe('API error with detail message', () => {
    it('uses the detail field from the error body when present', () => {
      const body = { detail: 'You are not allowed to create a Tweet with duplicate content.' };
      const ctx = loadWithFetch(makeFetchApp(403, body));
      const result = ctx.postTweet('Duplicate tweet', []);

      expect(result).toEqual({ error: 'You are not allowed to create a Tweet with duplicate content.' });
    });

    it('uses the detail field over the generic HTTP status message', () => {
      const body = { detail: 'Your account is suspended.', title: 'Forbidden' };
      const ctx = loadWithFetch(makeFetchApp(403, body));
      const result = ctx.postTweet('Suspended tweet', []);

      expect(result.error).toBe('Your account is suspended.');
    });

    it('falls back to HTTP status when detail is absent', () => {
      const body = { title: 'Forbidden' };
      const ctx = loadWithFetch(makeFetchApp(403, body));
      const result = ctx.postTweet('No detail tweet', []);

      expect(result.error).toBe('HTTP 403');
    });
  });

  describe('missing credentials', () => {
    it('returns an auth error when credentials are absent', () => {
      const context = vm.createContext({
        PropertiesService: createMockPropertiesService({}),
        UrlFetchApp: createMockUrlFetchApp({}),
        Utilities: MockUtilities,
      });
      vm.runInContext(twitterClientCode, context);
      const result = context.postTweet('Tweet without creds', []);

      expect(result.error).toMatch(/auth error|missing credentials/i);
    });

    it('returns an auth error when only some credentials are present', () => {
      const context = vm.createContext({
        PropertiesService: createMockPropertiesService({ TWITTER_API_KEY: 'key-only' }),
        UrlFetchApp: createMockUrlFetchApp({}),
        Utilities: MockUtilities,
      });
      vm.runInContext(twitterClientCode, context);
      const result = context.postTweet('Partial creds tweet', []);

      expect(result.error).toMatch(/auth error|missing credentials/i);
    });
  });
});

describe('getCredentials()', () => {
  describe('when all four credentials are present', () => {
    it('returns an object with all four credential fields', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      const result = ctx.getCredentials();

      expect(result).toEqual({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      });
    });

    it('returns apiKey matching TWITTER_API_KEY', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      expect(ctx.getCredentials().apiKey).toBe('test-api-key');
    });

    it('returns apiSecret matching TWITTER_API_SECRET', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      expect(ctx.getCredentials().apiSecret).toBe('test-api-secret');
    });

    it('returns accessToken matching TWITTER_ACCESS_TOKEN', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      expect(ctx.getCredentials().accessToken).toBe('test-access-token');
    });

    it('returns accessTokenSecret matching TWITTER_ACCESS_TOKEN_SECRET', () => {
      const ctx = loadTwitterClient(VALID_CREDENTIALS);
      expect(ctx.getCredentials().accessTokenSecret).toBe('test-access-token-secret');
    });
  });

  describe('when a credential is missing', () => {
    it('throws when TWITTER_API_KEY is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_API_KEY;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.getCredentials()).toThrow();
    });

    it('throws when TWITTER_API_SECRET is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_API_SECRET;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.getCredentials()).toThrow();
    });

    it('throws when TWITTER_ACCESS_TOKEN is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_ACCESS_TOKEN;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.getCredentials()).toThrow();
    });

    it('throws when TWITTER_ACCESS_TOKEN_SECRET is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_ACCESS_TOKEN_SECRET;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.getCredentials()).toThrow();
    });

    it('throws with a descriptive message when any credential is missing', () => {
      const props = { ...VALID_CREDENTIALS };
      delete props.TWITTER_API_KEY;
      const ctx = loadTwitterClient(props);

      expect(() => ctx.getCredentials()).toThrow('Missing Twitter API credentials');
    });
  });
});
