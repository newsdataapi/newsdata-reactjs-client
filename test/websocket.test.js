import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDataApiClient } from '../src/core/client.js';
import { NewsDataApiWebSocket } from '../src/core/websocket.js';
import {
  NewsdataValidationError,
  NewsdataWebSocketAuthError,
  NewsdataWebSocketError,
} from '../src/core/errors.js';

function mockResponse(status, body) {
  return {
    status,
    headers: new Headers(),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function stubFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    const next = queue.shift();
    if (typeof next === 'function') return next();
    return next ?? mockResponse(200, { status: 'success', results: {} });
  };
  fn.calls = calls;
  return fn;
}

/**
 * A scriptable stand-in for the global WebSocket. `script` runs with the
 * socket instance once listeners are attached, and drives the events.
 */
function fakeWebSocketFactory(script) {
  const instances = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.closed = false;
      instances.push(this);
      // Let the caller attach listeners before anything fires.
      queueMicrotask(() => script(this, instances.length));
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }

    emit(type, event) {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }

    open() { this.emit('open', {}); }

    message(data) {
      this.emit('message', { data: typeof data === 'string' ? data : JSON.stringify(data) });
    }

    drop(code = 1006, reason = '') { this.emit('close', { code, reason }); }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.emit('close', { code: 1000, reason: '' });
    }
  }
  FakeWebSocket.instances = instances;
  return FakeWebSocket;
}

const article = (id, title) => JSON.stringify({
  status: 'success', total_results: 1, results: [{ id, title }],
});

function wsClient(fetchStub = stubFetch([])) {
  return new NewsDataApiClient('key', { fetch: fetchStub });
}

test('stream yields each response as it arrives', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket) => {
    socket.open();
    socket.message(article('a1', 'one'));
    socket.message(article('a2', 'two'));
  });
  const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });

  const titles = [];
  for await (const response of ws.stream('reg-1')) {
    titles.push(response.results[0].title);
    if (titles.length === 2) break;
  }
  assert.deepEqual(titles, ['one', 'two']);
});

test('stream sends apikey and registration_id in the query', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket) => {
    socket.open();
    socket.message(article('a1', 'one'));
  });
  const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });

  // eslint-disable-next-line no-unused-vars
  for await (const _ of ws.stream('reg-42')) break;

  const { url } = FakeWebSocket.instances[0];
  assert.match(url, /apikey=key/);
  assert.match(url, /registration_id=reg-42/);
});

test('stream skips malformed frames', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket) => {
    socket.open();
    socket.message('not json at all');
    socket.message(article('a1', 'one'));
  });
  const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });

  const seen = [];
  for await (const response of ws.stream('reg-1')) {
    seen.push(response.results[0].title);
    break;
  }
  assert.deepEqual(seen, ['one'], 'the malformed frame should be skipped, not yielded');
});

test('close code 1008 raises a permanent auth error and does not reconnect', async () => {
  let connections = 0;
  const FakeWebSocket = fakeWebSocketFactory((socket, n) => {
    connections = n;
    socket.drop(1008, 'quota exhausted');
  });
  // reconnect stays ON to prove a permanent rejection is not retried.
  const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });

  await assert.rejects(
    async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of ws.stream('reg-1')) { /* unreachable */ }
    },
    (err) => {
      assert.ok(err instanceof NewsdataWebSocketAuthError, `got ${err.name}`);
      assert.match(err.message, /quota exhausted/);
      return true;
    },
  );
  assert.equal(connections, 1, 'a permanent rejection must not retry');
});

// The server always accepts the handshake, then closes with 1008 carrying the
// reason. These are the three documented permanent rejections.
for (const reason of [
  'invalid credentials or registration not found',
  'api limit reached',
  'device limit reached',
]) {
  test(`close 1008 "${reason}" is permanent`, async () => {
    const FakeWebSocket = fakeWebSocketFactory((socket) => {
      socket.open();
      socket.drop(1008, reason);
    });
    const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });

    await assert.rejects(
      async () => {
        // eslint-disable-next-line no-unused-vars
        for await (const _ of ws.stream('reg-1')) { /* unreachable */ }
      },
      (err) => {
        assert.ok(err instanceof NewsdataWebSocketAuthError, `got ${err.name}`);
        assert.match(err.message, new RegExp(reason));
        return true;
      },
    );
  });
}

