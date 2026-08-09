# Trace IPC Contract

Normative specification of the protocol between `Trace.exe` (Electron UI) and
`TraceTracker.exe` (C# background tracker).

The tracker is the sole owner of `activity.db`. **The UI never opens the database
file.** Every read and every mutation crosses this boundary.

Both sides implement this document by hand — `packages/contracts/ts` for
TypeScript and `packages/contracts/cs` for C#. They are kept honest by the
version handshake in §3 and by `Trace.Tracker.Tests/ContractSurfaceTests.cs`,
which asserts the tracker's router exposes exactly the method list in §5.

---

## 1. Transport

| Property | Value |
|---|---|
| Mechanism | Windows named pipe |
| Name | `\\.\pipe\Trace.<UserSid>` |
| Mode | Duplex, message-oriented reads, byte stream framing |
| Encoding | UTF-8, no BOM |
| Framing | Newline-delimited JSON (NDJSON). Exactly one JSON object per line; `\n` terminates. Objects contain no raw newlines. |
| Max frame | 8 MiB. A longer frame is a protocol error and the connection is dropped. |
| Concurrency | Multiple simultaneous client connections. Requests may be pipelined; responses may arrive out of order and are correlated by `id`. |

### 1.1 Security

The pipe is created with a `PipeSecurity` descriptor granting `FullControl` to
the current user SID and `NT AUTHORITY\SYSTEM` only. No other account —
including other interactive users on the same machine — can open it.

The first instance is created with `FILE_FLAG_FIRST_PIPE_INSTANCE`. If the name
is already taken, the tracker logs the condition and exits rather than falling
back to an unprotected pipe. This prevents a local process from squatting the
name and impersonating the tracker.

There is no network listener anywhere in Trace.

---

## 2. Message shapes

### Request (client → tracker)

```jsonc
{
  "id": "17",                 // opaque, unique per connection
  "method": "activity.getDay",
  "params": { }               // method-specific; omitted when the method takes none
}
```

### Response (tracker → client)

```jsonc
{ "id": "17", "ok": true,  "result": { } }
{ "id": "17", "ok": false, "error": { "code": "E_RANGE", "message": "…" } }
```

### Push (tracker → client, unsolicited)

```jsonc
{ "event": "state.changed", "data": { } }
```

A push has no `id`. Clients must ignore pushes whose `event` they do not
recognise, so the tracker can add events without breaking older UIs.

### Error codes

| Code | Meaning |
|---|---|
| `E_UNKNOWN_METHOD` | Method not in this contract version. |
| `E_BAD_PARAMS` | Params missing or wrong type. |
| `E_RANGE` | Time range invalid, inverted, or exceeds the permitted span. |
| `E_NOT_FOUND` | Referenced application/session does not exist. |
| `E_PATH` | Export path is not absolute, or its directory does not exist. |
| `E_DEGRADED` | Tracker is running but the database is unavailable. |
| `E_BUSY` | A conflicting long operation (delete/vacuum/export) is in progress. |
| `E_INTERNAL` | Unexpected failure. Details are logged, never returned. |

---

## 3. Versioning

`system.hello` **must** be the first request on every connection. It returns
`contractVersion`, `trackerVersion` and `schemaVersion`.

- The UI refuses to operate against a `contractVersion` it does not support and
  shows an explicit "Trace needs updating" state. It never guesses at a
  mismatched protocol.
- Additive changes (new methods, new optional response fields, new push events)
  bump the minor version. Removals or shape changes bump the major version.

Current: **contract v1.0**.

---

## 4. Units and conventions

| Convention | Rule |
|---|---|
| Timestamps | UTC epoch **milliseconds**, `number`. Field names end in `At` / `UtcMs`. |
| Durations | Whole **seconds**, `number`. Field names end in `Seconds`. |
| Ranges | Half-open `[fromUtcMs, toUtcMs)`. |
| Local days | The **UI** computes local-day boundaries (honouring the user's timezone and DST) and sends UTC bounds. The tracker never guesses the user's timezone. |
| Nullability | Explicit `null`, never omitted, for known-absent values. |

**The UI never computes activity truth.** Every duration, total and count in a
response is final. The UI's only numeric responsibility is formatting
(`8020` → `2h 14m`). This is `DOCS/data and database.md` §26 enforced by the
shape of this contract.

---

## 5. Methods

| Method | Params | Result |
|---|---|---|
| `system.hello` | — | `HelloResult` |
| `system.status` | — | `TrackerStatus` |
| `activity.getCurrent` | — | `CurrentActivity \| null` |
| `activity.getDay` | `DayRange` | `DayActivity` |
| `activity.getTimeline` | `TimelineQuery` | `TimelineEntry[]` |
| `activity.getCalendar` | `CalendarQuery` | `CalendarDay[]` |
| `applications.list` | `DayRange` | `ApplicationSummary[]` |
| `applications.getDetail` | `{ applicationId, ...DayRange }` | `ApplicationDetail` |
| `sessions.getDetail` | `{ sessionId }` | `SessionDetail` |
| `search.query` | `SearchQuery` | `SearchResult[]` |
| `settings.get` | — | `Settings` |
| `settings.update` | `Partial<Settings>` | `Settings` |
| `tracking.pause` | — | `TrackerStatus` |
| `tracking.resume` | — | `TrackerStatus` |
| `data.deleteRange` | `{ fromUtcMs, toUtcMs }` | `DeleteResult` |
| `data.deleteApplication` | `{ applicationId }` | `DeleteResult` |
| `data.deleteAll` | `{ confirm: "DELETE ALL" }` | `DeleteResult` |
| `data.export` | `{ absolutePath, fromUtcMs?, toUtcMs? }` | `ExportResult` |

Full field-level definitions live in `packages/contracts/ts/index.ts`, which is
the machine-readable half of this specification.

### 5.1 `activity.getCalendar`

`CalendarQuery` carries `dayStartsUtcMs`: the local midnights the caller wants
totalled, consistent with the local-days rule in §4 — the tracker is told where
the boundaries are rather than deriving them. The final day is assumed to be as
long as the one before it. An empty list returns `E_BAD_PARAMS`; more than
`CalendarQuery.MaxDays` (400) returns `E_RANGE`.

A merged session is counted once, on the local day it **started** in. Splitting
one that crosses midnight would require assuming its active time was spread
evenly, which is detail the tracker never recorded.

### 5.2 Destructive-method rules

- `data.deleteAll` requires the literal confirmation string. A missing or wrong
  value returns `E_BAD_PARAMS`; there is no unguarded delete-everything call.
- Deletion is a real `DELETE` across `events`, `window_sessions`, `sessions`,
  and then orphaned `applications`. No soft-delete flag exists in the schema, so
  "hidden but retained" is not representable (`DOCS/Privacy.md` §21).
- `data.export` validates that `absolutePath` is rooted, that its parent
  directory exists, and that it is not inside Trace's own data directory.

---

## 6. Push events

| Event | Fires when | Client action |
|---|---|---|
| `state.changed` | Tracking state changes (`ACTIVE`/`IDLE`/`PAUSED`/`LOCKED`/`SUSPENDED`/`DEGRADED`). | Update the tracking indicator; re-read `system.status`. |
| `activity.changed` | A session or window session opens or closes. | Invalidate current-activity and today's caches. |
| `settings.changed` | Settings changed from any client or the tray. | Re-read settings. |
| `data.changed` | A delete or retention sweep modified history. | Invalidate all activity caches. |

Pushes carry only enough data to decide what to invalidate. The UI re-queries
rather than mutating local state from a push, so there is one code path
producing what it renders.

---

## 7. Connection lifecycle

1. UI connects, sends `system.hello`, validates the version.
2. UI subscribes implicitly — all pushes go to all connected clients.
3. On disconnect, the UI reconnects with backoff (0.5 s → 10 s, capped) and
   surfaces the "Tracker unavailable / [Restart Tracker]" state described in
   `DOCS/Windows Integration & Application Lifecycle.md` §21.
4. While disconnected the UI **must not** render stale data as live. Cached
   history may remain visible, clearly marked; live indicators go to an
   unavailable state.
