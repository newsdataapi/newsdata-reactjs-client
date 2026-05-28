import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDataApiClient, redactApiKey } from '../src/core/client.js';
import { NewsdataAuthError, NewsdataRateLimitError } from '../src/core/errors.js';

function mockResponse(status, body, headers = {}) {
  return {
    status,
    headers: new Headers(headers),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

/** A fetch stub that returns queued responses and records called URLs. */
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

test('successful request resolves to the body', async () => {
  const fetchStub = stubFetch([mockResponse(200, ok([{ title: 'a' }]))]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  const res = await client.latestApi({ q: 'x' });
  assert.equal(res.results[0].title, 'a');
  assert.match(fetchStub.calls[0], /apikey=key/);
});

test('401 throws NewsdataAuthError with status code', async () => {
  const fetchStub = stubFetch([
    mockResponse(401, { status: 'error', results: { message: 'bad key' } }),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub });
  await assert.rejects(client.latestApi({ q: 'x' }), (err) => {
    assert.ok(err instanceof NewsdataAuthError);
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test('429 retries then throws RateLimit with retryAfter', async () => {
  const fetchStub = stubFetch([
    mockResponse(429, { status: 'error' }, { 'retry-after': '0' }),
    mockResponse(429, { status: 'error' }, { 'retry-after': '7' }),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, maxRetries: 2, retryBackoff: 1 });
  await assert.rejects(client.latestApi({ q: 'x' }), (err) => {
    assert.ok(err instanceof NewsdataRateLimitError);
    assert.equal(err.retryAfter, 7);
    return true;
  });
  assert.equal(fetchStub.calls.length, 2);
});

test('5xx is retried then succeeds', async () => {
  const fetchStub = stubFetch([
    mockResponse(503, { status: 'error' }),
    mockResponse(200, ok([{ title: 'recovered' }])),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, maxRetries: 3, retryBackoff: 1 });
  const res = await client.latestApi({ q: 'x' });
  assert.equal(res.results[0].title, 'recovered');
  assert.equal(fetchStub.calls.length, 2);
});

test('scroll merges results across pages', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }, { id: 2 }], { nextPage: 'p2', totalResults: 3 })),
    mockResponse(200, ok([{ id: 3 }], { nextPage: null, totalResults: 3 })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const merged = await client.latestApi({ q: 'x', scroll: true });
  assert.equal(merged.results.length, 3);
  assert.equal(merged.nextPage, null);
  assert.match(fetchStub.calls[1], /page=p2/);
});

test('scroll honors maxResult', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }, { id: 2 }], { nextPage: 'p2' })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const merged = await client.latestApi({ q: 'x', scroll: true, maxResult: 1 });
  assert.equal(merged.results.length, 1);
});

test('paginate yields one response per page', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }], { nextPage: 'p2' })),
    mockResponse(200, ok([{ id: 2 }], { nextPage: null })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  const pages = [];
  for await (const page of client.latestApi({ q: 'x', paginate: true })) {
    pages.push(page);
  }
  assert.equal(pages.length, 2);
  assert.equal(pages[1].results[0].id, 2);
});

test('paginate stops at maxPages', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, ok([{ id: 1 }], { nextPage: 'p2' })),
    mockResponse(200, ok([{ id: 2 }], { nextPage: 'p3' })),
    mockResponse(200, ok([{ id: 3 }], { nextPage: 'p4' })),
  ]);
  const client = new NewsDataApiClient('key', { fetch: fetchStub, paginationDelay: 0 });
  let count = 0;
  for await (const _page of client.latestApi({ q: 'x', paginate: true, maxPages: 2 })) count += 1;
  assert.equal(count, 2);
});

test('empty/whitespace apiKey is rejected', () => {
  assert.throws(() => new NewsDataApiClient(''));
});

test('redactApiKey hides the key', () => {
  assert.equal(
    redactApiKey('https://newsdata.io/api/1/latest?apikey=SECRET&q=foo'),
    'https://newsdata.io/api/1/latest?apikey=REDACTED&q=foo',
  );
});
