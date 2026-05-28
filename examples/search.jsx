// User-driven search with debounced input. Shows the `enabled` flag and
// `refetch` returned by the hook.

import React, { useEffect, useState } from 'react';
import { NewsDataProvider, useLatestNews } from 'newsdata-reactjs-client';

function SearchBox() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data, error, isLoading, refetch } = useLatestNews(
    { q: debounced, language: 'en' },
    { enabled: debounced.length > 0 },
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search news…"
      />
      <button onClick={() => refetch()} disabled={!debounced}>Refresh</button>

      {!debounced && <p>Type something to search.</p>}
      {isLoading && <p>Searching…</p>}
      {error && <p style={{ color: 'crimson' }}>{error.message}</p>}

      <ul>
        {data?.results?.map((a) => (
          <li key={a.article_id}>{a.title}</li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <NewsDataProvider apiKey={process.env.REACT_APP_NEWSDATA_API_KEY}>
      <SearchBox />
    </NewsDataProvider>
  );
}
