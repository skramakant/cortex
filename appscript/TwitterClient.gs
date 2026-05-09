/**
 * TwitterClient.gs
 * Twitter/X API v2 client with OAuth 1.0a authentication.
 */

/**
 * Retrieves Twitter/X API credentials from PropertiesService.
 * Expected keys: TWITTER_API_KEY, TWITTER_API_SECRET,
 *                TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 * @returns {{ apiKey, apiSecret, accessToken, accessTokenSecret }}
 * @throws {Error} if any credential is missing
 * Requirements: 5.1, 5.4
 */
function getCredentials() {
  var props = PropertiesService.getScriptProperties();
  var apiKey             = props.getProperty('TWITTER_API_KEY');
  var apiSecret          = props.getProperty('TWITTER_API_SECRET');
  var accessToken        = props.getProperty('TWITTER_ACCESS_TOKEN');
  var accessTokenSecret  = props.getProperty('TWITTER_ACCESS_TOKEN_SECRET');

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error('Missing Twitter API credentials in PropertiesService');
  }

  return { apiKey: apiKey, apiSecret: apiSecret, accessToken: accessToken, accessTokenSecret: accessTokenSecret };
}

/**
 * Builds an OAuth 1.0a Authorization header for a given HTTP request.
 * Uses HMAC-SHA1 signing via Utilities.computeHmacSha1Signature.
 * @param {string} method   HTTP method ("GET" or "POST")
 * @param {string} url      full endpoint URL (without query string)
 * @param {Object} params   query/body parameters to include in signature
 * @returns {string}        value for the Authorization header
 * Requirements: 5.1
 */
function buildOAuth1Header(method, url, params) {
  var creds = getCredentials();

  var oauthParams = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            creds.accessToken,
    oauth_version:          '1.0'
  };

  // Merge OAuth params with request params for signature base string
  var allParams = {};
  for (var k in oauthParams) {
    if (oauthParams.hasOwnProperty(k)) allParams[k] = oauthParams[k];
  }
  if (params) {
    for (var p in params) {
      if (params.hasOwnProperty(p)) allParams[p] = params[p];
    }
  }

  // Sort and percent-encode parameters
  var sortedKeys = Object.keys(allParams).sort();
  var paramString = sortedKeys
    .map(function(k) {
      return percentEncode(k) + '=' + percentEncode(allParams[k]);
    })
    .join('&');

  // Build signature base string
  var signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString)
  ].join('&');

  // Build signing key
  var signingKey = percentEncode(creds.apiSecret) + '&' + percentEncode(creds.accessTokenSecret);

  // Compute HMAC-SHA1 signature
  var signatureBytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    signatureBase,
    signingKey
  );
  var signature = Utilities.base64Encode(signatureBytes);

  oauthParams['oauth_signature'] = signature;

  // Build Authorization header
  var headerParts = Object.keys(oauthParams)
    .sort()
    .map(function(k) {
      return percentEncode(k) + '="' + percentEncode(oauthParams[k]) + '"';
    });

  return 'OAuth ' + headerParts.join(', ');
}

/**
 * Fetches a tweet by ID using the X API v2.
 * @param {string} tweetId
 * @returns {{ text: string, mediaUrls: string[] } | { error: string }}
 * Requirements: 2.2, 3.1
 */
function fetchTweetData(tweetId) {
  var url = 'https://api.x.com/2/tweets/' + tweetId;
  var queryParams = {
    'expansions':    'attachments.media_keys',
    'media.fields':  'url,preview_image_url,type',
    'tweet.fields':  'text'
  };

  var queryString = Object.keys(queryParams)
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]); })
    .join('&');

  var fullUrl = url + '?' + queryString;

  var authHeader;
  try {
    authHeader = buildOAuth1Header('GET', url, queryParams);
  } catch (e) {
    return { error: 'auth error: ' + e.message };
  }

  var response = UrlFetchApp.fetch(fullUrl, {
    method: 'GET',
    headers: { Authorization: authHeader },
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    return { error: 'HTTP ' + statusCode };
  }

  var body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (e) {
    return { error: 'invalid JSON response' };
  }

  if (!body.data) {
    return { error: 'no data in response' };
  }

  var text = body.data.text || '';
  var mediaUrls = [];

  if (body.includes && body.includes.media) {
    body.includes.media.forEach(function(media) {
      if (media.type === 'photo' && media.url) {
        mediaUrls.push(media.url);
      } else if (media.type === 'video' && media.preview_image_url) {
        mediaUrls.push(media.preview_image_url);
      }
    });
  }

  return { text: text, mediaUrls: mediaUrls };
}

/**
 * Posts a tweet via the X API v2 POST /2/tweets.
 * @param {string} text
 * @param {string[]} [mediaUrls]  optional array of media URLs to attach
 * @returns {{ id: string } | { error: string }}
 * Requirements: 5.1, 5.2, 5.4
 */
function postTweet(text, mediaUrls) {
  var url = 'https://api.x.com/2/tweets';

  var authHeader;
  try {
    authHeader = buildOAuth1Header('POST', url, {});
  } catch (e) {
    return { error: 'auth error: ' + e.message };
  }

  var body = { text: text };

  var response = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      Authorization:  authHeader,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  if (statusCode !== 201 && statusCode !== 200) {
    var errBody;
    try {
      errBody = JSON.parse(response.getContentText());
    } catch (e) {
      return { error: 'HTTP ' + statusCode };
    }
    var errMsg = (errBody && errBody.detail) ? errBody.detail : 'HTTP ' + statusCode;
    return { error: errMsg };
  }

  var respBody;
  try {
    respBody = JSON.parse(response.getContentText());
  } catch (e) {
    return { error: 'invalid JSON response' };
  }

  return { id: respBody.data && respBody.data.id };
}

/**
 * Generates a random nonce string for OAuth.
 * @returns {string}
 */
function generateNonce() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var nonce = '';
  for (var i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

/**
 * Percent-encodes a string per RFC 3986.
 * @param {string} str
 * @returns {string}
 */
function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g,  '%21')
    .replace(/'/g,  '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}
