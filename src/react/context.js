// React context that holds a single NewsDataApiClient instance for the tree.
//
// Written in plain JS (no JSX) so the package needs no build step. Consumers
// import the Provider and render it at the top of their app:
//
//   import { NewsDataProvider } from 'newsdataapi';
//   <NewsDataProvider apiKey={process.env.REACT_APP_NEWSDATA_API_KEY}>
//     <App />
//   </NewsDataProvider>

import { createContext, createElement, useContext, useMemo } from 'react';
import { NewsDataApiClient } from '../core/client.js';

const NewsDataContext = createContext(null);

/**
 * Provider that constructs (or accepts) a NewsDataApiClient and shares it via
 * React context. Pass `apiKey` (and optional `options`) to construct one, or
 * pass an existing `client` to take full control of the lifecycle.
 *
 * @param {object} props
 * @param {string} [props.apiKey]
 * @param {object} [props.options]   Forwarded to `new NewsDataApiClient(apiKey, options)`.
 * @param {NewsDataApiClient} [props.client]  Use this instance instead of constructing one.
 * @param {React.ReactNode} props.children
 */
export function NewsDataProvider({ apiKey, options, client, children }) {
  const value = useMemo(() => {
    if (client) return client;
    return new NewsDataApiClient(apiKey, options);
    // Recreate only when the inputs that define identity change.
  }, [client, apiKey, options]);

  return createElement(NewsDataContext.Provider, { value }, children);
}

/**
 * Access the NewsDataApiClient provided by the nearest <NewsDataProvider>.
 *
 * Throws if called outside a provider — that's almost always a setup bug, and
 * silently returning `null` makes it harder to diagnose.
 *
 * @returns {NewsDataApiClient}
 */
export function useNewsDataClient() {
  const client = useContext(NewsDataContext);
  if (!client) {
    throw new Error(
      'useNewsDataClient must be used inside <NewsDataProvider>. '
      + 'Wrap your tree with <NewsDataProvider apiKey="..."> or pass `client=`.',
    );
  }
  return client;
}
