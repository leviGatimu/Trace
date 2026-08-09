import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Onboarding } from '@/components/Onboarding';
import { useConnection } from '@/hooks/useTracker';
import { bridge, trace } from '@/services/trace';
import { ApplicationsPage } from '@/pages/ApplicationsPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { SearchPage } from '@/pages/SearchPage';
import { SettingsPage } from '@/pages/SettingsPage';
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

/**
 * Shows onboarding until the user has been through it.
 *
 * Gated on a setting the tracker owns, so it survives reinstalling the
 * dashboard and cannot be reset by clearing anything in the renderer.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const connection = useConnection();
  const connected = connection.status === 'connected';
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: trace.settings,
    enabled: connected,
  });

  const complete = useMutation({
    mutationFn: (choices: {
      recordWindowTitles: boolean;
      idleDetectionEnabled: boolean;
      startWithWindows: boolean;
    }) => trace.updateSettings({ ...choices, onboardingCompleted: true }),
    onSuccess: (updated) => queryClient.setQueryData(['settings'], updated),
  });

  // Without a tracker there are no settings to read, so the ordinary
  // "tracker unavailable" path in the shell handles it rather than a blank
  // screen here.
  if (!connected || settings.isPending || settings.error) {
    return <>{children}</>;
  }

  if (settings.data.onboardingCompleted) {
    return <>{children}</>;
  }

  return <Onboarding onComplete={complete.mutate} busy={complete.isPending} />;
}

export function App() {
  // Created per mount rather than at module scope, so the cache belongs to the
  // running application instead of to the module — which also means one test
  // cannot see another's data.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TrackerPushes />
      <OnboardingGate>
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
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </OnboardingGate>
    </QueryClientProvider>
  );
}
