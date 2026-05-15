// Column index constants for the "tweet" sheet (1-based)
var COL_TWEET_LINK     = 1;  // A — URL of the source tweet
var COL_RESOURCE_LINKS = 2;  // B — comma-separated media URLs, "none", or "error: ..."
var COL_STATUS         = 3;  // C — "", "sent", or "error: ..."
var COL_TITLE          = 4;  // D — tweet text or "error: ..."
var COL_CRON           = 5;  // E — 5-field cron expression or ""
var COL_MAX_COUNT      = 6;  // F — max number of times to post (0 = unlimited)
var COL_POST_COUNT     = 7;  // G — number of times posted so far
