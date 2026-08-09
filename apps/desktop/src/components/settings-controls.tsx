import { useState, type ReactNode } from 'react';
import { Button } from './primitives';

/**
 * A setting: what it is on the left, the control on the right.
 *
 * One hairline between rows, which is a real boundary between two independent
 * choices. No container around the group — the section label above it is enough
 * to say where the group begins.
 */
export function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-10 border-b border-hair py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-ink">{label}</div>
        {description && (
          <div className="mt-1 max-w-lg leading-relaxed text-ink-3">{description}</div>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-[18px] w-[32px] rounded-full transition-colors duration-200',
        disabled ? 'cursor-not-allowed opacity-40' : '',
        checked ? 'bg-accent' : 'bg-white/12',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] h-3 w-3 rounded-full bg-canvas transition-all duration-200',
          checked ? 'left-[17px]' : 'left-[3px]',
        ].join(' ')}
      />
    </button>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="rounded-md bg-lift px-2.5 py-1.5 text-ink focus:outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-canvas">
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A destructive action, behind its consequences.
 *
 * Deleting history cannot be undone — DOCS/data and database.md §20 rules out
 * building a recovery system — so the confirmation states plainly what goes,
 * and the worst of them asks for the words to be typed.
 */
export function DangerousAction({
  label,
  description,
  confirmTitle,
  confirmBody,
  confirmWord,
  actionLabel,
  onConfirm,
  busy,
}: {
  label: string;
  description: string;
  confirmTitle: string;
  confirmBody: string;
  confirmWord?: string;
  actionLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const ready = confirmWord === undefined || typed.trim().toUpperCase() === confirmWord;

  if (!open) {
    return (
      <SettingRow
        label={label}
        description={description}
        control={<Button onClick={() => setOpen(true)}>{actionLabel}</Button>}
      />
    );
  }

  return (
    <div className="border-b border-hair py-4 last:border-b-0">
      {/* A left rule in the danger colour rather than a box: it marks the
          passage without fencing it. */}
      <div className="border-l-2 border-danger/60 pl-4">
        <p className="text-ink">{confirmTitle}</p>
        <p className="mt-1.5 max-w-lg leading-relaxed text-ink-3">{confirmBody}</p>

        {confirmWord && (
          <label className="mt-4 block max-w-xs text-ink-3">
            Type <span className="data text-ink">{confirmWord}</span> to confirm
            <input
              type="text"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              className="data mt-2 w-full border-b border-hair-strong bg-transparent pb-1.5 text-ink focus:border-danger focus:outline-none"
            />
          </label>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={onConfirm}
            className="rounded-md bg-danger/15 px-2.5 py-[5px] text-danger transition-colors hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Deleting…' : actionLabel}
          </button>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              setTyped('');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
