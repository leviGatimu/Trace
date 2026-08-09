import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { bridge } from '@/services/trace';
import { ApplicationsPage } from '@/pages/ApplicationsPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { SearchPage } from '@/pages/SearchPage';
import { TimelinePage } from '@/pages/TimelinePage';
import { Shell } from './Shell';

/**
 * The tracker is the source of truth and this is a cache over a pipe, which is
 * what TanStack Query is for. Retries are off: when the tracker is gone the
 * honest answer is to say so, not to spin for thirty seconds first.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: true,
        staleTime: 10_000,
      },
    },
  });
}

/**
 * Pushes say what became stale; the interface then re-queries.
 *
 * Mutating local state from a push would create a second code path producing
 * what the user sees, and the two would eventually disagree.
 */
function TrackerPushes() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      bridge.onPush(({ event }) => {
        switch (event) {
          case 'activity.changed':
            void queryClient.invalidateQueries({ queryKey: ['activity'] });
            break;
          case 'data.changed':
            void queryClient.invalidateQueries();
            break;
          case 'settings.changed':
            void queryClient.invalidateQueries({ queryKey: ['settings'] });
            void queryClient.invalidateQueries({ queryKey: ['status'] });
            break;
          case 'state.changed':
            void queryClient.invalidateQueries({ queryKey: ['status'] });
            break;
        }
      }),
    [queryClient],
  );

  return null;
}

export function App() {
  // Created per mount rather than at module scope, so the cache belongs to the
  // running application instead of to the module — which also means one test
  // cannot see another's data.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TrackerPushes />
      {/*
        Hash routing: the packaged application is loaded from file://, where
        browser history paths do not resolve.
      */}
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/applications/:applicationId" element={<ApplicationsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
