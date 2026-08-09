import { writeFileSync } from 'node:fs';

/**
 * Screenshots the running window over the DevTools protocol.
 *
 * Preferred over PrintWindow: no DPI virtualisation to get wrong, no window
 * frame in the image, and it can navigate first. An earlier Win32 capture was
 * silently cropping to about 80% of the window, which read as the interface
 * overflowing and sent three rounds of fixes after a bug that was not there.
 *
 *   node scripts/shot.mjs <out.png> [route] [port]
 */
const [outFile = 'shot.png', route, portArg] = process.argv.slice(2);
const port = Number(portArg ?? 9333);

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((target) => target.type === 'page');

if (!page) {
  console.error(`No page target on ${port}. Launch Electron with --remote-debugging-port=${port}.`);
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

function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

await new Promise((resolve) => socket.addEventListener('open', resolve));

if (route) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(route)}` });
  // Let the route's queries resolve before the shutter.
  await new Promise((resolve) => setTimeout(resolve, 1400));
}

const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(outFile, Buffer.from(data, 'base64'));

console.log(`${outFile} written`);
socket.close();
