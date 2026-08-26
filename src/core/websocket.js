// Real-time WebSocket support for NewsData.io.
//
// Uses the browser's global `WebSocket`. No dependency is required; pass
// `options.WebSocket` to supply your own implementation when running somewhere
// it is missing (Node < 22, jsdom without a WebSocket, tests).

import {
  WS_BASE_URL,
  WS_POLICY_VIOLATION,
  WS_RECONNECT_DELAY,
  WS_RECONNECT_DELAY_MAX,
  WS_OPEN_TIMEOUT,
} from './constants.js';
import {
  NewsdataError,
  NewsdataValidationError,
  NewsdataWebSocketError,
  NewsdataWebSocketAuthError,
} from './errors.js';
import { redactApiKey } from './client.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * NewsData.io real-time WebSocket service.
 *
 * Registers, lists, and deletes the account's real-time queries and streams
 * the responses for a registered query:
 *
 * ```js
 * const client = new NewsDataApiClient(apiKey);
 * const ws = new NewsDataApiWebSocket(client);
 *
 * const { results } = await ws.websocketRegister({ q: 'bitcoin' });
 *
 * for await (const response of ws.stream(results.registration_id)) {
 *   for (const article of response.results) console.log(article.title);
 * }
 * ```
 *
 * Transient drops are reconnected automatically with a capped exponential
 * backoff; pass `reconnect: false` to stop on the first disconnect. A
 * permanent rejection throws `NewsdataWebSocketAuthError` and is never
 * retried.
 *
 * Break out of the loop (or call `close()`) to stop; the connection is closed
 * either way.
 */
export class NewsDataApiWebSocket {
  #client;

  #baseUrl;

  #reconnect;

  #reconnectDelay;

  #reconnectDelayMax;

  #openTimeout;

  #WebSocketImpl;

  #socket = null;

  #closed = false;

  /**
   * @param {import('./client.js').NewsDataApiClient} client
   *   Supplies the API key and performs the management HTTP calls. Not closed
   *   by this class.
   * @param {object} [options]
   * @param {string} [options.baseUrl]           WebSocket endpoint.
   * @param {boolean} [options.reconnect]        Auto-reconnect; default true.
   * @param {number} [options.reconnectDelay]    ms before the first reconnect.
   * @param {number} [options.reconnectDelayMax] Cap on the reconnect delay.
   * @param {number} [options.openTimeout]       ms to wait for the handshake.
   * @param {Function} [options.WebSocket]       WebSocket implementation.
   */
  constructor(client, options = {}) {
    if (!client) {
      throw new NewsdataValidationError('client is required', 'client');
    }
    this.#client = client;
    this.#baseUrl = options.baseUrl ?? WS_BASE_URL;
    this.#reconnect = options.reconnect ?? true;
    this.#reconnectDelay = options.reconnectDelay ?? WS_RECONNECT_DELAY;
    this.#reconnectDelayMax = options.reconnectDelayMax ?? WS_RECONNECT_DELAY_MAX;
    this.#openTimeout = options.openTimeout ?? WS_OPEN_TIMEOUT;
    this.#WebSocketImpl = options.WebSocket ?? globalThis.WebSocket;

    if (typeof this.#WebSocketImpl !== 'function') {
      throw new NewsdataError(
        'No WebSocket implementation available; browsers provide one globally, '
        + 'or pass options.WebSocket.',
      );
    }
  }

  // ---- query management -------------------------------------------------

  /** Register a real-time query. See NewsDataApiClient#websocketRegister. */
  websocketRegister(params = {}) {
    return this.#client.websocketRegister(params);
  }

  /** List registered queries. See NewsDataApiClient#websocketFetch. */
  websocketFetch() {
    return this.#client.websocketFetch();
  }

  /** Delete a registered query. See NewsDataApiClient#websocketDelete. */
  websocketDelete(registrationId) {
    return this.#client.websocketDelete(registrationId);
  }

  // ---- streaming --------------------------------------------------------

