// Public entry point for the Newsdata.io React client.

// Core (re-exported so users can also use the client directly outside hooks).
export { NewsDataApiClient, redactApiKey } from './core/client.js';
export { validateParams } from './core/validator.js';
export * as constants from './core/constants.js';
export {
  NewsdataError,
  NewsdataValidationError,
  NewsdataApiError,
  NewsdataAuthError,
  NewsdataRateLimitError,
  NewsdataServerError,
  NewsdataNetworkError,
} from './core/errors.js';

// React layer.
export { NewsDataProvider, useNewsDataClient } from './react/context.js';
export {
  createNewsDataHook,
  useNewsDataQuery,
  useLatestNews,
  useArchiveNews,
  useCryptoNews,
  useNewsSources,
  useMarketNews,
  useNewsCount,
  useCryptoCount,
  useMarketCount,
} from './react/hooks.js';
