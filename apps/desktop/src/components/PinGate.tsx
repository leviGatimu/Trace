import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { setPinPrompt, trace, TraceError } from '@/services/trace';

type Pending = { message: string; resolve: (unlocked: boolean) => void };

/**
 * The PIN window. Mounted once; any guarded request the tracker refuses opens
 * it (see `call` in services/trace.ts), and the request is sent again once
 * the PIN is accepted. Checking happens in the tracker, never here.
 */
export function PinGate() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    setPinPrompt(
      (message) =>
        new Promise<boolean>((resolve) => {
          setPending((previous) => {
            previous?.resolve(false);
            return { message, resolve };
          });
        }),
    );
    return () => setPinPrompt(null);
  }, []);

  if (!pending) {
    return null;
  }

  const finish = (unlocked: boolean) => {
    pending.resolve(unlocked);
    setPending(null);
  };

  return <PinDialog message={pending.message} onDone={finish} />;
}

export function PinDialog({
  message,
  onDone,
  title = 'Trace is protected',
}: {
  message: string;
  onDone: (unlocked: boolean) => void;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [useRecovery]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDone(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!secret.trim() || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await trace.unlock(secret);
      await queryClient.invalidateQueries({ queryKey: ['protection'] });
      onDone(true);
    } catch (caught) {
      setError(caught instanceof TraceError ? caught.message : 'Trace could not check the PIN.');
      setSecret('');
      setShake((n) => n + 1);
      void queryClient.invalidateQueries({ queryKey: ['protection'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[3px]" onClick={() => onDone(false)} role="presentation" />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={submit}
        className="fixed left-1/2 top-1/2 z-[61] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-[#141416] p-7 shadow-[0_30px_80px_rgb(0_0_0/70%)] ring-1 ring-white/[0.06]"
        style={{ animation: 'pop 300ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-[#8ea7ff]">
          <Icon name="shield" />
        </span>
        <h2 className="mt-4 text-[22px] font-medium text-ink">{title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{message}</p>

        <div key={shake} style={shake ? { animation: 'pin-shake 380ms ease both' } : undefined}>
          <input
            ref={input}
            value={secret}
            onChange={(event) => setSecret(useRecovery ? event.target.value : event.target.value.replace(/\D/g, ''))}
            type={useRecovery ? 'text' : 'password'}
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="off"
            spellCheck={false}
            maxLength={useRecovery ? 24 : 12}
            placeholder={useRecovery ? 'XXXX-XXXX-XXXX-XXXX' : 'PIN'}
            aria-label={useRecovery ? 'Recovery code' : 'PIN'}
            className={[
              'mt-5 h-14 w-full rounded-[14px] bg-card-2 px-4 text-center text-ink outline-none placeholder:text-ink-4 focus:ring-2 focus:ring-accent/70',
              useRecovery ? 'text-[17px] uppercase tracking-[0.12em]' : 'text-[26px] tracking-[0.5em]',
            ].join(' ')}
          />
        </div>

        <p className="mt-3 min-h-[20px] text-[13.5px] text-coral" role="alert">
          {error}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setUseRecovery((value) => !value);
              setSecret('');
              setError(null);
            }}
            className="text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
          >
            {useRecovery ? 'Use the PIN' : 'Forgot it? Use the recovery code'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDone(false)}
              className="h-10 rounded-full bg-card-2 px-5 text-[13.5px] text-ink-2 hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!secret.trim() || busy}
              className="h-10 rounded-full bg-white px-5 text-[13.5px] font-medium text-[#111114] transition disabled:opacity-40"
            >
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
