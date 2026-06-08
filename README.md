<div align="center">

![Newsdata.io logo](https://raw.githubusercontent.com/newsdataapi/newsdata-reactjs-client/main/newsdata-logo.png)

# Newsdata.io React.js Client

[![npm version](https://img.shields.io/npm/v/newsdataapi?logo=npm&color=cb3837)](https://www.npmjs.com/package/newsdataapi)
[![npm downloads](https://img.shields.io/npm/dm/newsdataapi?color=cb3837)](https://www.npmjs.com/package/newsdataapi)
[![CI](https://img.shields.io/github/actions/workflow/status/newsdataapi/newsdata-reactjs-client/ci.yml?branch=main&logo=github&label=CI)](https://github.com/newsdataapi/newsdata-reactjs-client/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/react-%3E%3D18-61dafb?logo=react)](https://react.dev)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-85EA2D)](https://newsdata.io/openapi.json)

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
npm install newsdataapi
# react is a peer dependency
npm install react
```

## Quickstart

```jsx
import { NewsDataProvider, useLatestNews } from 'newsdataapi';

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
import { NewsDataApiClient } from 'newsdataapi';
const client = new NewsDataApiClient(apiKey);

<NewsDataProvider client={client}>
  <App />
</NewsDataProvider>
```

Anywhere inside the provider you can grab the client directly:

```js
import { useNewsDataClient } from 'newsdataapi';

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
} from 'newsdataapi';

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
import { NewsDataApiClient } from 'newsdataapi';

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

## Related libraries

Official Newsdata.io clients across languages and runtimes:

- **Python** — [newsdataapi/python-client](https://github.com/newsdataapi/python-client) ([PyPI](https://pypi.org/project/newsdataapi/))
- **Node.js** — [newsdataapi/newsdata-nodejs-client](https://github.com/newsdataapi/newsdata-nodejs-client) ([npm](https://www.npmjs.com/package/newsdata-nodejs-client))
- **PHP** — [newsdataapi/php-client](https://github.com/newsdataapi/php-client) ([Packagist](https://packagist.org/packages/newsdataio/newsdataapi))
- **Java** — [newsdataapi/newsdata-java-sdk](https://github.com/newsdataapi/newsdata-java-sdk) ([Maven Central](https://central.sonatype.com/artifact/io.newsdata/newsdataapi))
- **.NET** — [newsdataapi/newsdata-dotnet-sdk](https://github.com/newsdataapi/newsdata-dotnet-sdk) ([NuGet](https://www.nuget.org/packages/Newsdata.Api/))
- **Go** — [newsdataapi/newsdata-go-client](https://github.com/newsdataapi/newsdata-go-client) ([pkg.go.dev](https://pkg.go.dev/github.com/newsdataapi/newsdata-go-client))
- **Dart / Flutter** — [newsdataapi/newsdata-flutter-client](https://github.com/newsdataapi/newsdata-flutter-client) ([pub.dev](https://pub.dev/packages/newsdataapi))
- **MCP Server (AI assistants)** — [newsdataapi/newsdata.io-mcp](https://github.com/newsdataapi/newsdata.io-mcp) ([PyPI](https://pypi.org/project/newsdata-mcp/))

Also see [free news datasets](https://github.com/newsdataapi/newsdata.io-free-datasets) for ML / NLP work.

## License

[MIT](./LICENSE)
