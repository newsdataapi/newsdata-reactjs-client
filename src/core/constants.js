// Static configuration for the Newsdata.io client: base URL, endpoint paths,
// HTTP defaults, and the per-endpoint accepted-parameter sets.
//
// Parameter names are lowercase here; user-supplied keys are lowercased before
// validation (the API is case-insensitive, so `qInTitle` and `qintitle` are
// equivalent). The sets mirror the server-side filter mapping and the official
// Python/PHP clients.

export const BASE_URL = 'https://newsdata.io/api/1/';

// HTTP defaults.
export const DEFAULT_REQUEST_TIMEOUT = 30_000; // ms
export const DEFAULT_MAX_RETRIES = 5; // total attempts (1 = no retry)
export const DEFAULT_RETRY_BACKOFF = 2_000; // base ms; doubles each attempt
export const DEFAULT_RETRY_BACKOFF_MAX = 60_000; // cap on a single backoff, ms
export const DEFAULT_PAGINATION_DELAY = 1_000; // ms slept between pages

export const SIZE_MIN = 1;
export const SIZE_MAX = 50;

// Endpoint key => path appended to BASE_URL.
export const ENDPOINTS = Object.freeze({
  latest: 'latest',
  crypto: 'crypto',
  archive: 'archive',
  sources: 'sources',
  market: 'market',
  count: 'count',
  crypto_count: 'crypto/count',
  market_count: 'market/count',
});

// Endpoints that require both from_date and to_date.
export const REQUIRES_DATE_RANGE = Object.freeze(['count', 'crypto_count', 'market_count']);

export const BOOL_PARAMS = Object.freeze(['full_content', 'image', 'video', 'removeduplicate']);
export const INT_PARAMS = Object.freeze(['size']);
export const FLOAT_PARAMS = Object.freeze(['sentiment_score']);

// Mutually-exclusive parameter groups (lowercase). Setting more than one member
// of a group is rejected before the request leaves.
export const MUTEX_GROUPS = Object.freeze([
  ['q', 'qintitle', 'qinmeta'],
  ['country', 'excludecountry'],
  ['category', 'excludecategory'],
  ['language', 'excludelanguage'],
  ['domain', 'domainurl', 'excludedomain'],
]);

// Per-endpoint accepted parameters (lowercase).
export const FILTERS = Object.freeze({
  latest: [
    'q', 'qintitle', 'qinmeta', 'country', 'excludecountry', 'category',
    'excludecategory', 'language', 'excludelanguage', 'domain', 'domainurl',
    'excludedomain', 'prioritydomain', 'timeframe', 'timezone', 'size',
    'full_content', 'image', 'video', 'page', 'tag', 'sentiment', 'region',
    'excludefield', 'removeduplicate', 'id', 'organization', 'url', 'sort',
    'creator', 'datatype', 'sentiment_score',
  ],
  archive: [
    'q', 'qintitle', 'qinmeta', 'country', 'excludecountry', 'category',
    'excludecategory', 'language', 'excludelanguage', 'domain', 'domainurl',
    'excludedomain', 'prioritydomain', 'timezone', 'size', 'full_content',
    'image', 'video', 'page', 'from_date', 'to_date', 'excludefield', 'id',
    'url', 'sort', 'tag', 'sentiment', 'sentiment_score', 'region',
    'organization', 'creator', 'datatype', 'removeduplicate',
  ],
  crypto: [
    'q', 'qintitle', 'qinmeta', 'language', 'excludelanguage', 'domain',
    'domainurl', 'excludedomain', 'prioritydomain', 'timeframe', 'timezone',
    'size', 'full_content', 'image', 'video', 'page', 'tag', 'sentiment',
    'coin', 'excludefield', 'from_date', 'to_date', 'removeduplicate', 'id',
    'url', 'sort',
  ],
  sources: ['country', 'category', 'language', 'prioritydomain', 'domainurl'],
  market: [
    'q', 'qintitle', 'qinmeta', 'from_date', 'to_date', 'country',
    'excludecountry', 'domain', 'domainurl', 'excludedomain', 'language',
    'excludelanguage', 'prioritydomain', 'timezone', 'timeframe', 'size',
    'full_content', 'image', 'video', 'page', 'tag', 'sentiment',
    'excludefield', 'removeduplicate', 'organization', 'symbol', 'id', 'url',
    'sort', 'creator', 'datatype', 'sentiment_score',
  ],
  count: [
    'from_date', 'to_date', 'q', 'qintitle', 'qinmeta', 'country',
    'excludecountry', 'category', 'excludecategory', 'language',
    'excludelanguage', 'domain', 'domainurl', 'excludedomain', 'full_content',
    'image', 'video', 'prioritydomain', 'page', 'size', 'sort', 'interval',
    'tag', 'sentiment', 'sentiment_score', 'region', 'organization', 'creator',
    'datatype', 'removeduplicate',
  ],
  crypto_count: [
    'from_date', 'to_date', 'q', 'qintitle', 'qinmeta', 'language',
    'excludelanguage', 'coin', 'domain', 'domainurl', 'excludedomain',
    'full_content', 'image', 'video', 'prioritydomain', 'page', 'sentiment',
    'size', 'sort', 'tag', 'interval', 'removeduplicate',
  ],
  market_count: [
    'from_date', 'to_date', 'q', 'qintitle', 'qinmeta', 'country',
    'excludecountry', 'domain', 'domainurl', 'excludedomain', 'language',
    'excludelanguage', 'full_content', 'image', 'video', 'organization',
    'symbol', 'prioritydomain', 'page', 'sentiment', 'removeduplicate', 'size',
    'sort', 'tag', 'interval', 'creator', 'datatype', 'sentiment_score',
  ],
});

// Control/meta keys accepted on endpoint methods but not sent as API params.
export const CONTROL_KEYS = Object.freeze([
  'rawQuery', 'scroll', 'paginate', 'maxResult', 'maxPages',
]);
