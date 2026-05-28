// Exception hierarchy for the Newsdata.io client.
//
// Every error thrown by the SDK derives from NewsdataError, so callers can use
// a single `catch (err) { if (err instanceof NewsdataError) ... }` as a
// catch-all. More specific subclasses are provided for cases where callers want
// to react differently (validation, auth, rate limiting, network, etc.).

/** Base class for every error raised by the client. */
export class NewsdataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NewsdataError';
  }
}

/** A user-provided parameter failed client-side validation. */
export class NewsdataValidationError extends NewsdataError {
  /**
   * @param {string} message
   * @param {string|null} [param] The offending parameter name, when known.
   */
  constructor(message, param = null) {
    super(message);
    this.name = 'NewsdataValidationError';
    this.param = param;
  }
}

/** The API returned a structured error response. */
export class NewsdataApiError extends NewsdataError {
  /**
   * @param {string} message
   * @param {number|null} [statusCode]
   * @param {object|null} [responseBody]
   */
  constructor(message, statusCode = null, responseBody = null) {
    super(message);
    this.name = 'NewsdataApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/** Raised on 401 / 403 responses (missing, invalid, or unauthorized key). */
export class NewsdataAuthError extends NewsdataApiError {
  constructor(message, statusCode = null, responseBody = null) {
    super(message, statusCode, responseBody);
    this.name = 'NewsdataAuthError';
  }
}

/** Raised on 429 responses once retries are exhausted. */
export class NewsdataRateLimitError extends NewsdataApiError {
  /**
   * @param {string} message
   * @param {number|null} [statusCode]
   * @param {object|null} [responseBody]
   * @param {number|null} [retryAfter] Seconds to wait before retrying.
   */
  constructor(message, statusCode = 429, responseBody = null, retryAfter = null) {
    super(message, statusCode, responseBody);
    this.name = 'NewsdataRateLimitError';
    this.retryAfter = retryAfter;
  }
}

/** Raised on 5xx responses once retries are exhausted. */
export class NewsdataServerError extends NewsdataApiError {
  constructor(message, statusCode = null, responseBody = null) {
    super(message, statusCode, responseBody);
    this.name = 'NewsdataServerError';
  }
}

/** A network-level failure (DNS, TLS, timeout, abort) prevented the request. */
export class NewsdataNetworkError extends NewsdataError {
  /**
   * @param {string} message
   * @param {Error|null} [cause] The underlying error.
   */
  constructor(message, cause = null) {
    super(message);
    this.name = 'NewsdataNetworkError';
    if (cause) this.cause = cause;
  }
}
