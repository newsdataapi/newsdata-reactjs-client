// React hook for the real-time WebSocket stream.
//
//   const { articles, latest, error, isConnected } = useNewsStream(registrationId);
//
// The hook owns the connection for the lifetime of the component: it opens on
// mount (once `registrationId` is set), closes on unmount, and reconnects
// through the same capped exponential backoff the core client uses.
//
// Articles accumulate newest-first and are capped at `maxArticles` so a
// long-lived stream cannot grow without bound.

import { useEffect, useMemo, useRef, useState } from 'react';
import { NewsDataApiWebSocket } from '../core/websocket.js';
import { useNewsDataClient } from './context.js';

const DEFAULT_MAX_ARTICLES = 100;

/**
 * Stream the news matching a registered real-time query.
 *
 * Register the query first — with `useNewsDataClient().websocketRegister(...)`
 * or out of band — and pass its `registration_id` here.
 *
 * @param {string|null|undefined} registrationId
 *   The registered query to stream. Falsy defers connecting, which is useful
 *   while the id is still being fetched.
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]  Defer connecting when false.
 * @param {number} [options.maxArticles=100]
 *   Cap on retained articles; older ones are dropped.
 * @param {boolean} [options.reconnect=true]  Auto-reconnect on transient drops.
 * @param {string} [options.baseUrl]          WebSocket endpoint override.
 * @param {Function} [options.WebSocket]      WebSocket implementation override.
 * @returns {{
 *   articles: object[],
 *   latest: object|null,
 *   error: Error|null,
 *   isConnected: boolean,
 * }}
 */
export function useNewsStream(registrationId, options) {
  const client = useNewsDataClient();

  const enabled = options?.enabled ?? true;
  const maxArticles = options?.maxArticles ?? DEFAULT_MAX_ARTICLES;
  const reconnect = options?.reconnect ?? true;
  const baseUrl = options?.baseUrl;
  const WebSocketImpl = options?.WebSocket;

  const [articles, setArticles] = useState([]);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Read the cap from a ref so raising it doesn't tear down the connection.
  const maxArticlesRef = useRef(maxArticles);
  maxArticlesRef.current = maxArticles;

  // Identity of the socket config; changing any of these reconnects.
  const socketOptions = useMemo(
    () => ({ reconnect, baseUrl, WebSocket: WebSocketImpl }),
    [reconnect, baseUrl, WebSocketImpl],
  );

  useEffect(() => {
    if (!enabled || !registrationId) {
      setIsConnected(false);
      return undefined;
    }

    let cancelled = false;
    setError(null);

    const ws = new NewsDataApiWebSocket(client, socketOptions);

    (async () => {
      try {
        for await (const response of ws.stream(registrationId)) {
          if (cancelled) break;
          setIsConnected(true);
          const incoming = Array.isArray(response.results) ? response.results : [];
          if (incoming.length === 0) continue;
          setArticles((prev) => [...incoming, ...prev].slice(0, maxArticlesRef.current));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setIsConnected(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      ws.close();
      setIsConnected(false);
    };
  }, [client, registrationId, enabled, socketOptions]);

  return {
    articles,
    latest: articles[0] ?? null,
    error,
    isConnected,
  };
}
