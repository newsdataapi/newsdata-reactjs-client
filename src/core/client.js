// HTTP client for the Newsdata.io REST API.

import {
  BASE_URL,
  ENDPOINTS,
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
  NewsdataServerError,
  NewsdataNetworkError,
} from './errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Replace the apikey value in a URL with REDACTED, for safe logging. */
export function redactApiKey(url) {
  return url.replace(/(apikey=)[^&]*/i, '$1REDACTED');
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

  // ---- endpoint methods -------------------------------------------------

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

  // ---- dispatch ---------------------------------------------------------

  /**
   * Validate params and route to single / scroll / paginate execution.
   * Returns a Promise for single & scroll modes, or an async generator when
   * `paginate: true`.
   */
  #dispatch(endpoint, params, isCount = false) {
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
      return this.#paginate(endpoint, validated, maxPages ?? this.#maxPages, isCount);
    }
    if (scroll) {
      return this.#scrollAll(endpoint, validated, maxResult ?? this.#maxResult, isCount);
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

    for (let attempt = 1; attempt <= this.#maxRetries; attempt += 1) {
      this.#log('info', `GET ${logUrl} (attempt ${attempt}/${this.#maxRetries})`);

      let res;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeout);
      try {
        res = await this.#fetch(fullUrl, {
          method: 'GET',
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

      if (status === 200 && this.#isSuccess(body)) {
        if (this.#includeHeaders) {
          body.responseHeaders = Object.fromEntries(res.headers.entries());
        }
        return body;
      }

      if (status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        if (attempt >= this.#maxRetries) {
          throw new NewsdataRateLimitError(
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
  async #scrollAll(endpoint, params, maxResult, isCount) {
    const accumulated = [];
    const request = { ...params };
    let totalResults = null;
    let nextPage = null;
    let aggregate = null;
    let lastHeaders = null;

    for (;;) {
      const response = await this.#request(endpoint, request);
      totalResults = response.totalResults ?? totalResults;
      const pageResults = response.results ?? [];
      if (Array.isArray(pageResults)) {
        accumulated.push(...pageResults);
      } else if (isCount && pageResults && typeof pageResults === 'object') {
        aggregate = pageResults;
      }
      if (this.#includeHeaders) lastHeaders = response.responseHeaders;
      nextPage = response.nextPage ?? null;

      if (maxResult != null && accumulated.length >= maxResult) {
        accumulated.length = maxResult;
        nextPage = null;
        break;
      }
      if (!nextPage) break;
      request.page = nextPage;
      await sleep(this.#paginationDelay);
    }

    const merged = { totalResults, results: accumulated, nextPage };
    if (aggregate !== null) merged.aggregate = aggregate;
    if (lastHeaders != null) merged.responseHeaders = lastHeaders;
    return merged;
  }

  /**
   * Yield one response per page, up to maxPages.
   * @returns {AsyncGenerator<object>}
   */
  async *#paginate(endpoint, params, maxPages, isCount) {
    const request = { ...params };
    let pages = 0;
    for (;;) {
      const response = await this.#request(endpoint, request);
      yield response;
      pages += 1;

      // Count APIs return an object (not an array) on the final page.
      if (isCount && response.results && !Array.isArray(response.results)) return;
      if (maxPages != null && pages >= maxPages) return;
      const nextPage = response.nextPage;
      if (!nextPage) return;
      request.page = nextPage;
      await sleep(this.#paginationDelay);
    }
  }

  #isSuccess(body) {
    return (
      body
      && typeof body === 'object'
      && body.status === 'success'
      && body.results !== null
      && body.results !== undefined
    );
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
