# Retaking the screenshots

The screenshots in `DOCS/images/screenshots` come from a **sandbox** Trace
filled with made-up history. Nothing from the real `activity.db` ever appears.
The installed Trace keeps running untouched beside the sandbox.

1. **Make a sandbox and create its database.** The folder name must contain
   `sandbox`.

   ```
   set TRACE_SANDBOX=%TEMP%\trace-sandbox
   "%LOCALAPPDATA%\Programs\Trace\resources\tracker\TraceTracker.exe"
   ```

   Wait a few seconds, then end that one `TraceTracker.exe` (the newest one).

2. **Write `settings.json`** in the sandbox with `onboardingCompleted: true`,
   `importWindowsRecords: true`, `recordBackgroundApps: false`, and your
   terminal programs in `excludedExecutables` so live commands are not
   recorded.

3. **Fill it with demo history.**

   ```
   python -I DOCS/source/screenshots/demo_history.py %TRACE_SANDBOX%\Data\activity.db
   ```

4. **Start the sandbox tracker and dashboard**, with a debugging port:

   ```
   "%LOCALAPPDATA%\Programs\Trace\resources\tracker\TraceTracker.exe"
   "%LOCALAPPDATA%\Programs\Trace\Trace.exe" --remote-debugging-port=9333
   ```

5. **Optional: protection.** Set a demo PIN and lock it, so the Protection page
   and PIN prompt can be shown:

   ```
   node DOCS/source/screenshots/cdp.mjs "window.trace.request('protection.setup',{pin:'2580'})"
   ```

6. **Capture.** Keep the dashboard window visible; a minimised window renders
   nothing and the capture waits.

   ```
   node DOCS/source/screenshots/capture.mjs DOCS/images/screenshots 9333
   node DOCS/source/screenshots/capture.mjs DOCS/images/screenshots 9333 "timeline=#/timeline@0"
   ```

   The shots use a full weekday of the demo history (`TRACE_SHOT_DAY`) and
   Google Chrome for the detail page (`TRACE_SHOT_APP`, its application id).
   The sandbox folder path is replaced on screen with the default install path.

7. **Check before using.** The System page shows this computer's live hardware
   and processes; crop it to the gauges. Then close the sandbox dashboard, end
   the sandbox tracker, and delete the sandbox folder.
