# Trace documentation

Everything written about Trace: what it is, what it must do, how it is built,
and what it looks like. Start with the PDFs; the Markdown files are the
detailed working specifications they draw on.

![Trace overview](images/screenshots/overview.png)

## Folder map

```
DOCS/
├── README.md            this index
├── pdf/                 finished documents to read or share
├── product/             what Trace is for and what each version covers
├── specs/               detailed behaviour: tracking, privacy, data, Windows, UI
├── engineering/         architecture and the technical implementation plan
├── images/
│   ├── screenshots/     app screens on made-up demo history, safe to share
│   └── real-captures/   screens of the owner's real history (private)
└── source/              HTML and CSS the PDFs are built from, and the scripts
                         that build them and capture the screenshots
```

## Documents

| Document | What it answers |
|---|---|
| [Concept note](pdf/Trace-Concept-Note.pdf) | Why Trace exists, its principles, what it does, a tour of the app |
| [Software requirements specification](pdf/Trace-SRS.pdf) | Every requirement, numbered and prioritised, with the screen that meets it |
| [Implementation plan](pdf/Trace-Implementation-Plan.pdf) | What is delivered, the phases to 1.0, schedule, release and risks |

### Product

| File | Contents |
|---|---|
| [mvp.md](product/mvp.md) | The first release: scope and acceptance test |
| [mvp-v2.md](product/mvp-v2.md) | Version 2: calendar, analytics and navigation |
| [trace-2.0-plan.md](product/trace-2.0-plan.md) | Trace 2.0 audit and slices: identity, records, background apps |

### Specifications

| File | Contents |
|---|---|
| [tracking.md](specs/tracking.md) | How sessions, idle, locks and sleep are recorded |
| [privacy.md](specs/privacy.md) | What is and is never collected, and the controls |
| [data-and-database.md](specs/data-and-database.md) | Schema, retention, deletion and recovery rules |
| [windows-integration.md](specs/windows-integration.md) | Startup, tray, installer, shutdown and failure states |
| [ui-ux-design.md](specs/ui-ux-design.md) | Pages, behaviour and visual direction |

### Engineering

| File | Contents |
|---|---|
| [project-architecture.md](engineering/project-architecture.md) | Processes, components and boundaries |
| [technical-implementation-plan.md](engineering/technical-implementation-plan.md) | Technical decisions, Windows APIs, IPC, session engine, milestones |

## Screens

All of these use made-up demo history, so they can be shared freely.

| | |
|---|---|
| ![Overview](images/screenshots/overview.png) **Overview** | ![Latest activity](images/screenshots/overview-lower.png) **Latest activity** |
| ![Timeline](images/screenshots/timeline.png) **Timeline** | ![Gaps](images/screenshots/timeline-gaps.png) **Gaps only** |
| ![Calendar](images/screenshots/calendar.png) **Calendar** | ![Applications](images/screenshots/applications.png) **Applications, one day** |
| ![Applications, 30 days](images/screenshots/applications-month.png) **Applications, 30 days** | ![Application detail](images/screenshots/application-detail.png) **Application detail** |
| ![Application windows](images/screenshots/application-detail-lower.png) **Application windows and program files** | ![Background apps](images/screenshots/background.png) **Background apps** |
| ![System](images/screenshots/system.png) **System** | ![Protection](images/screenshots/protection.png) **Protection** |
| ![Tamper log](images/screenshots/protection-log.png) **Tamper log** | ![PIN prompt](images/screenshots/pin-prompt.png) **PIN prompt** |
| ![Recording settings](images/screenshots/settings.png) **Recording settings** | ![Privacy](images/screenshots/settings-privacy.png) **Privacy** |
| ![Excluded apps](images/screenshots/settings-excluded.png) **Excluded apps** | ![Your data](images/screenshots/settings-data.png) **Your data** |

`images/real-captures/` holds screens of the owner's real history, with real
window titles and searches. Keep them out of anything shared.

## Rebuilding

**PDFs.** Edit the HTML in `source/`, which shares `doc.css`, then run:

```
node DOCS/source/build-pdfs.mjs                  # all three
node DOCS/source/build-pdfs.mjs srs              # just one
```

**Screenshots.** See [source/screenshots/README.md](source/screenshots/README.md).
They are taken from a sandbox filled with demo history, never from the real
database.