// 1013 ("send timeout" — the client read too slowly) is transient.
test('close 1013 is transient and reconnects', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket, n) => {
    if (n === 1) {
      socket.open();
      socket.drop(1013, 'send timeout');
      return;
    }
    socket.open();
    socket.message(article('a1', 'after-reconnect'));
  });
  const ws = new NewsDataApiWebSocket(wsClient(), {
    WebSocket: FakeWebSocket,
    reconnectDelay: 1,
    reconnectDelayMax: 2,
  });

  const titles = [];
  for await (const response of ws.stream('reg-1')) {
    titles.push(response.results[0].title);
    break;
  }
  assert.deepEqual(titles, ['after-reconnect']);
});

test('a transient drop stops with a websocket error when reconnect is disabled', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket) => {
    socket.open();
    socket.drop(1006);
  });
  const ws = new NewsDataApiWebSocket(wsClient(), {
    WebSocket: FakeWebSocket,
    reconnect: false,
  });

  await assert.rejects(
    async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of ws.stream('reg-1')) { /* unreachable */ }
    },
    (err) => {
      assert.ok(err instanceof NewsdataWebSocketError, `got ${err.name}`);
      assert.ok(!(err instanceof NewsdataWebSocketAuthError), 'should not be an auth error');
      return true;
    },
  );
});

test('a transient drop reconnects when reconnect is enabled', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket, n) => {
    if (n === 1) {
      socket.open();
      socket.drop(1006); // transient
      return;
    }
    socket.open();
    socket.message(article('a1', 'after-reconnect'));
  });
  const ws = new NewsDataApiWebSocket(wsClient(), {
    WebSocket: FakeWebSocket,
    reconnectDelay: 1,
    reconnectDelayMax: 2,
  });

  const titles = [];
  for await (const response of ws.stream('reg-1')) {
    titles.push(response.results[0].title);
    break;
  }
  assert.deepEqual(titles, ['after-reconnect']);
  assert.ok(FakeWebSocket.instances.length >= 2, 'should have reconnected');
});

test('breaking out of the loop closes the socket', async () => {
  const FakeWebSocket = fakeWebSocketFactory((socket) => {
    socket.open();
    socket.message(article('a1', 'one'));
  });
  const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });

  // eslint-disable-next-line no-unused-vars
  for await (const _ of ws.stream('reg-1')) break;

  assert.equal(FakeWebSocket.instances[0].closed, true);
});

test('stream rejects an empty registration id', async () => {
  const FakeWebSocket = fakeWebSocketFactory(() => {});
  const ws = new NewsDataApiWebSocket(wsClient(), { WebSocket: FakeWebSocket });
  await assert.rejects(
    async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of ws.stream('')) { /* unreachable */ }
    },
    NewsdataValidationError,
  );
});

// ---- query management ---------------------------------------------------

test('websocketRegister POSTs and injects news_type=news', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, { status: 'success', results: { registration_id: 'reg-9' } }),
  ]);
  const client = wsClient(fetchStub);
  const res = await client.websocketRegister({ q: 'bitcoin' });

  assert.equal(res.results.registration_id, 'reg-9');
  assert.equal(fetchStub.calls[0].method, 'POST');
  assert.match(fetchStub.calls[0].url, /news_type=news/);
  assert.match(fetchStub.calls[0].url, /q=bitcoin/);
  assert.match(fetchStub.calls[0].url, /websocket\/register/);
});

test('websocketFetch GETs the fetch endpoint', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, { status: 'success', total_results: 0, results: [] }),
  ]);
  await wsClient(fetchStub).websocketFetch();
  assert.equal(fetchStub.calls[0].method, 'GET');
  assert.match(fetchStub.calls[0].url, /websocket\/fetch/);
});

test('websocketFetch returns one flat entry per registered query', async () => {
  const entry = {
    registration_id: 'reg-9',
    active_clients: 2,
    last_used: '2026-11-20T10:15:00Z',
    news_type: 'news',
    query: { q: 'pizza' },
  };
  const fetchStub = stubFetch([
    mockResponse(200, { status: 'success', total_results: 1, results: [entry] }),
  ]);
  const res = await wsClient(fetchStub).websocketFetch();
  assert.equal(res.total_results, 1);
  assert.deepEqual(res.results, [entry]);
});

