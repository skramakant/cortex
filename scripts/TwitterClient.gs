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

  // Upload media URLs and attach media_ids to the tweet
  if (mediaUrls && mediaUrls.length > 0) {
    var mediaIds = [];
    for (var i = 0; i < mediaUrls.length; i++) {
      var uploadResult = uploadMedia(mediaUrls[i]);
      if (uploadResult.error) {
        // Log the error but continue — post without that media
        Logger.log('Media upload failed for ' + mediaUrls[i] + ': ' + uploadResult.error);
      } else {
        mediaIds.push(uploadResult.mediaId);
      }
    }
    if (mediaIds.length > 0) {
      body.media = { media_ids: mediaIds };
    }
  }

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
 * Uploads an image from a URL to X via the v1.1 media upload API.
 * Fetches the image bytes and uploads them to upload.twitter.com.
 * @param {string} imageUrl  Public URL of the image to upload
 * @returns {{ mediaId: string } | { error: string }}
 */
function uploadMedia(imageUrl) {
  try {
    // Fetch the image bytes
    var imageResponse = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
    if (imageResponse.getResponseCode() !== 200) {
      return { error: 'Failed to fetch image: HTTP ' + imageResponse.getResponseCode() };
    }

    var imageBytes = imageResponse.getContent();
    var contentType = imageResponse.getHeaders()['Content-Type'] || 'image/jpeg';

    // Base64-encode the image
    var base64Image = Utilities.base64Encode(imageBytes);

    // Build OAuth header for the upload endpoint
    var uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    var authHeader;
    try {
      authHeader = buildOAuth1Header('POST', uploadUrl, {});
    } catch (e) {
      return { error: 'auth error: ' + e.message };
    }

    // Upload via multipart form
    var boundary = '----FormBoundary' + generateNonce();
    var payload = '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="media_data"\r\n\r\n' +
      base64Image + '\r\n' +
      '--' + boundary + '--\r\n';

    var uploadResponse = UrlFetchApp.fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      payload: payload,
      muteHttpExceptions: true
    });

    var statusCode = uploadResponse.getResponseCode();
    if (statusCode !== 200 && statusCode !== 201) {
      var errBody;
      try { errBody = JSON.parse(uploadResponse.getContentText()); } catch (e) {}
      var errMsg = (errBody && errBody.errors && errBody.errors[0]) ?
        errBody.errors[0].message : 'HTTP ' + statusCode;
      return { error: 'Media upload failed: ' + errMsg };
    }

    var respBody;
    try {
      respBody = JSON.parse(uploadResponse.getContentText());
    } catch (e) {
      return { error: 'Invalid response from media upload' };
    }

    return { mediaId: respBody.media_id_string };

  } catch (e) {
    return { error: 'Media upload error: ' + e.message };
  }
}


/**
 * Posts a tweet with pre-uploaded media IDs (skips the upload step).
 * Used when a media_id was obtained earlier (e.g. from uploadMediaBase64).
 * @param {string}   text      Tweet text
 * @param {string[]} mediaIds  Array of media_id_string values
 * @returns {{ id: string } | { error: string }}
 */
function postTweetWithMediaIds(text, mediaIds) {
  var url = 'https://api.x.com/2/tweets';

  var authHeader;
  try {
    authHeader = buildOAuth1Header('POST', url, {});
  } catch (e) {
    return { error: 'auth error: ' + e.message };
  }

  var body = { text: text };
  if (mediaIds && mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

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
    try { errBody = JSON.parse(response.getContentText()); } catch (e) {}
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
 * Uploads an image supplied as a raw Base64 string (no data: prefix).
 * Used when the frontend sends a locally-selected file encoded in the browser.
 * @param {string} base64Data  Raw Base64-encoded image bytes (no "data:..." prefix)
 * @returns {{ mediaId: string } | { error: string }}
 */
function uploadMediaBase64(base64Data) {
  try {
    var uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    var authHeader;
    try {
      authHeader = buildOAuth1Header('POST', uploadUrl, {});
    } catch (e) {
      return { error: 'auth error: ' + e.message };
    }

    var boundary = '----FormBoundary' + generateNonce();
    var payload = '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="media_data"\r\n\r\n' +
      base64Data + '\r\n' +
      '--' + boundary + '--\r\n';

    var uploadResponse = UrlFetchApp.fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      payload: payload,
      muteHttpExceptions: true
    });

    var statusCode = uploadResponse.getResponseCode();
    if (statusCode !== 200 && statusCode !== 201) {
      var errBody;
      try { errBody = JSON.parse(uploadResponse.getContentText()); } catch (e) {}
      var errMsg = (errBody && errBody.errors && errBody.errors[0]) ?
        errBody.errors[0].message : 'HTTP ' + statusCode;
      return { error: 'Media upload failed: ' + errMsg };
    }

    var respBody;
    try {
      respBody = JSON.parse(uploadResponse.getContentText());
    } catch (e) {
      return { error: 'Invalid response from media upload' };
    }

    return { mediaId: respBody.media_id_string };

  } catch (e) {
    return { error: 'Media upload error: ' + e.message };
  }
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
