// Type definitions for newsdata-reactjs-client.

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
