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
  /** v1 total; v2 answers with `total_results`. */
  totalResults?: number;
  results?: unknown;
  /** v1 cursor; v2 answers with `next_page`. */
  nextPage?: string | null;
  /** v2 total. */
  total_results?: number;
  /** v2 cursor. */
  next_page?: string | null;
  responseHeaders?: Record<string, string>;
  aggregate?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ClientOptions {
  /** API root without a version segment; default https://newsdata.io/api */
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

  /**
   * v2 endpoints. The filter vocabulary is snake_case (`q_in_title`,
   * `exclude_country`, `source_priority`, `content`, `remove_duplicate`, …)
   * and `source_url` / `exclude_source_url` replace the four domain filters.
   */
  news(params?: EndpointParams): EndpointResult;
  market(params?: EndpointParams): EndpointResult;
  crypto(params?: EndpointParams): EndpointResult;
  countNews(params?: EndpointParams): EndpointResult;
  countMarket(params?: EndpointParams): EndpointResult;
  countCrypto(params?: EndpointParams): EndpointResult;
  sources(params?: EndpointParams): Promise<NewsdataResponse>;

  /**
   * Register a real-time WebSocket query. POST /2/websocket/register
   * The real-time service is v2 only, so this takes the v2 filter names.
   */
  websocketRegister(params?: EndpointParams): Promise<NewsdataResponse>;
  /** List the account's registered real-time queries. GET /2/websocket/fetch */
  websocketFetch(): Promise<NewsdataResponse>;
  /** Delete a registered real-time query. DELETE /2/websocket/delete */
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
/** The account's whole pool of API credits is exhausted. */
export class NewsdataApiLimitExceededError extends NewsdataRateLimitError {}
/** This one API key's own credit cap is exhausted. */
export class NewsdataApiKeyLimitExceededError extends NewsdataRateLimitError {}
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

/** v2 hooks. Take the snake_case filters; answer with total_results / next_page. */
export function useNews(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useMarket(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useCrypto(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useSources(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useCountNews(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useCountMarket(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;
export function useCountCrypto(params?: EndpointParams, options?: UseQueryOptions): UseQueryResult;

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
