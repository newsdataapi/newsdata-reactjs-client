// HTTP client for the Newsdata.io REST API.

import {
  BASE_URL,
  ENDPOINTS,
  ENDPOINT_METHODS,
  RESULTS_OPTIONAL,
  QUOTA_EXHAUSTED_CODES,
  WS_NEWS_TYPE,
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BACKOFF,
  DEFAULT_RETRY_BACKOFF_MAX,
  DEFAULT_PAGINATION_DELAY,
} from './constants.js';
import { validateParams } from './validator.js';
import {
  NewsdataError,
  NewsdataValidationError,
  NewsdataApiError,
  NewsdataAuthError,
  NewsdataRateLimitError,
  NewsdataApiLimitExceededError,
  NewsdataApiKeyLimitExceededError,
  NewsdataServerError,
  NewsdataNetworkError,
} from './errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Replace the apikey value in a URL with REDACTED, for safe logging. */
export function redactApiKey(url) {
  return url.replace(/(apikey=)[^&]*/i, '$1REDACTED');
}

// Error code on a 429 => the error class to raise. None of them is worth
// retrying, but the remedy differs: ApiLimitExceeded is the account's whole
// credit pool, ApiKeyLimitExceeded is this one key's own cap, and
// RegistrationLimitExceeded is the real-time registration slots — it keeps
// the base class, since it is not about credits at all.
const QUOTA_EXHAUSTED_ERRORS = Object.freeze({
  ApiLimitExceeded: NewsdataApiLimitExceededError,
  ApiKeyLimitExceeded: NewsdataApiKeyLimitExceededError,
  RegistrationLimitExceeded: NewsdataRateLimitError,
});

/** The `results.code` string from an error body, if it carries one. */
function extractErrorCode(body) {
  const results = asObject(body)?.results;
  const code = results && typeof results === 'object' ? results.code : undefined;
  return typeof code === 'string' ? code : null;
}

/**
 * The error class for a 429 whose body says the API credits are exhausted,
 * or null when the 429 is a transient rate limit worth retrying.
 */
function quotaExhaustedError(body) {
  const code = extractErrorCode(body);
  return code !== null && QUOTA_EXHAUSTED_CODES.includes(code)
    ? QUOTA_EXHAUSTED_ERRORS[code] ?? NewsdataRateLimitError
    : null;
}

