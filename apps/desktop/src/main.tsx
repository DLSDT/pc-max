import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import './index.css';
import './i18n';
import { applyTheme, loadPersistedTheme } from './lib/theme';
import { installGlobalCrashHandlers } from './lib/crashReport';
import App from './App';

applyTheme(loadPersistedTheme());
// Catch errors React's boundary can't see (async throws, event handlers).
installGlobalCrashHandlers();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // This app is offline-first: every read falls back to the local cache,
      // either through placeholderData or a catch inside the queryFn. React
      // Query's default networkMode ('online') PAUSES queries while
      // navigator.onLine is false, so the queryFn never runs and those
      // fallbacks are dead exactly when they are needed. Always run them and
      // let the cache answer.
      networkMode: 'always',
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
