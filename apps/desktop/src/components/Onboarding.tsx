import { useState } from 'react';
import { Button } from './primitives';

/**
 * First run.
 *
 * Framed as consent, not permission. DOCS/MVP.md §9 sketches a screen saying
 * "Trace needs access to basic Windows activity information", but nothing here
 * requires a Windows permission or a UAC prompt — every API the tracker uses
 * works at the user's own integrity level. Asking for permission Windows never
 * asked for would misdescribe what is happening, so this asks the user to
 * decide what Trace should record instead, which is what DOCS/Privacy.md §26
 * specifies.
 */
export function Onboarding({
  onComplete,
  busy,
}: {
  onComplete: (choices: {
    recordWindowTitles: boolean;
    idleDetectionEnabled: boolean;
    startWithWindows: boolean;
  }) => void;
  busy: boolean;
}) {
  const [step, setStep] = useState<'promise' | 'choices'>('promise');
  const [recordWindowTitles, setRecordWindowTitles] = useState(true);
  const [idleDetectionEnabled, setIdleDetectionEnabled] = useState(true);
  const [startWithWindows, setStartWithWindows] = useState(true);

  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="enter w-full max-w-[520px]">
        <div className="mb-10 flex items-center gap-2.5">
          <svg width="14" height="16" viewBox="0 0 16 18" fill="none" aria-hidden>
            <rect x="0" y="0" width="16" height="3.2" rx="1.6" fill="var(--color-ink)" />
            <rect x="6.4" y="5" width="3.2" height="6.4" rx="1.6" fill="var(--color-ink)" />
            <circle cx="8" cy="15.4" r="2.5" fill="var(--color-accent)" />
          </svg>
          <span className="text-[13px] font-semibold tracking-[0.18em] text-ink">TRACE</span>
        </div>

        {step === 'promise' ? (
          <section>
            <h1 className="display text-[34px] leading-tight text-ink">
              Your activity.
              <br />
              Your computer.
              <br />
              Your data.
            </h1>

            <p className="mt-6 max-w-md leading-relaxed text-ink-2">
              Trace records which applications you use and when, and builds a searchable history of
              your day. Everything stays on this computer. There is no account, no server, and
              nothing is ever uploaded.
            </p>

            <div className="mt-9">
              <p className="eyebrow mb-3">Never recorded</p>
              <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-ink-3">
                {[
                  'Keystrokes',
                  'Passwords',
                  'Screenshots',
                  'Clipboard contents',
                  'Microphone',
                  'Webcam',
                  'File contents',
                  'Message contents',
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="mt-11">
              <Button variant="accent" onClick={() => setStep('choices')}>
                Continue
              </Button>
            </div>
          </section>
        ) : (
          <section>
            <h1 className="display text-[34px] leading-tight text-ink">
              What should Trace record?
            </h1>
            <p className="mt-4 text-ink-2">You can change any of this later in Settings.</p>

            <div className="mt-8">
              <Choice
                checked
                disabled
                label="Applications and sessions"
                detail="Which application you were using, and for how long. This is what Trace is."
                onChange={() => {}}
              />
              <Choice
                checked={recordWindowTitles}
                onChange={setRecordWindowTitles}
                label="Window titles"
                detail="Turns “Chrome — 2h” into “YouTube, GitHub, Google”. Titles can contain private information."
              />
              <Choice
                checked={idleDetectionEnabled}
                onChange={setIdleDetectionEnabled}
                label="Idle time"
                detail="Stops the clock when you walk away, so time you were not there is not counted as use."
              />
              <Choice
                checked={startWithWindows}
                onChange={setStartWithWindows}
                label="Start with Windows"
                detail="Runs the tracker quietly when you sign in. The window stays closed until you open it."
              />
            </div>

            <div className="mt-11 flex items-center gap-2">
              <Button
                variant="accent"
                onClick={() =>
                  onComplete({ recordWindowTitles, idleDetectionEnabled, startWithWindows })
                }
              >
                {busy ? 'Starting…' : 'Start tracking'}
              </Button>
              <Button variant="ghost" onClick={() => setStep('promise')}>
                Back
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Choice({
  checked,
  onChange,
  label,
  detail,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        'flex items-start gap-3 border-b border-hair py-4 last:border-b-0',
        disabled ? 'opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-ink">{label}</span>
        <span className="mt-1 block leading-relaxed text-ink-3">{detail}</span>
      </span>
    </label>
  );
}
