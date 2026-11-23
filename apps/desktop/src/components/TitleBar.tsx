import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { bridge } from '@/services/trace';

/**
 * The window's own title bar.
 *
 * The window is frameless (see `createWindow` in electron/main.ts), so this
 * strip *is* the window chrome: it is what you grab to move it, and it carries
 * the only way to close it. That makes two rules absolute here — the whole bar
 * is a drag region, and everything you are meant to click opts back out with
 * `no-drag`. Miss one and the control stops receiving clicks on Windows
 * altogether rather than degrading politely.
 *
 * Three columns, the outer two elastic, so the field lands in the centre of the
 * *window* rather than in the gap left over between the mark and the controls.
 */
export function TitleBar() {
  return (
    <header
      className="drag relative z-20 h-[72px] shrink-0 titlebar"
      // The window title is drawn here, so the strip is the application banner.
      role="banner"
    >
      <div className="grid h-full grid-cols-[76px_minmax(0,300px)_1fr_auto] items-center gap-5 pr-4">
        <Brand />
        <Search />
        <Today />
        <WindowControls />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function Brand() {
  return (
    <div className="flex h-full items-center justify-center bg-rail" title="Trace">
      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-card">
        <Mark />
      </span>
    </div>
  );
}

/** The wordmark's glyph — a recorder's stylus over its point. */
function Mark() {
  return (
    <svg width="13" height="15" viewBox="0 0 16 18" fill="none" aria-hidden>
      <rect x="0" y="0" width="16" height="3.2" rx="1.6" fill="var(--color-ink)" />
      <rect x="6.4" y="5" width="3.2" height="6.4" rx="1.6" fill="var(--color-ink)" />
      <circle cx="8" cy="15.4" r="2.5" fill="var(--color-accent)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The global entry into search.
 *
 * Submitting hands the query to the Search page rather than answering inline:
 * the results are a dense list with a session panel beside them, and that
 * belongs in the page, not in a dropdown hanging off the title bar. The badge
 * fades out on focus because a shortcut you have already used is noise.
 */
function Search() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    // The sidebar's Search button asks for the same focus.
    const onFocusRequest = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('trace:focus-search', onFocusRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('trace:focus-search', onFocusRequest);
    };
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();

    const query = text.trim();
    if (query.length < 2) {
      return;
    }

    navigate(`/timeline?q=${encodeURIComponent(query)}`);
    inputRef.current?.blur();
  }

  return (
    <form onSubmit={submit} role="search">
      <div className="titlebar-search no-drag group flex h-11 items-center gap-2.5 rounded-[14px] bg-card px-4">
        <SearchIcon />

        <input
          ref={inputRef}
          // `search`, not `text`: it is the honest role, and it keeps this field
          // distinct from every ordinary input in the application — including
          // the typed confirmation in Settings, which a bare `textbox` query
          // would otherwise be unable to tell apart from this one. The browser's
          // own clear button is suppressed in app.css; it is the wrong shape.
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setText('');
              inputRef.current?.blur();
            }
          }}
          placeholder="Search"
          aria-label="Search your history"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
        />

        <kbd className="data pointer-events-none shrink-0 rounded-[5px] border border-hair bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] leading-none text-ink-4 opacity-100 transition-opacity duration-200 group-focus-within:opacity-0">
          Ctrl K
        </kbd>
      </div>
    </form>
  );
}

/** Today's date beside the search, as in the reference. */
function Today() {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return <span className="truncate text-[13.5px] font-medium text-ink">Today, {today}</span>;
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      className="shrink-0 text-ink-4"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4 L13.5 13.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Minimise, maximise and close.
 *
 * The maximise glyph has two shapes and the window can change state without
 * this button being what changed it — Win+Up, a double-click on the drag
 * region, a drag to the top of the screen — so the state is pushed from the
 * main process rather than assumed here.
 */
function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void bridge.windowControls.isMaximized().then(setMaximized);
    return bridge.windowControls.onMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="no-drag flex items-center justify-end gap-2">
      <CaptionButton label="Minimise" onClick={() => bridge.windowControls.minimize()}>
        <Glyph>
          <path d="M4 9h10" />
        </Glyph>
      </CaptionButton>

      <CaptionButton
        label={maximized ? 'Restore down' : 'Maximise'}
        onClick={() => bridge.windowControls.toggleMaximize()}
      >
        <Glyph>
          {maximized ? (
            <>
              <rect x="4" y="6" width="8" height="8" rx="1.6" />
              <path d="M6.4 6V4.8A1.2 1.2 0 0 1 7.6 3.6h5.6A1.2 1.2 0 0 1 14.4 4.8v5.6a1.2 1.2 0 0 1-1.2 1.2H12" />
            </>
          ) : (
            <rect x="4.5" y="4.5" width="9" height="9" rx="1.8" />
          )}
        </Glyph>
      </CaptionButton>

      <CaptionButton
        label="Close"
        onClick={() => bridge.windowControls.close()}
        className="caption-button-close h-10 w-10 rounded-full"
      >
        <Glyph>
          <path d="M5.2 5.2 12.8 12.8" />
          <path d="M12.8 5.2 5.2 12.8" />
        </Glyph>
      </CaptionButton>
    </div>
  );
}

function CaptionButton({
  label,
  onClick,
  className = '',
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`caption-button flex h-10 w-10 items-center justify-center rounded-full bg-card focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {children}
    </button>
  );
}

/** One weight, one cap style, for every control up here. */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
