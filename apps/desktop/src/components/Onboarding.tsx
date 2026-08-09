import { useState } from 'react';
import { Button } from './primitives';

/**
 * First run.
 *
 * Framed as consent rather than as a permission request. DOCS/MVP.md §9 sketches
 * a screen saying "Trace needs access to basic Windows activity information",
 * but nothing here requires a Windows permission or a UAC prompt — every API the
 * tracker uses works at the user's own integrity level. Asking for permission
 * Windows never asked for would misdescribe what is happening, so this asks the
 * user to decide what Trace should record instead, which is what
 * DOCS/Privacy.md §26 actually specifies.
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
    <div className="flex h-full items-center justify-center bg-surface px-8">
      <div className="fade-in w-full max-w-[520px]">
        <div className="mb-10 text-center">
          <div className="text-[13px] font-semibold tracking-[0.2em] text-ink">TRACE</div>
          <p className="mt-2 text-ink-dim">Your computer, remembered.</p>
        </div>

        {step === 'promise' ? (
          <section>
            <h1 className="text-[17px] font-medium text-ink">Your activity. Your computer. Your data.</h1>
            <p className="mt-3 leading-relaxed text-ink-dim">
              Trace records which applications you use and when, and builds a searchable history of
              your day. Everything stays on this computer — there is no account, no server, and
              nothing is ever uploaded.
            </p>

            <div className="mt-6 rounded-[6px] border border-line bg-card px-4 py-3.5">
              <p className="text-ink">Trace never records</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-ink-dim">
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
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex justify-end">
              <Button variant="accent" onClick={() => setStep('choices')}>
                Continue
              </Button>
            </div>
          </section>
        ) : (
          <section>
            <h1 className="text-[17px] font-medium text-ink">What should Trace record?</h1>
            <p className="mt-2 text-ink-dim">You can change any of this later in Settings.</p>

            <div className="mt-6 space-y-px">
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
                detail="Runs the tracker quietly when you sign in. The dashboard stays closed until you open it."
              />
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('promise')}>
                Back
              </Button>
              <Button
                variant="accent"
                onClick={() =>
                  onComplete({ recordWindowTitles, idleDetectionEnabled, startWithWindows })
                }
              >
                {busy ? 'Starting…' : 'Start Tracking'}
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
        'flex cursor-pointer items-start gap-3 rounded-[5px] border border-line px-4 py-3 transition-colors',
        disabled ? 'cursor-default opacity-70' : 'hover:border-line-strong',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] h-3.5 w-3.5 accent-[var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-ink">{label}</span>
        <span className="mt-0.5 block text-ink-dim">{detail}</span>
      </span>
    </label>
  );
}
