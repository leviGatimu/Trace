/**
 * Trace's icon set: 16px, 1.5px strokes, drawn for this product rather than
 * borrowed, so there is no icon library to ship. Decorative by default; pass
 * a label when the icon is the only thing naming a control.
 */
const paths = {
  overview: 'M2.5 2.5h4.5v5h-4.5zM9 2.5h4.5v3H9zM9 7.5h4.5v6H9zM2.5 9.5h4.5v4h-4.5z',
  timeline: 'M5 3.5h8.5M5 8h8.5M5 12.5h8.5M2.5 3.5h.01M2.5 8h.01M2.5 12.5h.01',
  applications: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z',
  calendar: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
  // Drawn on a 24-unit grid (see GRID_24 below).
  settings:
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  search: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.3 10.3l3.2 3.2',
  close: 'M4 4l8 8M12 4l-8 8',
  left: 'M10 3.5L5.5 8l4.5 4.5',
  right: 'M6 3.5l4.5 4.5L6 12.5',
  up: 'M3.5 10L8 5.5l4.5 4.5',
  down: 'M3.5 6L8 10.5 12.5 6',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5v-8h7',
  gap: 'M2 8h3M11 8h3M6.5 5.5l3 5',
  filter: 'M2.5 3.5h11l-4.2 5v4.5l-2.6-1.3V8.5z',
  sort: 'M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5',
  gaps: 'M2 8a6 6 0 0 1 12 0M14 8a6 6 0 0 1-12 0M8 4.5V8l2 1.5',
  pause: 'M5.5 3.5v9M10.5 3.5v9',
  play: 'M5 3.2v9.6L12.8 8z',
  lock: 'M4 7.5h8v6H4zM5.8 7.5V5.2a2.2 2.2 0 0 1 4.4 0v2.3',
  shield: 'M8 1.8l5.2 2v4.1c0 3.1-2.2 5.3-5.2 6.3-3-1-5.2-3.2-5.2-6.3V3.8zM5.8 8l1.6 1.6 2.9-3',
  unlock: 'M4 7.5h8v6H4zM5.8 7.5V5.2a2.2 2.2 0 0 1 4.3-.6',
  alert: 'M8 2l6.3 11H1.7zM8 6.5v3M8 11.5h.01',
  download: 'M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10',
  layers: 'M8 2l6 3.2-6 3.2-6-3.2zM2 8.2l6 3.2 6-3.2M2 11.2l6 3.2 6-3.2',
  cpu: 'M4.5 4.5h7v7h-7zM6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14',
  gpu: 'M1.5 4.5h13v7h-13zM5.5 8a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M11 6.5v3M3 11.5v2',
  memory: 'M2 5h12v6H2zM4.5 5v6M7 5v6M9.5 5v6M12 5v6',
  keyboard: 'M1.5 4.5h13v7h-13zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6',
  mouse: 'M8 1.8a4 4 0 0 1 4 4v4.4a4 4 0 0 1-8 0V5.8a4 4 0 0 1 4-4zM8 1.8v4',
  speaker: 'M2.5 10V8a5.5 5.5 0 0 1 11 0v2M2.5 10h2v4h-2zM11.5 10h2v4h-2z',
  microphone: 'M6 2.5h4v6.5a2 2 0 0 1-4 0zM3.5 8.5a4.5 4.5 0 0 0 9 0M8 13v1.5',
  camera: 'M1.5 4.5h9v7h-9zM10.5 7l4-2v6l-4-2',
  display: 'M1.5 2.5h13v8.5h-13zM5.5 14h5M8 11v3',
  storage: 'M5 1.5h6v4H5zM3.5 5.5h9v9h-9zM6.5 9h3',
  phone: 'M4.5 1.5h7v13h-7zM7 12.5h2',
  bluetooth: 'M4 5l8 6-4 3V2l4 3-8 6',
  printer: 'M4.5 6V1.5h7V6M4.5 11.5h-3v-5.5h13v5.5h-3M4.5 9.5h7v5h-7z',
  controller: 'M4.5 4.5h7a3.5 3.5 0 0 1 3.3 4.6l-.8 2.6a1.6 1.6 0 0 1-2.8.5L9.7 10.5H6.3L4.8 12.2a1.6 1.6 0 0 1-2.8-.5l-.8-2.6A3.5 3.5 0 0 1 4.5 4.5zM5 6.5v2M4 7.5h2M10.5 7.5h.01M12 7.5h.01',
  clock: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2zM8 4.8V8l2.2 1.6',
} as const;

export type IconName = keyof typeof paths;

/** Icons drawn on a 24-unit grid rather than 16 (the gear is Lucide's, ISC licence). */
const GRID_24: ReadonlySet<IconName> = new Set(['settings']);

export function Icon({ name, label, className }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      viewBox={GRID_24.has(name) ? '0 0 24 24' : '0 0 16 16'}
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={GRID_24.has(name) ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'shrink-0'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={paths[name]} />
    </svg>
  );
}
