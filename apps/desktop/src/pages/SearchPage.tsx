import { useEffect, useRef, useState } from 'react';
import { AppSwatch, EmptyState, ErrorState, Skeleton } from '@/components/primitives';
import { SessionPanel } from '@/components/SessionPanel';
import { useConnection, useSearch } from '@/hooks/useTracker';
import { appColor } from '@/lib/appColor';
import { clockTime, duration, shortDate, tidyWindowTitle } from '@/lib/format';

/**
 * Search the whole history.
 *
 * The field is the page — no heading above it, because the only thing anyone
 * arrives here to do is type. This is where storing sessions and titles rather
 * than daily totals pays off: "when was I last looking at that?" is answerable.
 */
export function SearchPage() {
  const [text, setText] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const connection = useConnection();
  const connected = connection.status === 'connected';
  const { data, isPending, isFetching, error, refetch, isDebouncing } = useSearch(text, connected);

  useEffect(() => inputRef.current?.focus(), []);

  const tooShort = text.trim().length > 0 && text.trim().length < 2;
  const searching = text.trim().length >= 2;

  return (
    <>
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search your history"
        aria-label="Search activity"
        className="mb-8 w-full border-b border-hair bg-transparent pb-3 text-[22px] font-light text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
      />

      {!connected ? (
        <EmptyState title="Waiting for the tracker" />
      ) : !searching ? (
        <EmptyState
          title={tooShort ? 'Keep typing' : 'Find anything you have done'}
          detail={
            tooShort
              ? 'Two characters or more.'
              : 'An application by name, or a window by what it was showing — a repository, a document, a site.'
          }
        />
      ) : error ? (
        <ErrorState message="The search could not be run." onRetry={() => void refetch()} />
      ) : isPending || (isFetching && isDebouncing) ? (
        <Skeleton rows={6} />
      ) : data.length === 0 ? (
        <EmptyState
          title={`Nothing matches “${text.trim()}”`}
          detail="Trace searches what it recorded: application names and window titles."
        />
      ) : (
        <div className="enter">
          <p className="eyebrow mb-3">
            {data.length} {data.length === 1 ? 'result' : 'results'}
          </p>

          <div className="space-y-px">
            {data.map((result, index) => (
              <button
                key={`${result.sessionId}-${result.matchedTitle ?? index}`}
                type="button"
                onClick={() => setSelectedSessionId(result.sessionId)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-sm px-2 py-2 text-left transition-colors duration-150 hover:bg-lift"
              >
                <span className="data w-[124px] shrink-0 text-ink-4">
                  {shortDate(result.startedAt)} {clockTime(result.startedAt)}
                </span>
                <AppSwatch color={appColor(result.executable)} />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {tidyWindowTitle(result.matchedTitle, result.applicationName) ??
                    result.applicationName}
                </span>
                {result.matchedOn === 'title' && (
                  <span className="w-32 shrink-0 truncate text-ink-4">
                    {result.applicationName}
                  </span>
                )}
                <span className="data w-16 shrink-0 text-right text-ink-2">
                  {duration(result.durationSeconds)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSessionId !== null && (
        <SessionPanel sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </>
  );
}
