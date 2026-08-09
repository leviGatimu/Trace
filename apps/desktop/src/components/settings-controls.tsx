import { useState, type ReactNode } from 'react';
import { Button } from './primitives';

/** A labelled row with an explanation and a control on the right. */
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
    <div className="flex items-start justify-between gap-8 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-ink">{label}</div>
        {description && <div className="mt-0.5 text-ink-dim">{description}</div>}
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
        'relative h-[22px] w-[38px] rounded-full border transition-colors duration-200',
        disabled ? 'cursor-not-allowed opacity-40' : '',
        checked ? 'border-accent-dim bg-accent-dim' : 'border-line-strong bg-raised',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all duration-200',
          checked ? 'left-[19px] bg-ink' : 'left-[2px] bg-ink-faint',
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
      className="rounded-[5px] border border-line bg-raised px-2.5 py-1.5 text-ink focus:border-accent-dim focus:outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A destructive action behind an explicit confirmation.
 *
 * Deleting history is irreversible — DOCS/data and database.md §20 rules out
 * building a recovery system — so the consequence is spelled out before the
 * button appears, and the most destructive action asks the user to type the
 * words.
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
    <div className="border-b border-line py-3.5 last:border-b-0">
      <div className="rounded-[6px] border border-danger/30 bg-danger/5 p-4">
        <p className="text-ink">{confirmTitle}</p>
        <p className="mt-1 text-ink-dim">{confirmBody}</p>

        {confirmWord && (
          <label className="mt-3 block text-ink-dim">
            Type <span className="font-mono text-ink">{confirmWord}</span> to confirm
            <input
              type="text"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              className="mt-1.5 w-full select-text rounded-[5px] border border-line bg-surface px-2.5 py-1.5 font-mono text-ink focus:border-danger focus:outline-none"
            />
          </label>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={onConfirm}
            className="rounded-[5px] border border-danger/50 bg-danger/10 px-2.5 py-1.5 text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
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
