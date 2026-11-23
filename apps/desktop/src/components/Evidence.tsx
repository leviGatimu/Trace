import type { CoverageKind, EvidenceLabel } from '@trace/contracts';

/**
 * How much a statement on screen rests on.
 *
 * - Observed: Windows reported it, or Trace recorded it as it happened.
 * - Inferred: derived by a stated rule from records that do exist.
 * - Unknown: there is no record. Said out loud, never left blank.
 */
const evidenceStyle: Record<EvidenceLabel, { label: string; className: string }> = {
  observed: { label: 'Observed', className: 'border-hair-strong text-ink-2' },
  inferred: { label: 'Inferred', className: 'border-warning/40 text-warning' },
  unknown: { label: 'Unknown', className: 'border-hair text-ink-4' },
};

export function EvidenceBadge({ evidence }: { evidence: EvidenceLabel }) {
  const style = evidenceStyle[evidence];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 text-[11px] leading-[18px] ${style.className}`}
    >
      {style.label}
    </span>
  );
}

/** What a coverage segment is, in the words the timeline uses. */
export const coverageLabel: Record<CoverageKind, string> = {
  recorded: 'Recorded',
  locked: 'Computer locked',
  paused: 'Tracking paused',
  asleep: 'Computer asleep',
  'powered-off': 'Computer off',
  'signed-out': 'Signed out',
  'trace-stopped': 'Trace not running',
  'unrecorded-window': 'Unrecorded window',
  unknown: 'No record',
  'before-trace': 'Before Trace',
};

/** Evidence ids, as text that can be selected and searched for. */
export function EvidenceIds({ ids }: { ids: string[] }) {
  if (ids.length === 0) {
    return null;
  }

  return <span className="data select-text text-ink-4">{ids.join(' · ')}</span>;
}