test('websocketDelete uses DELETE and carries registration_id', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, { status: 'success', results: { deleted: true } }),
  ]);
  await wsClient(fetchStub).websocketDelete('reg-9');
  assert.equal(fetchStub.calls[0].method, 'DELETE');
  assert.match(fetchStub.calls[0].url, /registration_id=reg-9/);
});

test('websocketDelete rejects an empty id', () => {
  assert.throws(() => wsClient().websocketDelete(''), NewsdataValidationError);
});

test('a resultless success envelope still succeeds on the websocket endpoints', async () => {
  const fetchStub = stubFetch([mockResponse(200, { status: 'success' })]);
  const res = await wsClient(fetchStub).websocketDelete('reg-9');
  assert.equal(res.status, 'success');
});

test('the WebSocket class delegates management calls to the client', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, { status: 'success', results: { registration_id: 'reg-7' } }),
  ]);
  const FakeWebSocket = fakeWebSocketFactory(() => {});
  const ws = new NewsDataApiWebSocket(wsClient(fetchStub), { WebSocket: FakeWebSocket });
  const res = await ws.websocketRegister({ q: 'x' });
  assert.equal(res.results.registration_id, 'reg-7');
});

// ---- API version 2 ------------------------------------------------------
// The real-time service moved to API version 2: the management endpoints sit
// under /2/, `news_type` names the v2 news feed, and a registration takes the
// v2 filter vocabulary only.

test('the management endpoints are under API version 2', async () => {
  const cases = [
    [(c) => c.websocketRegister({ q: 'x' }), '2/websocket/register'],
    [(c) => c.websocketFetch(), '2/websocket/fetch'],
    [(c) => c.websocketDelete('reg-1'), '2/websocket/delete'],
  ];
  for (const [call, path] of cases) {
    const fetchStub = stubFetch([mockResponse(200, { status: 'success' })]);
    await call(wsClient(fetchStub));
    assert.ok(fetchStub.calls[0].url.includes(path), `${path}: ${fetchStub.calls[0].url}`);
  }
});

test('websocketRegister accepts the v2 filter names', async () => {
  const fetchStub = stubFetch([
    mockResponse(200, { status: 'success', results: { registration_id: 'reg-1' } }),
  ]);
  await wsClient(fetchStub).websocketRegister({
    q_in_meta: 'crypto',
    exclude_country: 'us',
    source_url: 'bbc.com',
    source_priority: 'top',
    content: true,
    remove_duplicate: true,
    exclude_field: 'description',
  });
  const { url } = fetchStub.calls[0];
  assert.match(url, /q_in_meta=crypto/);
  assert.match(url, /exclude_country=us/);
  assert.match(url, /source_url=bbc.com/);
  assert.match(url, /source_priority=top/);
  assert.match(url, /content=1/);
  assert.match(url, /remove_duplicate=1/);
  assert.match(url, /exclude_field=description/);
});

test('websocketRegister rejects the v1 filter names', () => {
  const retired = [
    { qInTitle: 'x' }, { qInMeta: 'x' }, { excludecountry: 'us' },
    { excludecategory: 'tech' }, { excludelanguage: 'en' }, { domain: 'bbc' },
    { domainurl: 'bbc.com' }, { excludedomain: 'bbc' },
    { excludedomainurl: 'bbc.com' }, { prioritydomain: 'top' },
    { full_content: true }, { removeduplicate: true },
    { excludefield: 'description' },
  ];
  for (const params of retired) {
    const name = Object.keys(params)[0];
    assert.throws(
      () => wsClient().websocketRegister(params),
      NewsdataValidationError,
      `${name} is no longer a register filter`,
    );
  }
});

test('websocketRegister rejects a v1 name passed through rawQuery', () => {
  assert.throws(
    () => wsClient().websocketRegister({ rawQuery: 'qInTitle=pizza' }),
    NewsdataValidationError,
  );
});

test('websocketRegister keeps the v2 source_url mutex group', () => {
  assert.throws(
    () => wsClient().websocketRegister({
      source_url: 'a.com', exclude_source_url: 'b.com',
    }),
    NewsdataValidationError,
  );
});

test('websocketRegister rejects the date and paging filters', () => {
  for (const params of [{ from_date: '2026-01-01' }, { page: 'p2' }, { sort: 'relevance' }]) {
    assert.throws(
      () => wsClient().websocketRegister(params),
      NewsdataValidationError,
      `${Object.keys(params)[0]} does not apply to a standing query`,
    );
  }
});
