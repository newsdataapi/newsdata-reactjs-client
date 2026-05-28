// React hooks for each Newsdata.io endpoint.
//
// All hooks share the same shape:
//
//   const { data, error, isLoading, refetch } = useLatestNews(params, options);
//
//   data       — the API response (null until the first fetch resolves)
//   error      — thrown error from the client (null when the request succeeded)
//   isLoading  — true while a request is in flight (and before the first one
//                resolves; false once disabled)
//   refetch()  — re-run the request; returns the same promise the underlying
//                method returns, so you can `await` it
//
// `options.enabled` (default true) defers fetching, useful when params aren't
// ready yet (e.g. waiting on user input). When false, no request is made and
// `isLoading` is false.
//
// Params are compared via JSON serialization, so passing inline objects is
// safe — re-renders only re-fetch when the *values* change.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNewsDataClient } from './context.js';

const ENDPOINT_METHODS = [
  'latestApi',
  'archiveApi',
  'cryptoApi',
  'sourcesApi',
  'marketApi',
  'countApi',
  'cryptoCountApi',
  'marketCountApi',
];

/**
 * Generic factory: returns a hook that calls `client[methodName](params)`.
 * The exported `useLatestNews`, etc. are just convenience wrappers around this.
 *
 * @param {string} methodName  One of {@link ENDPOINT_METHODS}.
 */
export function createNewsDataHook(methodName) {
  if (!ENDPOINT_METHODS.includes(methodName)) {
    throw new Error(`Unknown NewsDataApiClient method: ${methodName}`);
  }
  return function useNewsDataEndpoint(params, options) {
    return useNewsDataQuery(methodName, params, options);
  };
}

/**
 * Underlying hook that all endpoint hooks delegate to. Exposed in case you
 * want to call an endpoint by name dynamically.
 *
 * @param {string} methodName
 * @param {object} [params]
 * @param {{ enabled?: boolean }} [options]
 */
export function useNewsDataQuery(methodName, params, options) {
  const client = useNewsDataClient();
  const enabled = options?.enabled ?? true;

  // Serialize params so React's dep array compares by value, not reference.
  // Inline `{ q: 'x' }` would otherwise re-fetch on every render.
  const paramsKey = stableKey(params);

  // Keep params in a ref so refetch() always uses the latest values without
  // re-creating the callback when params change (it's already keyed by
  // paramsKey via useCallback's deps).
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [state, setState] = useState({
    data: null,
    error: null,
    isLoading: enabled,
  });

  const refetch = useCallback(() => {
    if (typeof client[methodName] !== 'function') {
      const err = new Error(`Client has no method ${methodName}`);
      setState({ data: null, error: err, isLoading: false });
      return Promise.reject(err);
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const promise = client[methodName](paramsRef.current);
    promise.then(
      (data) => setState({ data, error: null, isLoading: false }),
      (error) => setState({ data: null, error, isLoading: false }),
    );
    return promise;
    // paramsKey isn't in deps because we read params via ref; refetch is
    // stable across re-renders unless the client or methodName changes.
  }, [client, methodName]);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    Promise.resolve()
      .then(() => client[methodName](paramsRef.current))
      .then(
        (data) => {
          if (!cancelled) setState({ data, error: null, isLoading: false });
        },
        (error) => {
          if (!cancelled) setState({ data: null, error, isLoading: false });
        },
      );

    return () => {
      cancelled = true;
    };
    // paramsKey makes the effect re-run on param changes; the ref keeps the
    // actual object available without including it in deps.
  }, [client, methodName, paramsKey, enabled]);

  return { ...state, refetch };
}

/** Hook for /1/latest — real-time news. */
export const useLatestNews = createNewsDataHook('latestApi');
/** Hook for /1/archive — historical news. */
export const useArchiveNews = createNewsDataHook('archiveApi');
/** Hook for /1/crypto — cryptocurrency news. */
export const useCryptoNews = createNewsDataHook('cryptoApi');
/** Hook for /1/sources — available news sources. */
export const useNewsSources = createNewsDataHook('sourcesApi');
/** Hook for /1/market — market / financial news. */
export const useMarketNews = createNewsDataHook('marketApi');
/** Hook for /1/count — aggregate news counts (requires from_date, to_date). */
export const useNewsCount = createNewsDataHook('countApi');
/** Hook for /1/crypto/count — aggregate crypto counts (requires dates). */
export const useCryptoCount = createNewsDataHook('cryptoCountApi');
/** Hook for /1/market/count — aggregate market counts (requires dates). */
export const useMarketCount = createNewsDataHook('marketCountApi');

function stableKey(value) {
  if (value == null) return '';
  // Sort keys so {a:1,b:2} and {b:2,a:1} produce the same string.
  try {
    return JSON.stringify(value, Object.keys(value).sort());
  } catch {
    return String(value);
  }
}
