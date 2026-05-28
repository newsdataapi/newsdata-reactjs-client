// A minimal app: wrap the tree in <NewsDataProvider> and use a hook inside.
// Requires a JSX-aware bundler (Vite, Next, CRA, etc.).

import React from 'react';
import { NewsDataProvider, useLatestNews } from 'newsdataapi';

function LatestHeadlines() {
  const { data, error, isLoading } = useLatestNews({
    q: 'bitcoin',
    country: ['us', 'gb'],
    language: 'en',
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'crimson' }}>Error: {error.message}</p>;

  return (
    <ul>
      {data?.results?.map((article) => (
        <li key={article.article_id}>
          <a href={article.link} target="_blank" rel="noreferrer">
            {article.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  // In real apps, source the key from env (e.g. import.meta.env.VITE_NEWSDATA_API_KEY)
  return (
    <NewsDataProvider apiKey={process.env.REACT_APP_NEWSDATA_API_KEY}>
      <h1>Latest news</h1>
      <LatestHeadlines />
    </NewsDataProvider>
  );
}
