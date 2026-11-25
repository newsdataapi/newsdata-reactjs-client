// Static configuration for the Newsdata.io client: base URL, endpoint paths,
// HTTP defaults, and the per-endpoint accepted-parameter sets.
//
// Parameter names are lowercase here; user-supplied keys are lowercased before
// validation (the API is case-insensitive, so `qInTitle` and `qintitle` are
// equivalent). The sets mirror the server-side filter mapping and the official
// Python/PHP clients.

export const BASE_URL = 'https://newsdata.io/api';

// HTTP defaults.
export const DEFAULT_REQUEST_TIMEOUT = 30_000; // ms
export const DEFAULT_MAX_RETRIES = 5; // total attempts (1 = no retry)
export const DEFAULT_RETRY_BACKOFF = 2_000; // base ms; doubles each attempt
export const DEFAULT_RETRY_BACKOFF_MAX = 60_000; // cap on a single backoff, ms
export const DEFAULT_PAGINATION_DELAY = 1_000; // ms slept between pages

export const SIZE_MIN = 1;
export const SIZE_MAX = 50;

// Endpoint key => path appended to BASE_URL. The path carries the API version.
export const ENDPOINTS = Object.freeze({
  // v1
  latest: '1/latest',
  crypto: '1/crypto',
  archive: '1/archive',
  sources: '1/sources',
  market: '1/market',
  count: '1/count',
  crypto_count: '1/crypto/count',
  market_count: '1/market/count',
  // v2
  news_v2: '2/news',
  market_v2: '2/market',
  crypto_v2: '2/crypto',
  sources_v2: '2/sources',
  count_news_v2: '2/count/news',
  count_market_v2: '2/count/market',
  count_crypto_v2: '2/count/crypto',
  // The real-time service is v2 only.
  websocket_register: '2/websocket/register',
  websocket_fetch: '2/websocket/fetch',
  websocket_delete: '2/websocket/delete',
});

// HTTP method per endpoint; anything absent is a GET.
export const ENDPOINT_METHODS = Object.freeze({
  websocket_register: 'POST',
  websocket_delete: 'DELETE',
});

// The websocket management endpoints answer with a success envelope that may
// carry no `results` field, so they are exempt from the results-present check
// applied to the news endpoints.
export const RESULTS_OPTIONAL = Object.freeze([
  'websocket_register', 'websocket_fetch', 'websocket_delete',
]);

// Real-time WebSocket defaults (NewsDataApiWebSocket).
export const WS_BASE_URL = 'wss://ws.newsdata.io/ws/event';
// The feed a registered query matches against; only news so far.
export const WS_NEWS_TYPE = 'news';
// Close code the server uses for a permanent rejection.
export const WS_POLICY_VIOLATION = 1008;
export const WS_RECONNECT_DELAY = 1_000; // ms before the first reconnect; doubles each retry
export const WS_RECONNECT_DELAY_MAX = 30_000; // cap on the reconnect delay
export const WS_OPEN_TIMEOUT = 10_000; // ms to wait for the opening handshake

// Error codes on a 429 that waiting cannot fix, so they are never retried.
// `ApiLimitExceeded` and `ApiKeyLimitExceeded` mean the API credits are
// exhausted rather than a transient rate limit — backoff cannot conjure more
// credits. `RegistrationLimitExceeded` means every real-time registration the
// plan allows is in use; only deleting one frees a slot.
//
// `ApiLimitExceeded` is the documented code (see the ErrorCode enum in
// https://newsdata.io/openapi.json); `ApiKeyLimitExceeded` is accepted too
// because the API has been observed to send it and the spec is not exhaustive.
export const QUOTA_EXHAUSTED_CODES = Object.freeze([
  'ApiLimitExceeded', 'ApiKeyLimitExceeded', 'RegistrationLimitExceeded',
]);

// Endpoints that require both from_date and to_date.
export const REQUIRES_DATE_RANGE = Object.freeze(['count', 'crypto_count', 'market_count']);

export const BOOL_PARAMS = Object.freeze([
  'full_content', 'image', 'video', 'removeduplicate',
  // v2 spellings
  'content', 'remove_duplicate',
]);
export const INT_PARAMS = Object.freeze(['size']);
export const FLOAT_PARAMS = Object.freeze(['sentiment_score']);

