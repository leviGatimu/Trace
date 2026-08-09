/**
 * Measures the running window's layout over the DevTools protocol.
 *
 * Written because three rounds of reasoning about why a column was clipped
 * produced three wrong answers. Launch Electron with
 * `--remote-debugging-port=9333` and run this: it reports what the page
 * actually did, rather than what the CSS ought to have done.
 */
const PORT = Number(process.argv[2] ?? 9333);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((target) => target.type === 'page');

if (!page) {
  console.error('No page target. Is Electron running with --remote-debugging-port?');
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolve = pending.get(message.id);

  if (resolve) {
    pending.delete(message.id);
    resolve(message.result);
  }
});

function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

await new Promise((resolve) => socket.addEventListener('open', resolve));

const expression = `(() => {
  const pick = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      left: Math.round(r.left),
      right: Math.round(r.right),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    };
  };

  const widest = [...document.querySelectorAll('main *')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.right > window.innerWidth + 1)
    .slice(0, 4)
    .map(({ el, r }) => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 90),
      right: Math.round(r.right),
    }));

  return JSON.stringify({
    dpr: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    body: pick('body'),
    main: pick('main'),
    scroller: pick('main > div:last-child'),
    content: pick('main > div:last-child > div'),
    overflowing: widest,
  }, null, 2);
})()`;

const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
console.log(result.value);
socket.close();
