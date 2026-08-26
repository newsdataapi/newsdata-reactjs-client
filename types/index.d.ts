// Type definitions for the newsdataapi npm package (newsdata-reactjs-client repo).

import type { ReactNode } from 'react';

export type ParamValue = string | number | boolean | Array<string | number>;

/** Endpoint parameters: API filters plus client-side control keys. */
export interface EndpointParams {
  [key: string]: ParamValue | undefined;
  rawQuery?: string;
  scroll?: boolean;
  paginate?: boolean;
  maxResult?: number;
  maxPages?: number;
}

export interface NewsdataResponse {
  status?: string;
  totalResults?: number;
  results?: unknown;
  nextPage?: string | null;
  responseHeaders?: Record<string, string>;
  aggregate?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ClientOptions {
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryBackoff?: number;
  retryBackoffMax?: number;
  paginationDelay?: number;
  maxResult?: number;
  maxPages?: number;
  includeHeaders?: boolean;
  fetch?: typeof fetch;
  logger?: {
    debug?: (msg: string) => void;
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
  };
}

type EndpointResult =
  | Promise<NewsdataResponse>
  | AsyncGenerator<NewsdataResponse, void, unknown>;

export class NewsDataApiClient {
  constructor(apiKey: string, options?: ClientOptions);
  latestApi(params?: EndpointParams): EndpointResult;
  archiveApi(params?: EndpointParams): EndpointResult;
  cryptoApi(params?: EndpointParams): EndpointResult;
  marketApi(params?: EndpointParams): EndpointResult;
  countApi(params?: EndpointParams): EndpointResult;
  cryptoCountApi(params?: EndpointParams): EndpointResult;
  marketCountApi(params?: EndpointParams): EndpointResult;
  sourcesApi(params?: EndpointParams): Promise<NewsdataResponse>;

  /** Register a real-time WebSocket query. POST /1/websocket/register */
  websocketRegister(params?: EndpointParams): Promise<NewsdataResponse>;
  /** List the account's registered real-time queries. GET /1/websocket/fetch */
  websocketFetch(): Promise<NewsdataResponse>;
  /** Delete a registered real-time query. DELETE /1/websocket/delete */
  websocketDelete(registrationId: string): Promise<NewsdataResponse>;
}

export interface WebSocketOptions {
  /** WebSocket endpoint; defaults to wss://ws.newsdata.io/ws/event. */
  baseUrl?: string;
  /** Reconnect automatically on transient drops. Default true. */
  reconnect?: boolean;
  /** Milliseconds before the first reconnect; doubles after each failure. */
  reconnectDelay?: number;
  /** Upper bound on the reconnect delay, in milliseconds. */
  reconnectDelayMax?: number;
  /** Milliseconds to wait for the opening handshake. */
  openTimeout?: number;
  /** WebSocket implementation; defaults to the browser's global. */
  WebSocket?: new (url: string) => unknown;
}

/**
 * NewsData.io real-time WebSocket service. Use `useNewsStream` inside
 * components; this class is for imperative use outside React.
 */
export class NewsDataApiWebSocket {
  constructor(client: NewsDataApiClient, options?: WebSocketOptions);
  websocketRegister(params?: EndpointParams): Promise<NewsdataResponse>;
  websocketFetch(): Promise<NewsdataResponse>;
  websocketDelete(registrationId: string): Promise<NewsdataResponse>;
  stream(registrationId: string): AsyncGenerator<NewsdataResponse, void, unknown>;
  close(): void;
}

export function redactApiKey(url: string): string;
export function validateParams(
  endpoint: string,
  params?: Record<string, unknown>,
  rawQuery?: string | null,
): Record<string, string>;

// ---- exceptions ---------------------------------------------------------

export class NewsdataError extends Error {}
export class NewsdataValidationError extends NewsdataError {
  param: string | null;
}
export class NewsdataApiError extends NewsdataError {
  statusCode: number | null;
  responseBody: object | null;
}
export class NewsdataAuthError extends NewsdataApiError {}
export class NewsdataRateLimitError extends NewsdataApiError {
  retryAfter: number | null;
}
export class NewsdataServerError extends NewsdataApiError {}
export class NewsdataNetworkError extends NewsdataError {
  cause?: Error;
}
export class NewsdataWebSocketError extends NewsdataError {
  cause?: Error;
}
export class NewsdataWebSocketAuthError extends NewsdataWebSocketError {}

// ---- React layer --------------------------------------------------------

export interface NewsDataProviderProps {
  /** API key. Required if `client` is not provided. */
  apiKey?: string;
  /** Forwarded to `new NewsDataApiClient(apiKey, options)`. */
  options?: ClientOptions;
  /** Pre-constructed client. Takes precedence over apiKey/options. */
  client?: NewsDataApiClient;
  children?: ReactNode;
}

export function NewsDataProvider(props: NewsDataProviderProps): JSX.Element;
export function useNewsDataClient(): NewsDataApiClient;

export interface UseQueryOptions {
  /** When false, the hook does not fire; data/error stay null and isLoading is false. */
  enabled?: boolean;
}

export interface UseQueryResult<T = NewsdataResponse> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  /** Re-runs the request; returns the underlying promise. */
  refetch: () => Promise<T>;
}

export function useNewsDataQuery<T = NewsdataResponse>(
  methodName: string,
  params?: EndpointParams,
  options?: UseQueryOptions,
): UseQueryResult<T>;

export function createNewsDataHook(
  methodName: string,
): (params?: EndpointParams, options?: UseQueryOptions) => UseQueryResult;

export function useLatestNews(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useArchiveNews(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useCryptoNews(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useNewsSources(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useMarketNews(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useNewsCount(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useCryptoCount(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useMarketCount(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;

export interface UseNewsStreamOptions {
  /** Defer connecting when false. Default true. */
  enabled?: boolean;
  /** Cap on retained articles; older ones are dropped. Default 100. */
  maxArticles?: number;
  /** Reconnect automatically on transient drops. Default true. */
  reconnect?: boolean;
  /** WebSocket endpoint override. */
  baseUrl?: string;
  /** WebSocket implementation override. */
  WebSocket?: new (url: string) => unknown;
}

export interface UseNewsStreamResult {
  /** Articles received so far, newest first, capped at `maxArticles`. */
  articles: object[];
  /** The most recent article, or null before the first arrives. */
  latest: object | null;
  /** A permanent rejection or, with `reconnect: false`, a stream error. */
  error: Error | null;
  /** True once the first response has arrived on the current connection. */
  isConnected: boolean;
}

/**
 * Stream the news matching a registered real-time query. Opens on mount,
 * closes on unmount, reconnects on transient drops.
 */
export function useNewsStream(
  registrationId: string | null | undefined,
  options?: UseNewsStreamOptions,
): UseNewsStreamResult;

export const constants: {
  BASE_URL: string;
  ENDPOINTS: Record<string, string>;
  FILTERS: Record<string, string[]>;
  BOOL_PARAMS: readonly string[];
  INT_PARAMS: readonly string[];
  FLOAT_PARAMS: readonly string[];
  MUTEX_GROUPS: readonly (readonly string[])[];
  REQUIRES_DATE_RANGE: readonly string[];
  SIZE_MIN: number;
  SIZE_MAX: number;
  [key: string]: unknown;
};
