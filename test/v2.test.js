// The v2 endpoints: versioned paths, the snake_case filter vocabulary, and the
// snake_case response keys (`total_results` / `next_page`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDataApiClient } from '../src/core/client.js';
import {
  NewsdataValidationError,
  NewsdataApiLimitExceededError,
  NewsdataApiKeyLimitExceededError,
  NewsdataRateLimitError,
} from '../src/core/errors.js';

function mockResponse(status, body, headers = {}) {
  return {
    status,
    headers: new Headers(headers),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function stubFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url) => {
    calls.push(url);
    const next = queue.shift();
    if (typeof next === 'function') return next();
    return next;
  };
  fn.calls = calls;
  return fn;
}

const ok = (results, extra = {}) => ({ status: 'success', results, ...extra });

const V2_PATHS = {
  news: '/api/2/news',
  market: '/api/2/market',
  crypto: '/api/2/crypto',
  countNews: '/api/2/count/news',
  countMarket: '/api/2/count/market',
  countCrypto: '/api/2/count/crypto',
};

test('each v2 method hits its versioned path', async () => {
  for (const [method, path] of Object.entries(V2_PATHS)) {
    const fetchStub = stubFetch([mockResponse(200, ok([]))]);
    const client = new NewsDataApiClient('key', { fetch: fetchStub });
    await client[method]({ q: 'x' });
    assert.ok(
      fetchStub.calls[0].startsWith(`https://newsdata.io${path}?`),
      `${method} requested ${fetchStub.calls[0]}`,
    );
  }
});

test('v1 methods keep their versioned path', async () => {
  const fetchStub = stubFetch([mockResponse(200, ok([]))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  await client.latestApi({ q: 'x' });
  assert.ok(fetchStub.calls[0].startsWith('https://newsdata.io/api/1/latest?'));
});

test('v2 sources is single-page and hits /2/sources', async () => {
  const fetchStub = stubFetch([mockResponse(200, ok([{ id: 'bbc' }]))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  const res = await client.sources({ country: 'us' });
  assert.equal(res.results[0].id, 'bbc');
  assert.ok(fetchStub.calls[0].startsWith('https://newsdata.io/api/2/sources?'));
});

test('v2 accepts the snake_case vocabulary', async () => {
  const fetchStub = stubFetch([mockResponse(200, ok([]))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  await client.news({
    q_in_title: 'tesla',
    exclude_country: 'cn',
    source_url: 'bbc.com',
    source_priority: 'top',
    content: true,
    remove_duplicate: true,
    exclude_field: 'description',
  });
  const url = fetchStub.calls[0];
  assert.match(url, /q_in_title=tesla/);
  assert.match(url, /exclude_country=cn/);
  assert.match(url, /source_url=bbc.com/);
  assert.match(url, /source_priority=top/);
  assert.match(url, /content=1/);
  assert.match(url, /remove_duplicate=1/);
  assert.match(url, /exclude_field=description/);
});

test('v2 rejects the v1 spellings it replaced', () => {
  const client = new NewsDataApiClient('key', { fetch: stubFetch([]) });
  for (const params of [
    { qInTitle: 'x' },
    { domain: 'bbc.com' },
    { excludedomain: 'bbc.com' },
    { prioritydomain: 'top' },
    { full_content: true },
    { removeduplicate: true },
  ]) {
    assert.throws(
      () => client.news(params),
      NewsdataValidationError,
      `${Object.keys(params)[0]} should not be a v2 filter`,
    );
  }
});

test('v1 still accepts the v1 spellings', async () => {
  const fetchStub = stubFetch([mockResponse(200, ok([]))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  await client.latestApi({ qInTitle: 'x', domain: 'bbc.com', full_content: true });
  assert.match(fetchStub.calls[0], /qintitle=x/);
});

test('source_url and exclude_source_url are mutually exclusive', () => {
  const client = new NewsDataApiClient('key', { fetch: stubFetch([]) });
  assert.throws(
    () => client.news({ source_url: 'a.com', exclude_source_url: 'b.com' }),
    NewsdataValidationError,
  );
});

test('v2 q / q_in_title / q_in_meta are mutually exclusive', () => {
  const client = new NewsDataApiClient('key', { fetch: stubFetch([]) });
  assert.throws(
    () => client.news({ q: 'a', q_in_title: 'b' }),
    NewsdataValidationError,
  );
});

test('scroll follows next_page and merges under the v2 keys', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }], { total_results: 3, next_page: 'p2' })),
    mockResponse(200, ok([{ id: 2 }], { total_results: 3, next_page: 'p3' })),
    mockResponse(200, ok([{ id: 3 }], { total_results: 3, next_page: null })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const res = await client.news({ q: 'x', scroll: true });

  assert.equal(res.total_results, 3);
  assert.equal(res.next_page, null);
  assert.deepEqual(res.results.map((r) => r.id), [1, 2, 3]);
  // The v1 keys must not appear on a v2 merge.
  assert.ok(!('totalResults' in res));
  assert.ok(!('nextPage' in res));
  assert.match(fetchStub.calls[1], /page=p2/);
});

test('scroll honours maxResult on v2', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }, { id: 2 }], { total_results: 9, next_page: 'p2' })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const res = await client.news({ q: 'x', scroll: true, maxResult: 1 });
  assert.equal(res.results.length, 1);
  assert.equal(res.next_page, null);
  assert.equal(fetchStub.calls.length, 1);
});

