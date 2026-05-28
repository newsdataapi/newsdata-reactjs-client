<div align="center">

# Newsdata.io React.js Client

[![npm version](https://img.shields.io/npm/v/newsdata-reactjs-client?logo=npm&color=cb3837)](https://www.npmjs.com/package/newsdata-reactjs-client)
[![npm downloads](https://img.shields.io/npm/dm/newsdata-reactjs-client?color=cb3837)](https://www.npmjs.com/package/newsdata-reactjs-client)
[![CI](https://img.shields.io/github/actions/workflow/status/newsdataapi/newsdata-reactjs-client/ci.yml?branch=main&logo=github&label=CI)](https://github.com/newsdataapi/newsdata-reactjs-client/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/react-%3E%3D18-61dafb?logo=react)](https://react.dev)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

</div>

Official **React hooks SDK** for the [Newsdata.io](https://newsdata.io) News
API. Drop-in `useLatestNews`, `useArchiveNews`, `useCryptoNews`,
`useMarketNews`, `useNewsCount`, … hooks plus a `<NewsDataProvider>` to share
one client. Built on the same proven core as the Node client — validation,
typed errors, retries with exponential backoff — and ships first-class
TypeScript definitions.

Zero runtime dependencies, no build step, React 18+ as a peer dependency.

## Installation

```bash
npm install newsdata-reactjs-client
# react is a peer dependency
npm install react
```

## Quickstart

```jsx
import { NewsDataProvider, useLatestNews } from 'newsdata-reactjs-client';

function Headlines() {
  const { data, error, isLoading } = useLatestNews({
    q: 'bitcoin',
    country: ['us', 'gb'],
    language: 'en',
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.results.map((article) => (
        <li key={article.article_id}>
          <a href={article.link}>{article.title}</a>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <NewsDataProvider apiKey={process.env.REACT_APP_NEWSDATA_API_KEY}>
      <Headlines />
    </NewsDataProvider>
  );
}
```

## Hooks

| Hook | Endpoint | Notes |
|------|----------|-------|
| `useLatestNews(params)` | `/1/latest` | Real-time news |
| `useArchiveNews(params)` | `/1/archive` | Historical news |
| `useNewsSources(params)` | `/1/sources` | Available sources (single page) |
| `useCryptoNews(params)` | `/1/crypto` | Cryptocurrency news |
| `useMarketNews(params)` | `/1/market` | Market / financial news |
| `useNewsCount(params)` | `/1/count` | Aggregate counts (requires `from_date`, `to_date`) |
| `useCryptoCount(params)` | `/1/crypto/count` | Aggregate crypto counts |
| `useMarketCount(params)` | `/1/market/count` | Aggregate market counts |

Every hook has the same shape:

```ts
const { data, error, isLoading, refetch } = useLatestNews(params, options);
```

- **`data`** — the API response (`null` until the first fetch resolves)
- **`error`** — a typed `NewsdataError` (`null` on success)
- **`isLoading`** — `true` while a request is in flight
- **`refetch()`** — re-run the request; returns the underlying `Promise`

### `options`

```ts
useLatestNews(params, { enabled: false })  // skip the request until enabled
```

`options.enabled` (default `true`) defers fetching — handy when params aren't
ready (e.g. waiting on user input).

### Parameter values

Values can be a single string or an **array of strings** (sent comma-joined),
and parameter names are case-insensitive — `qInTitle` and `qintitle` are
equivalent:

```js
useLatestNews({ country: ['us', 'gb'], language: 'en', size: 20 });
```

Inline param objects are safe — the hook compares by **value**, not reference,
so re-renders only re-fetch when the values change.

## Provider

Two ways to wire it up:

```jsx
// 1. Let the provider construct the client.
<NewsDataProvider apiKey="..." options={{ timeout: 10_000, maxRetries: 3 }}>
  <App />
</NewsDataProvider>

// 2. Or pass your own pre-built client (full control over its lifecycle).
import { NewsDataApiClient } from 'newsdata-reactjs-client';
const client = new NewsDataApiClient(apiKey);

<NewsDataProvider client={client}>
  <App />
</NewsDataProvider>
```

Anywhere inside the provider you can grab the client directly:

```js
import { useNewsDataClient } from 'newsdata-reactjs-client';

function ExportButton() {
  const client = useNewsDataClient();
  return <button onClick={() => client.archiveApi({ q: 'x' }).then(save)}>Export</button>;
}
```

## Errors

All hook errors are instances of the typed hierarchy from the core SDK:

```js
import {
  NewsdataValidationError, NewsdataAuthError, NewsdataRateLimitError,
  NewsdataApiError, NewsdataNetworkError,
} from 'newsdata-reactjs-client';

if (error instanceof NewsdataRateLimitError) {
  console.log('retry after', error.retryAfter, 'seconds');
}
```

```
NewsdataError                       (catch-all base)
├── NewsdataValidationError         (.param)
├── NewsdataApiError                (.statusCode, .responseBody)
│   ├── NewsdataAuthError           (401 / 403)
│   ├── NewsdataRateLimitError      (429; .retryAfter)
│   └── NewsdataServerError         (5xx)
└── NewsdataNetworkError            (.cause)
```

Validation errors are thrown **before** the request is sent (no API quota
spent) — e.g. setting `q` and `qInTitle` together, an unsupported parameter
for that endpoint, or missing `from_date`/`to_date` on a count endpoint.

## Direct client access

You can also use the underlying client without React — same surface as
`newsdata-nodejs-client`:

```js
import { NewsDataApiClient } from 'newsdata-reactjs-client';

const client = new NewsDataApiClient(apiKey, { timeout: 10_000 });

// scroll: follow nextPage cursors and merge.
const merged = await client.latestApi({ q: 'news', scroll: true, maxResult: 200 });

// paginate: async generator, one page at a time.
for await (const page of client.latestApi({ q: 'news', paginate: true, maxPages: 5 })) {
  console.log(page.results.length);
}
```

## Development

```bash
npm install
npm test          # node:test, 34 tests, no API key required
```

## License

[MIT](./LICENSE)
