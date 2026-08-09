import { useEffect, useRef, useState } from 'react';
import { SessionPanel } from '@/components/SessionPanel';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/primitives';
import { useConnection, useSearch } from '@/hooks/useTracker';
import { clockTime, duration, shortDate, tidyWindowTitle } from '@/lib/format';

/**
 * Search across the whole history.
 *
 * This is where storing sessions and window titles rather than daily totals
 * pays off: "when was I last looking at that pull request?" is answerable.
 */
export function SearchPage() {
  const [text, setText] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const connection = useConnection();
  const connected = connection.status === 'connected';
  const { data, isPending, isFetching, error, refetch, isDebouncing } = useSearch(text, connected);

  // The page exists to be typed into.
  useEffect(() => inputRef.current?.focus(), []);

  const tooShort = text.trim().length > 0 && text.trim().length < 2;
  const searching = text.trim().length >= 2;

  return (
    <>
      <PageHeader title="Search" subtitle="Everything Trace has recorded" />

      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search window titles and applications…"
        aria-label="Search activity"
        className="mb-6 w-full select-text rounded-[5px] border border-line bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent-dim focus:outline-none"
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : !searching ? (
        <EmptyState
          title={tooShort ? 'Keep typing' : 'Search your history'}
          detail={
            tooShort
              ? 'Two characters or more.'
              : 'Find an application by name, or a window by what it was showing — a repository, a document, a site.'
          }
        />
      ) : error ? (
        <ErrorState message="The search could not be run." onRetry={() => void refetch()} />
      ) : isPending || (isFetching && isDebouncing) ? (
        <Skeleton rows={5} />
      ) : data.length === 0 ? (
        <EmptyState
          title={`Nothing matches “${text.trim()}”`}
          detail="Trace only searches what it recorded: application names and window titles."
        />
      ) : (
        <div className="fade-in">
          <p className="mb-3 text-ink-faint">
            {data.length} {data.length === 1 ? 'result' : 'results'}
          </p>

          <ul className="space-y-px">
            {data.map((result, index) => (
              <li key={`${result.sessionId}-${result.matchedTitle ?? index}`}>
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(result.sessionId)}
                  className="flex w-full items-center gap-4 rounded-[4px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-card"
                >
                  <span className="tabular w-24 shrink-0 text-ink-faint">
                    {shortDate(result.startedAt)} {clockTime(result.startedAt)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">
                      {tidyWindowTitle(result.matchedTitle, result.applicationName) ??
                        result.applicationName}
                    </span>
                    {result.matchedOn === 'title' && (
                      <span className="block truncate text-ink-faint">
                        {result.applicationName}
                      </span>
                    )}
                  </span>

                  <span className="tabular shrink-0 text-ink-dim">
                    {duration(result.durationSeconds)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedSessionId !== null && (
        <SessionPanel sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </>
  );
}