  #url(registrationId) {
    const search = new URLSearchParams({
      apikey: this.#client.apiKeyForWebSocket,
      registration_id: registrationId,
    });
    return `${this.#baseUrl}?${search.toString()}`;
  }

  #nextDelay(delay) {
    return Math.min(delay * 2, this.#reconnectDelayMax);
  }

  /**
   * Connect and yield each response for `registrationId` as it arrives.
   * Responses have the familiar status / totalResults / results shape.
   *
   * @param {string} registrationId
   * @returns {AsyncGenerator<object>}
   */
  async* stream(registrationId) {
    if (typeof registrationId !== 'string' || registrationId === '') {
      throw new NewsdataValidationError(
        'registrationId must be a non-empty string',
        'registration_id',
      );
    }
    const url = this.#url(registrationId);
    const logUrl = redactApiKey(url);
    let delay = this.#reconnectDelay;
    this.#closed = false;

    try {
      while (!this.#closed) {
        const session = this.#connect(url, logUrl);

        try {
          for await (const message of session) {
            delay = this.#reconnectDelay; // reset after a successful connect
            let response;
            try {
              response = JSON.parse(message);
            } catch {
              continue; // skip malformed frames
            }
            if (response && typeof response === 'object' && !Array.isArray(response)) {
              yield response;
            }
          }
        } catch (err) {
          if (this.#closed) return;
          const permanent = this.#permanentAuthError(err);
          if (permanent) throw permanent;
          if (!this.#reconnect) throw toTransientError(err);
          this.#client.logForWebSocket(
            'warn',
            `connection to ${logUrl} failed (${err.message}); reconnecting in ${delay}ms`,
          );
        }

        if (this.#closed) return;
        // A clean close with reconnect disabled ends the stream.
        if (!this.#reconnect) return;
        await sleep(delay);
        delay = this.#nextDelay(delay);
      }
    } finally {
      this.close();
    }
  }

  /**
   * Bridge one WebSocket connection's events into an async iterable of raw
   * message payloads. Throws a `WsClosed` when the socket drops.
   */
  #connect(url, logUrl) {
    const socket = new this.#WebSocketImpl(url);
    this.#socket = socket;

    /** @type {string[]} */
    const queue = [];
    /** @type {{resolve: Function, reject: Function}[]} */
    const waiters = [];
    let failure = null;
    let done = false;

    const settle = () => {
      while (waiters.length) {
        const waiter = waiters.shift();
        if (queue.length) waiter.resolve({ value: queue.shift(), done: false });
        else if (failure) waiter.reject(failure);
        else if (done) waiter.resolve({ value: undefined, done: true });
        else {
          waiters.unshift(waiter);
          return;
        }
      }
    };

    let openTimer = null;
    if (this.#openTimeout > 0) {
      openTimer = setTimeout(() => {
        failure = new WsClosed('handshake timed out', null, false);
        try { socket.close(); } catch { /* already closing */ }
        settle();
      }, this.#openTimeout);
    }

    socket.addEventListener('open', () => {
      if (openTimer) clearTimeout(openTimer);
      this.#client.logForWebSocket('info', `connected to ${logUrl}`);
    });

    socket.addEventListener('message', (event) => {
      const { data } = event;
      queue.push(typeof data === 'string' ? data : String(data));
      settle();
    });

    socket.addEventListener('error', () => {
      // The close event that follows carries the code; record nothing here so
      // the close handler classifies the failure.
    });

    socket.addEventListener('close', (event) => {
      if (openTimer) clearTimeout(openTimer);
      const code = event?.code ?? null;
      const reason = event?.reason || '';
      if (code === 1000) {
        done = true; // normal closure
      } else {
        failure = new WsClosed(reason || `connection closed (${code})`, code, true);
      }
      settle();
    });

    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queue.length) {
              return Promise.resolve({ value: queue.shift(), done: false });
            }
            if (failure) return Promise.reject(failure);
            if (done) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve, reject) => {
              waiters.push({ resolve, reject });
            });
          },
          return() {
            try { socket.close(); } catch { /* already closing */ }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  /**
   * Decide whether a failure is a permanent rejection.
   *
   * The server always accepts the handshake and then closes with code 1008
   * on a permanent failure — bad apikey or unknown registration_id
   * ("invalid credentials or registration not found"), exhausted credits
   * ("api limit reached"), or too many simultaneous devices for the same
   * registration_id ("device limit reached"). Every other close code,
   * including 1013 ("send timeout", the client read too slowly), is
   * transient and reconnects.
   *
   * @returns {NewsdataWebSocketAuthError|null}
   */
  #permanentAuthError(err) {
    if (err instanceof WsClosed && err.code === WS_POLICY_VIOLATION) {
      return new NewsdataWebSocketAuthError(err.message || 'connection rejected', err);
    }
    return null;
  }

  /** Close the active connection, ending any in-flight `stream()`. */
  close() {
    this.#closed = true;
    if (this.#socket) {
      try { this.#socket.close(); } catch { /* already closing */ }
      this.#socket = null;
    }
  }
}

/** Internal marker for a dropped connection, carrying the close code. */
class WsClosed extends Error {
  constructor(message, code, wasOpen) {
    super(message);
    this.name = 'WsClosed';
    this.code = code;
    this.wasOpen = wasOpen;
  }
}

/** Wrap a transient failure, used only when reconnect is disabled. */
function toTransientError(err) {
  if (err instanceof WsClosed) {
    return new NewsdataWebSocketError(err.code === null ? err.message : 'connection closed', err);
  }
  return new NewsdataWebSocketError(`connection error: ${err.message}`, err);
}
