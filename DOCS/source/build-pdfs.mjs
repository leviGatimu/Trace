import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Renders the HTML sources in this folder to DOCS/pdf with Microsoft Edge in
 * headless mode, the same engine the pages were designed against.
 *
 *   node DOCS/source/build-pdfs.mjs [concept-note|srs|implementation-plan ...]
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'pdf');

const documents = {
  'concept-note': 'Trace-Concept-Note.pdf',
  srs: 'Trace-SRS.pdf',
  'implementation-plan': 'Trace-Implementation-Plan.pdf',
};

const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!edge) {
  throw new Error('Microsoft Edge was not found.');
}

const profile = mkdtempSync(path.join(tmpdir(), 'trace-pdf-'));
const wanted = process.argv.slice(2);

for (const [source, pdf] of Object.entries(documents)) {
  if (wanted.length && !wanted.includes(source)) continue;
  execFileSync(edge, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${path.join(out, pdf)}`,
    pathToFileURL(path.join(here, `${source}.html`)).href,
  ], { stdio: 'ignore' });
  console.log(path.join(out, pdf));
}