test('paginate yields one page per next_page cursor', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }], { next_page: 'p2' })),
    mockResponse(200, ok([{ id: 2 }], { next_page: null })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const pages = [];
  for await (const page of client.news({ q: 'x', paginate: true })) pages.push(page);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].next_page, 'p2');
});

test('v1 scroll still merges under the v1 keys', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }], { totalResults: 1, nextPage: null })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const res = await client.latestApi({ q: 'x', scroll: true });
  assert.equal(res.totalResults, 1);
  assert.ok(!('total_results' in res));
});

test('rawQuery on a v2 method is checked against the v2 keyset', async () => {
  const fetchStub = stubFetch([mockResponse(200, ok([]))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  await client.news({ rawQuery: 'q_in_title=tesla&source_url=bbc.com' });
  assert.match(fetchStub.calls[0], /q_in_title=tesla/);

  assert.throws(
    () => client.news({ rawQuery: 'qInTitle=tesla' }),
    NewsdataValidationError,
  );
});

// ---- the quota split (one error class per 429 credit code) ----------------

const quotaBody = (code) => ({
  status: 'error',
  results: { message: 'limit reached', code },
});

test('ApiLimitExceeded raises the account-pool error and does not retry', async () => {
  const fetchStub = stubFetch([mockResponse(429, quotaBody('ApiLimitExceeded'))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, maxRetries: 5, retryBackoff: 1 });
  await assert.rejects(client.news({ q: 'x' }), (err) => {
    assert.ok(err instanceof NewsdataApiLimitExceededError);
    assert.ok(err instanceof NewsdataRateLimitError);
    return true;
  });
  assert.equal(fetchStub.calls.length, 1, 'an exhausted quota must not retry');
});

test('ApiKeyLimitExceeded raises the per-key error and does not retry', async () => {
  const fetchStub = stubFetch([
    mockResponse(429, quotaBody('ApiKeyLimitExceeded'), { 'x-apikey-limit-remaining': '0' }),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, maxRetries: 5, retryBackoff: 1 });
  await assert.rejects(client.news({ q: 'x' }), (err) => {
    assert.ok(err instanceof NewsdataApiKeyLimitExceededError);
    assert.ok(err instanceof NewsdataRateLimitError);
    return true;
  });
  assert.equal(fetchStub.calls.length, 1);
});

test('RegistrationLimitExceeded keeps the base error and does not retry', async () => {
  const fetchStub = stubFetch([mockResponse(429, quotaBody('RegistrationLimitExceeded'))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, maxRetries: 5, retryBackoff: 1 });
  await assert.rejects(client.websocketRegister({ q: 'x' }), (err) => {
    // Registration slots are not credits, so there is no dedicated subclass.
    assert.ok(err instanceof NewsdataRateLimitError);
    assert.ok(!(err instanceof NewsdataApiLimitExceededError));
    assert.ok(!(err instanceof NewsdataApiKeyLimitExceededError));
    return true;
  });
  assert.equal(fetchStub.calls.length, 1, 'a full registration set must not retry');
});

test('a transient 429 still retries and raises the base rate-limit error', async () => {
  const fetchStub = stubFetch([
    mockResponse(429, quotaBody('RateLimitExceeded')),
    mockResponse(429, quotaBody('RateLimitExceeded')),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, maxRetries: 2, retryBackoff: 1 });
  await assert.rejects(client.news({ q: 'x' }), (err) => {
    assert.ok(err instanceof NewsdataRateLimitError);
    assert.ok(!(err instanceof NewsdataApiLimitExceededError));
    assert.ok(!(err instanceof NewsdataApiKeyLimitExceededError));
    return true;
  });
  assert.equal(fetchStub.calls.length, 2);
});

// ---- excludedomainurl (v1) -----------------------------------------------

test('excludedomainurl is accepted on the v1 endpoints that take it', async () => {
  for (const method of [
    'latestApi', 'archiveApi', 'cryptoApi', 'marketApi',
    'countApi', 'cryptoCountApi', 'marketCountApi',
  ]) {
    const fetchStub = stubFetch([mockResponse(200, ok([]))]);
    const client = new NewsDataApiClient('key', { fetch: fetchStub });
    const params = { excludedomainurl: 'bbc.com' };
    if (method.includes('Count') || method === 'countApi') {
      params.from_date = '2026-01-01';
      params.to_date = '2026-01-02';
    }
    await client[method](params);
    assert.match(fetchStub.calls[0], /excludedomainurl=bbc.com/, method);
  }
});

test('excludedomainurl joins the v1 domain mutex group', () => {
  const client = new NewsDataApiClient('key', { fetch: stubFetch([]) });
  assert.throws(
    () => client.latestApi({ domain: 'a.com', excludedomainurl: 'b.com' }),
    NewsdataValidationError,
  );
});

test('excludedomainurl is not a sources filter', () => {
  const client = new NewsDataApiClient('key', { fetch: stubFetch([]) });
  assert.throws(
    () => client.sourcesApi({ excludedomainurl: 'bbc.com' }),
    NewsdataValidationError,
  );
});
