// Smoke test: the public API of the package imports cleanly and exposes
// everything the README documents. Doesn't render React — that's left for
// downstream apps using @testing-library/react.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pkg from '../src/index.js';

test('exposes the React Provider and client accessor', () => {
  assert.equal(typeof pkg.NewsDataProvider, 'function');
  assert.equal(typeof pkg.useNewsDataClient, 'function');
});

test('exposes the generic query hook and factory', () => {
  assert.equal(typeof pkg.useNewsDataQuery, 'function');
  assert.equal(typeof pkg.createNewsDataHook, 'function');
});

test('exposes one hook per endpoint', () => {
  for (const name of [
    'useLatestNews',
    'useArchiveNews',
    'useCryptoNews',
    'useNewsSources',
    'useMarketNews',
    'useNewsCount',
    'useCryptoCount',
    'useMarketCount',
  ]) {
    assert.equal(typeof pkg[name], 'function', `${name} should be a function`);
  }
});

test('re-exports the core client and error hierarchy', () => {
  assert.equal(typeof pkg.NewsDataApiClient, 'function');
  for (const name of [
    'NewsdataError',
    'NewsdataValidationError',
    'NewsdataApiError',
    'NewsdataAuthError',
    'NewsdataRateLimitError',
    'NewsdataServerError',
    'NewsdataNetworkError',
  ]) {
    assert.equal(typeof pkg[name], 'function', `${name} should be a class`);
  }
});

test('createNewsDataHook rejects unknown endpoint names', () => {
  assert.throws(() => pkg.createNewsDataHook('bogusApi'), /Unknown NewsDataApiClient method/);
});
