import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Captures every documented page of a running Trace dashboard over the
 * DevTools protocol. Start a sandbox dashboard with demo history first
 * (see README.md in this folder), then:
 *
 *   node capture.mjs <out-dir> [port] [name=route[@scrollY] ...]
 */
const [outDir = '.', portArg, ...only] = process.argv.slice(2);
const port = Number(portArg ?? 9333);
// A full weekday of the demo history (local midnight, ms). Override with TRACE_SHOT_DAY.
const DAY = process.env.TRACE_SHOT_DAY ?? String(new Date(2026, 10, 17).getTime());

// The application shown in detail (Google Chrome in the demo history). Override with TRACE_SHOT_APP.
const APP = process.env.TRACE_SHOT_APP ?? '15';

const shots = only.length
  ? only.map((shot) => {
      const [name, ...rest] = shot.split('=');
      const [route, scroll] = rest.join('=').split('@');
      return [name, route, Number(scroll ?? 0)];
    })
  : [
      ['overview', `#/?day=${DAY}`],
      ['overview-lower', `#/?day=${DAY}`, 760],
      ['timeline', `#/timeline?day=${DAY}`],
      ['timeline-gaps', `#/timeline?day=${DAY}&show=gaps`],
      ['calendar', `#/calendar?day=${DAY}`],
      ['applications', `#/applications?day=${DAY}`],
      ['applications-month', `#/applications?day=${DAY}&scope=month`],
      ['application-detail', `#/applications/${APP}?day=${DAY}`],
      ['application-detail-lower', `#/applications/${APP}?day=${DAY}`, 700],
      ['background', `#/background?day=${DAY}`],
      ['system', `#/system?day=${DAY}`],
      ['protection', '#/protection'],
      ['protection-log', '#/protection', 620],
      ['settings', '#/settings?section=recording'],
      ['settings-privacy', '#/settings?section=privacy'],
      ['settings-excluded', '#/settings?section=excluded'],
      ['settings-data', '#/settings?section=data'],
    ];

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((target) => target.type === 'page');
if (!page) {
  console.error(`No page target on ${port}.`);
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message.result);
  pending.delete(message.id);
});
const send = (method, params) => {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await new Promise((resolve) => socket.addEventListener('open', resolve));
mkdirSync(outDir, { recursive: true });

// Still frames: no entrance animations or transitions half-way through.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Runtime.evaluate', {
  expression: `(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}'; document.head.appendChild(s); })()`,
});

// The page scrolls inside the app's own container, not the window.
const scrollTo = (y) => `(() => {
  const all = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight - e.clientHeight > 40 && getComputedStyle(e).overflowY !== 'visible');
  const box = all.sort((a, b) => b.clientHeight - a.clientHeight)[0];
  if (box) box.scrollTop = ${y};
})()`;

// The sandbox lives in a temporary folder; show the path a real install uses.
function maskSandboxPath() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes('trace-sandbox')) {
      node.nodeValue = node.nodeValue.replace(/[A-Z]:\\\S*?trace-sandbox/gi, 'C:\\Users\\you\\AppData\\Local\\Trace');
    }
  }
}
const hideSandboxPath = `(${maskSandboxPath.toString()})()`;

for (const [name, route, y = 0] of shots) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(route)}` });
  // Long enough for the route's queries to resolve.
  await wait(3000);
  await send('Runtime.evaluate', { expression: scrollTo(y) });
  await send('Runtime.evaluate', { expression: hideSandboxPath });
  await wait(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(file);
}

socket.close();