// Mutually-exclusive parameter groups (lowercase). Setting more than one member
// of a group is rejected before the request leaves.
export const MUTEX_GROUPS = Object.freeze([
  ['q', 'qintitle', 'qinmeta'],
  ['country', 'excludecountry'],
  ['category', 'excludecategory'],
  ['language', 'excludelanguage'],
  ['domain', 'domainurl', 'excludedomain', 'excludedomainurl'],
  // v2 names
  ['q', 'q_in_title', 'q_in_meta'],
  ['country', 'exclude_country'],
  ['category', 'exclude_category'],
  ['language', 'exclude_language'],
  ['source_url', 'exclude_source_url'],
]);

// Per-endpoint accepted parameters (lowercase).
export const FILTERS = Object.freeze({
  latest: [
    'q', 'qintitle', 'qinmeta', 'country', 'excludecountry', 'category',
    'excludecategory', 'language', 'excludelanguage', 'domain', 'domainurl',
    'excludedomain', 'excludedomainurl', 'prioritydomain', 'timeframe',
    'timezone', 'size', 'full_content', 'image', 'video', 'page', 'tag',
    'sentiment', 'region', 'excludefield', 'removeduplicate', 'id',
    'organization', 'url', 'sort', 'creator', 'datatype', 'sentiment_score',
  ],
  archive: [
    'q', 'qintitle', 'qinmeta', 'country', 'excludecountry', 'category',
    'excludecategory', 'language', 'excludelanguage', 'domain', 'domainurl',
    'excludedomain', 'excludedomainurl', 'prioritydomain', 'timezone',
    'size', 'full_content', 'image', 'video', 'page', 'from_date', 'to_date',
    'excludefield', 'id', 'url', 'sort', 'tag', 'sentiment',
    'sentiment_score', 'region', 'organization', 'creator', 'datatype',
    'removeduplicate',
  ],
  crypto: [
    'q', 'qintitle', 'qinmeta', 'language', 'excludelanguage', 'domain',
    'domainurl', 'excludedomain', 'excludedomainurl', 'prioritydomain',
    'timeframe', 'timezone', 'size', 'full_content', 'image', 'video',
    'page', 'tag', 'sentiment', 'coin', 'excludefield', 'from_date',
    'to_date', 'removeduplicate', 'id', 'url', 'sort',
  ],
  sources: ['country', 'category', 'language', 'prioritydomain', 'domainurl'],
  market: [
    'q', 'qintitle', 'qinmeta', 'from_date', 'to_date', 'country',
    'excludecountry', 'domain', 'domainurl', 'excludedomain',
    'excludedomainurl', 'language', 'excludelanguage', 'prioritydomain',
    'timezone', 'timeframe', 'size', 'full_content', 'image', 'video',
    'page', 'tag', 'sentiment', 'excludefield', 'removeduplicate',
    'organization', 'market_id', 'id', 'url', 'sort', 'creator', 'datatype',
    'sentiment_score',
  ],
  count: [
    'from_date', 'to_date', 'q', 'qintitle', 'qinmeta', 'country',
    'excludecountry', 'category', 'excludecategory', 'language',
    'excludelanguage', 'domain', 'domainurl', 'excludedomain',
    'excludedomainurl', 'full_content', 'image', 'video', 'prioritydomain',
    'page', 'size', 'sort', 'interval', 'tag', 'sentiment',
    'sentiment_score', 'region', 'organization', 'creator', 'datatype',
    'removeduplicate',
  ],
  crypto_count: [
    'from_date', 'to_date', 'q', 'qintitle', 'qinmeta', 'language',
    'excludelanguage', 'coin', 'domain', 'domainurl', 'excludedomain',
    'excludedomainurl', 'full_content', 'image', 'video', 'prioritydomain',
    'page', 'sentiment', 'size', 'sort', 'tag', 'interval',
    'removeduplicate',
  ],
  market_count: [
    'from_date', 'to_date', 'q', 'qintitle', 'qinmeta', 'country',
    'excludecountry', 'domain', 'domainurl', 'excludedomain',
    'excludedomainurl', 'language', 'excludelanguage', 'full_content',
    'image', 'video', 'organization', 'market_id', 'prioritydomain', 'page',
    'sentiment', 'removeduplicate', 'size', 'sort', 'tag', 'interval',
    'creator', 'datatype', 'sentiment_score',
  ],

  // ---- v2 ----------------------------------------------------------
  // v2 renames the filter vocabulary to snake_case and folds
  // domain/domainurl/excludedomain/excludedomainurl into
  // source_url/exclude_source_url.
  news_v2: [
    'q', 'q_in_title', 'q_in_meta', 'country', 'exclude_country', 'category',
    'exclude_category', 'language', 'exclude_language', 'source_url',
    'exclude_source_url', 'source_priority', 'from_date', 'to_date',
    'timeframe', 'timezone', 'size', 'content', 'image', 'video', 'page',
    'tag', 'sentiment', 'sentiment_score', 'region', 'organization',
    'creator', 'datatype', 'exclude_field', 'remove_duplicate', 'id', 'url',
    'sort',
  ],
  market_v2: [
    'q', 'q_in_title', 'q_in_meta', 'country', 'exclude_country', 'language',
    'exclude_language', 'source_url', 'exclude_source_url',
    'source_priority', 'from_date', 'to_date', 'timeframe', 'timezone',
    'size', 'content', 'image', 'video', 'page', 'tag', 'sentiment',
    'sentiment_score', 'organization', 'market_id', 'creator', 'datatype',
    'exclude_field', 'remove_duplicate', 'id', 'url', 'sort',
  ],
  crypto_v2: [
    'q', 'q_in_title', 'q_in_meta', 'coin', 'language', 'exclude_language',
    'source_url', 'exclude_source_url', 'source_priority', 'from_date',
    'to_date', 'timeframe', 'timezone', 'size', 'content', 'image', 'video',
    'page', 'tag', 'sentiment', 'exclude_field', 'remove_duplicate', 'id',
    'url', 'sort',
  ],
  sources_v2: [
    'country', 'category', 'language', 'source_priority', 'source_url',
  ],
  count_news_v2: [
    'q', 'q_in_title', 'q_in_meta', 'country', 'exclude_country', 'category',
    'exclude_category', 'language', 'exclude_language', 'source_url',
    'exclude_source_url', 'source_priority', 'from_date', 'to_date',
    'timeframe', 'interval', 'size', 'content', 'image', 'video', 'page',
    'tag', 'sentiment', 'sentiment_score', 'region', 'organization',
    'creator', 'datatype', 'remove_duplicate', 'sort',
  ],
  count_market_v2: [
    'q', 'q_in_title', 'q_in_meta', 'country', 'exclude_country', 'language',
    'exclude_language', 'source_url', 'exclude_source_url',
    'source_priority', 'from_date', 'to_date', 'timeframe', 'interval',
    'size', 'content', 'image', 'video', 'page', 'tag', 'sentiment',
    'sentiment_score', 'organization', 'market_id', 'creator', 'datatype',
    'remove_duplicate', 'sort',
  ],
  count_crypto_v2: [
    'q', 'q_in_title', 'q_in_meta', 'coin', 'language', 'exclude_language',
    'source_url', 'exclude_source_url', 'source_priority', 'from_date',
    'to_date', 'timeframe', 'interval', 'size', 'content', 'image', 'video',
    'page', 'tag', 'sentiment', 'remove_duplicate', 'sort',
  ],
  // Real-time query registration. The real-time service is v2 only, so these
  // are the v2 filter names. No date or paging filters apply -- a registered
  // query matches news as it is published. `news_type` is set by
  // websocketRegister, not by the caller.
  websocket_register: [
    'q', 'q_in_title', 'q_in_meta', 'country', 'exclude_country', 'category',
    'exclude_category', 'language', 'exclude_language', 'source_url',
    'exclude_source_url', 'source_priority', 'timezone', 'content', 'image',
    'video', 'remove_duplicate', 'tag', 'sentiment', 'sentiment_score',
    'region', 'organization', 'creator', 'datatype', 'exclude_field',
    'news_type',
  ],
  websocket_fetch: [],
  websocket_delete: ['registration_id'],
});

// Control/meta keys accepted on endpoint methods but not sent as API params.
export const CONTROL_KEYS = Object.freeze([
  'rawQuery', 'scroll', 'paginate', 'maxResult', 'maxPages',
]);
