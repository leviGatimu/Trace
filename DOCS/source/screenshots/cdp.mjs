// node cdp.mjs "<js expression>" [port] — evaluates in the dashboard and prints the result.
const [expression, portArg] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${Number(portArg ?? 9333)}/json/list`)).json();
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => socket.addEventListener('open', r));
socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
const reply = await new Promise((r) => socket.addEventListener('message', (e) => r(JSON.parse(e.data))));
console.log(JSON.stringify(reply.result?.result?.value ?? reply.result, null, 1));
socket.close();