/** Parse a Retry-After header (integer seconds or HTTP-date) into ms. */
function parseRetryAfter(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (v === '') return null;
  if (/^\d+$/.test(v)) return Math.max(0, Number(v) * 1000);
  const when = Date.parse(v);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

export class NewsDataApiClient {
  #apiKey;
  #baseUrl;
  #timeout;
  #maxRetries;
  #retryBackoff;
  #retryBackoffMax;
  #paginationDelay;
  #maxResult;
  #maxPages;
  #includeHeaders;
  #fetch;
  #logger;

  /**
   * @param {string} apiKey
   * @param {object} [options]
   * @param {string} [options.baseUrl]
   * @param {number} [options.timeout]            Per-request timeout (ms).
   * @param {number} [options.maxRetries]         Total attempts (1 = no retry).
   * @param {number} [options.retryBackoff]       Base backoff (ms).
   * @param {number} [options.retryBackoffMax]    Cap on a single backoff (ms).
   * @param {number} [options.paginationDelay]    Delay between pages (ms).
   * @param {number} [options.maxResult]          Default cap for scroll mode.
   * @param {number} [options.maxPages]           Default cap for paginate mode.
   * @param {boolean} [options.includeHeaders]    Attach responseHeaders to results.
   * @param {typeof fetch} [options.fetch]        Custom fetch implementation.
   * @param {object} [options.logger]             Optional logger ({debug,info,warn}).
   */
  constructor(apiKey, options = {}) {
    if (typeof apiKey !== 'string' || apiKey === '') {
      throw new NewsdataValidationError('apiKey must be a non-empty string', 'apiKey');
    }
    this.#apiKey = apiKey;
    const base = options.baseUrl ?? BASE_URL;
    this.#baseUrl = base.endsWith('/') ? base : `${base}/`;
    this.#timeout = options.timeout ?? DEFAULT_REQUEST_TIMEOUT;
    this.#maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.#retryBackoff = options.retryBackoff ?? DEFAULT_RETRY_BACKOFF;
    this.#retryBackoffMax = options.retryBackoffMax ?? DEFAULT_RETRY_BACKOFF_MAX;
    this.#paginationDelay = options.paginationDelay ?? DEFAULT_PAGINATION_DELAY;
    this.#maxResult = options.maxResult ?? null;
    this.#maxPages = options.maxPages ?? null;
    this.#includeHeaders = options.includeHeaders ?? false;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#logger = options.logger ?? null;

    if (typeof this.#fetch !== 'function') {
      throw new NewsdataError('No fetch implementation available; pass options.fetch (Node < 18).');
    }
  }

  // ---- v1 endpoint methods ----------------------------------------------

  /** Latest news. GET /1/latest */
  latestApi(params = {}) { return this.#dispatch('latest', params); }

  /** Historical news. GET /1/archive */
  archiveApi(params = {}) { return this.#dispatch('archive', params); }

  /** Cryptocurrency news. GET /1/crypto */
  cryptoApi(params = {}) { return this.#dispatch('crypto', params); }

  /** Market / financial news. GET /1/market */
  marketApi(params = {}) { return this.#dispatch('market', params); }

  /** Aggregate news counts (requires from_date, to_date). GET /1/count */
  countApi(params = {}) { return this.#dispatch('count', params, true); }

  /** Aggregate crypto counts (requires from_date, to_date). GET /1/crypto/count */
  cryptoCountApi(params = {}) { return this.#dispatch('crypto_count', params, true); }

  /** Aggregate market counts (requires from_date, to_date). GET /1/market/count */
  marketCountApi(params = {}) { return this.#dispatch('market_count', params, true); }

  /**
   * List available news sources. GET /1/sources
   * Single-page endpoint; scroll / paginate are not supported.
   * @returns {Promise<object>}
   */
  sourcesApi(params = {}) {
    const { rawQuery = null, ...rest } = params;
    const validated = validateParams('sources', rest, rawQuery);
    return this.#request('sources', validated);
  }

  // ---- v2 endpoint methods ----------------------------------------------
  //
  // v2 renames the filter vocabulary to snake_case (`q_in_title`,
  // `exclude_country`, `source_priority`, `content`, `remove_duplicate`, …)
  // and folds domain/domainurl/excludedomain/excludedomainurl into
  // `source_url` / `exclude_source_url`. Responses carry `total_results` and
  // `next_page` where v1 carries `totalResults` and `nextPage`.

  /** Latest news, or historical news with from_date / to_date. GET /2/news */
  news(params = {}) { return this.#dispatch('news_v2', params, false, true); }

  /** Market / financial news. GET /2/market */
  market(params = {}) { return this.#dispatch('market_v2', params, false, true); }

  /** Cryptocurrency news. GET /2/crypto */
  crypto(params = {}) { return this.#dispatch('crypto_v2', params, false, true); }

  /** Aggregate news counts. GET /2/count/news */
  countNews(params = {}) { return this.#dispatch('count_news_v2', params, false, true); }

  /** Aggregate market counts. GET /2/count/market */
  countMarket(params = {}) { return this.#dispatch('count_market_v2', params, false, true); }

  /** Aggregate crypto counts. GET /2/count/crypto */
  countCrypto(params = {}) { return this.#dispatch('count_crypto_v2', params, false, true); }

  /**
   * List available news sources. GET /2/sources
   * Single-page endpoint; scroll / paginate are not supported.
   * @returns {Promise<object>}
   */
  sources(params = {}) {
    const { rawQuery = null, ...rest } = params;
    const validated = validateParams('sources_v2', rest, rawQuery);
    return this.#request('sources_v2', validated);
  }

  // ---- real-time query management ---------------------------------------

  /**
   * Register a real-time WebSocket query. POST /2/websocket/register
   *
   * The real-time service is v2 only, so this takes the same filter names as
   * `news()` (`q`, `q_in_title`, `country`, `exclude_country`, `source_url`,
   * `content`, `exclude_field`, `timezone`, …); the date, paging and sorting
   * filters, `id` and `url` do not apply to a standing query. The new query's
   * id is at `results.registration_id` — pass it to
   * `NewsDataApiWebSocket#stream`.
   *
   * Registering an identical query twice rejects with a `NewsdataApiError`
   * whose `statusCode` is 409; the existing id is at
   * `err.responseBody.results.registration_id`.
   * @returns {Promise<object>}
   */
  websocketRegister(params = {}) {
    const { rawQuery = null, ...rest } = params;
    const validated = validateParams('websocket_register', rest, rawQuery);
    validated.news_type = WS_NEWS_TYPE;
    return this.#request('websocket_register', validated);
  }

  /**
   * List the account's registered real-time queries. GET /2/websocket/fetch
   * `results` is a list with one entry per query, each carrying its
   * `registration_id`, the filters it was registered with (`query`), how many
   * devices are streaming it now (`active_clients`) and when one last
   * connected (`last_used`, UTC).
   * @returns {Promise<object>}
   */
  websocketFetch() {
    return this.#request('websocket_fetch', {});
  }

  /**
   * Delete a registered real-time query. DELETE /2/websocket/delete
   * @param {string} registrationId
   * @returns {Promise<object>}
   */
  websocketDelete(registrationId) {
    if (typeof registrationId !== 'string' || registrationId === '') {
      throw new NewsdataValidationError(
        'registrationId must be a non-empty string',
        'registration_id',
      );
    }
    return this.#request('websocket_delete', { registration_id: registrationId });
  }

  /** The API key, for the WebSocket handshake URL. @internal */
  get apiKeyForWebSocket() {
    return this.#apiKey;
  }

  /** The configured fetch, reused by the WebSocket handshake probe. @internal */
  get fetchForWebSocket() {
    return this.#fetch;
  }

  /** Forward a log line from the WebSocket layer. @internal */
  logForWebSocket(level, message) {
    this.#log(level, message);
  }

  // ---- dispatch ---------------------------------------------------------

  /**
   * Validate params and route to single / scroll / paginate execution.
   * Returns a Promise for single & scroll modes, or an async generator when
   * `paginate: true`. `v2` selects the v2 response keys (`total_results` /
   * `next_page`) for the multi-page modes.
   */
  #dispatch(endpoint, params, isCount = false, v2 = false) {
    const {
      rawQuery = null,
      scroll = false,
      paginate = false,
      maxResult,
      maxPages,
      ...rest
    } = params;

    if (scroll && paginate) {
      throw new NewsdataValidationError('scroll and paginate are mutually exclusive');
    }
    const validated = validateParams(endpoint, rest, rawQuery);

    if (paginate) {
      return this.#paginate(endpoint, validated, maxPages ?? this.#maxPages, isCount, v2);
    }
    if (scroll) {
      return this.#scrollAll(endpoint, validated, maxResult ?? this.#maxResult, isCount, v2);
    }
    return this.#request(endpoint, validated);
  }

  // ---- internals --------------------------------------------------------

  #endpointUrl(endpoint) {
    return this.#baseUrl + ENDPOINTS[endpoint];
  }

  #backoff(attempt) {
    return Math.min(this.#retryBackoff * 2 ** (attempt - 1), this.#retryBackoffMax);
  }

  #log(level, message) {
    if (this.#logger && typeof this.#logger[level] === 'function') {
      this.#logger[level](`[newsdataapi] ${message}`);
    }
  }

  /**
   * Execute a single GET with retries and backoff.
   * @returns {Promise<object>}
   */
  async #request(endpoint, params) {
    const search = new URLSearchParams({ ...params, apikey: this.#apiKey });
    const fullUrl = `${this.#endpointUrl(endpoint)}?${search.toString()}`;
    const logUrl = redactApiKey(fullUrl);
    const method = ENDPOINT_METHODS[endpoint] ?? 'GET';

    for (let attempt = 1; attempt <= this.#maxRetries; attempt += 1) {
      this.#log('info', `${method} ${logUrl} (attempt ${attempt}/${this.#maxRetries})`);

      let res;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeout);
      try {
        res = await this.#fetch(fullUrl, {
          method,
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (err) {
        if (attempt >= this.#maxRetries) {
          throw new NewsdataNetworkError(
            `Network error after ${this.#maxRetries} attempts: ${err.message}`,
            err,
          );
        }
        this.#log('warn', `network error: ${err.message}`);
        await sleep(this.#backoff(attempt));
        continue;
      } finally {
        clearTimeout(timer);
      }

      const status = res.status;
      const text = await res.text();
      let body;
      try {
        body = text === '' ? null : JSON.parse(text);
      } catch {
        if (status >= 500 && attempt < this.#maxRetries) {
          this.#log('warn', `non-JSON response (status ${status})`);
          await sleep(this.#backoff(attempt));
          continue;
        }
        throw new NewsdataApiError(`Non-JSON response from API (status ${status})`, status);
      }

      if (status === 200 && this.#isSuccess(body, endpoint)) {
        if (this.#includeHeaders) {
          body.responseHeaders = Object.fromEntries(res.headers.entries());
        }
        return body;
      }

      if (status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        const keyRemaining = res.headers.get('x-apikey-limit-remaining');
        if (keyRemaining !== null) {
          this.#log('warn', `X-APIKEY-Limit-Remaining: ${keyRemaining}`);
        }
        // A 429 covers a burst limit, a rate limit, and exhausted API
        // credits. Only the first two are worth retrying.
        const QuotaError = quotaExhaustedError(body);
        if (QuotaError !== null || attempt >= this.#maxRetries) {
          const ErrorClass = QuotaError ?? NewsdataRateLimitError;
          throw new ErrorClass(
            this.#errorMessage(body, status), 429, asObject(body),
            retryAfter === null ? null : Math.round(retryAfter / 1000),
          );
        }
        const wait = retryAfter ?? this.#backoff(attempt);
        this.#log('warn', `429 rate limit; sleeping ${wait}ms`);
        await sleep(wait);
        continue;
      }

      if (status >= 500) {
        if (attempt >= this.#maxRetries) {
          throw new NewsdataServerError(this.#errorMessage(body, status), status, asObject(body));
        }
        this.#log('warn', `${status} server error`);
        await sleep(this.#backoff(attempt));
        continue;
      }

      if (status === 401 || status === 403) {
        throw new NewsdataAuthError(this.#errorMessage(body, status), status, asObject(body));
      }

      throw new NewsdataApiError(this.#errorMessage(body, status), status, asObject(body));
    }

    // Defensive: the loop always returns or throws above.
    throw new NewsdataError(`Request to ${endpoint} did not complete (maxRetries=${this.#maxRetries})`);
  }

  /**
   * Follow nextPage cursors and return one merged response. For count endpoints
   * the final aggregate dict (results returned as an object) is captured under
   * `aggregate`.
   * @returns {Promise<object>}
   */
  async #scrollAll(endpoint, params, maxResult, isCount, v2 = false) {
    const [totalKey, nextKey] = v2
      ? ['total_results', 'next_page']
      : ['totalResults', 'nextPage'];
    const accumulated = [];
    const request = { ...params };
    let totalResults = null;
    let nextPage = null;
    let aggregate = null;
    let lastHeaders = null;

    for (;;) {
      const response = await this.#request(endpoint, request);
      totalResults = response[totalKey] ?? totalResults;
      const pageResults = response.results ?? [];
      if (Array.isArray(pageResults)) {
        accumulated.push(...pageResults);
      } else if (isCount && pageResults && typeof pageResults === 'object') {
        aggregate = pageResults;
      }
      if (this.#includeHeaders) lastHeaders = response.responseHeaders;
      nextPage = response[nextKey] ?? null;

      if (maxResult != null && accumulated.length >= maxResult) {
        accumulated.length = maxResult;
        nextPage = null;
        break;
      }
      if (!nextPage) break;
      request.page = nextPage;
      await sleep(this.#paginationDelay);
    }

    const merged = { [totalKey]: totalResults, results: accumulated, [nextKey]: nextPage };
    if (aggregate !== null) merged.aggregate = aggregate;
    if (lastHeaders != null) merged.responseHeaders = lastHeaders;
    return merged;
  }

  /**
   * Yield one response per page, up to maxPages.
   * @returns {AsyncGenerator<object>}
   */
  async *#paginate(endpoint, params, maxPages, isCount, v2 = false) {
    const nextKey = v2 ? 'next_page' : 'nextPage';
    const request = { ...params };
    let pages = 0;
    for (;;) {
      const response = await this.#request(endpoint, request);
      yield response;
      pages += 1;

      // Count APIs return an object (not an array) on the final page.
      if (isCount && response.results && !Array.isArray(response.results)) return;
      if (maxPages != null && pages >= maxPages) return;
      const nextPage = response[nextKey];
      if (!nextPage) return;
      request.page = nextPage;
      await sleep(this.#paginationDelay);
    }
  }

  #isSuccess(body, endpoint) {
    if (!body || typeof body !== 'object' || body.status !== 'success') return false;
    // The websocket management endpoints may answer without a `results` field.
    if (RESULTS_OPTIONAL.includes(endpoint)) return true;
    return body.results !== null && body.results !== undefined;
  }

  #errorMessage(body, status) {
    const obj = asObject(body);
    if (obj) {
      if (obj.results && typeof obj.results === 'object' && obj.results.message) {
        return String(obj.results.message);
      }
      if (obj.message) return String(obj.message);
    }
    return `API request failed with HTTP ${status}`;
  }
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}
