/**
 * Template preview / authoring page (issue #3).
 *
 * Drop a template JSON file onto the left panel to render it. In Chromium
 * browsers the dropped file's handle is kept and polled, so saving the file
 * in an editor hot-reloads the drawing without re-dropping. The page module
 * itself hot-reloads through Vite. Validator output is always shown under
 * the preview so invalid drafts display their violations next to the plan.
 */
import type { Template } from '../lib/schema/template.schema.ts';
import { validateTemplate } from '../lib/schema/validator.ts';
import { renderTemplate, type RenderOptions } from '../lib/svg/renderer.ts';

/* File System Access API (Chromium): not yet in TypeScript's DOM lib. */
interface FileHandleLike {
  getFile(): Promise<File>;
}
interface DataTransferItemWithHandle extends DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileHandleLike | null>;
}

const FILE_POLL_MS = 500;

/** Built-in sample (the validator test fixture) so the page renders on load. */
const SAMPLE_TEMPLATE: Template = {
  id: 'tmpl-test-80a',
  nameKey: 'template.test80a.name',
  sizeBand: '80-100',
  declaredAreaM2: 80,
  declaredBedrooms: 2,
  floorConfig: 'single',
  floors: [
    {
      id: 'ground',
      level: 'ground',
      footprint: [
        { x: 0, y: 0 },
        { x: 960, y: 0 },
        { x: 960, y: 840 },
        { x: 0, y: 840 },
      ],
      rooms: [
        {
          id: 'living',
          labelKey: 'room.living',
          type: 'living',
          polygon: [
            { x: 0, y: 0 },
            { x: 600, y: 0 },
            { x: 600, y: 480 },
            { x: 0, y: 480 },
          ],
        },
        {
          id: 'kitchen',
          labelKey: 'room.kitchen',
          type: 'kitchen',
          polygon: [
            { x: 600, y: 0 },
            { x: 960, y: 0 },
            { x: 960, y: 480 },
            { x: 600, y: 480 },
          ],
        },
        {
          id: 'bedroom-1',
          labelKey: 'room.bedroom',
          type: 'bedroom',
          polygon: [
            { x: 0, y: 480 },
            { x: 360, y: 480 },
            { x: 360, y: 840 },
            { x: 0, y: 840 },
          ],
        },
        {
          id: 'bedroom-2',
          labelKey: 'room.bedroom',
          type: 'bedroom',
          polygon: [
            { x: 360, y: 480 },
            { x: 660, y: 480 },
            { x: 660, y: 840 },
            { x: 360, y: 840 },
          ],
        },
        {
          id: 'bathroom',
          labelKey: 'room.bathroom',
          type: 'bathroom',
          polygon: [
            { x: 660, y: 480 },
            { x: 780, y: 480 },
            { x: 780, y: 840 },
            { x: 660, y: 840 },
          ],
        },
        {
          id: 'hall',
          labelKey: 'room.hall',
          type: 'hall',
          polygon: [
            { x: 780, y: 480 },
            { x: 960, y: 480 },
            { x: 960, y: 840 },
            { x: 780, y: 840 },
          ],
        },
      ],
      walls: [
        { id: 'w-south', from: { x: 0, y: 0 }, to: { x: 960, y: 0 }, kind: 'exterior' },
        { id: 'w-east', from: { x: 960, y: 0 }, to: { x: 960, y: 840 }, kind: 'exterior' },
        { id: 'w-north', from: { x: 960, y: 840 }, to: { x: 0, y: 840 }, kind: 'exterior' },
        { id: 'w-west', from: { x: 0, y: 840 }, to: { x: 0, y: 0 }, kind: 'exterior' },
        { id: 'w-int-kitchen', from: { x: 600, y: 0 }, to: { x: 600, y: 480 }, kind: 'interior' },
        { id: 'w-int-mid', from: { x: 0, y: 480 }, to: { x: 960, y: 480 }, kind: 'interior' },
      ],
      openings: [
        { id: 'door-entrance', kind: 'door', wallId: 'w-south', offsetCm: 450, widthCm: 100 },
        { id: 'door-bed1', kind: 'door', wallId: 'w-int-mid', offsetCm: 100, widthCm: 90 },
        { id: 'win-living', kind: 'window', wallId: 'w-west', offsetCm: 200, widthCm: 150 },
      ],
    },
  ],
};

const dropzone = document.getElementById('dropzone')!;
const sourceName = document.getElementById('source-name')!;
const previewEl = document.getElementById('preview')!;
const validationEl = document.getElementById('validation')!;
const langToggle = document.getElementById('lang-toggle')!;
const themeToggle = document.getElementById('theme-toggle')!;
const scaleInput = document.getElementById('scale') as HTMLInputElement;
const scaleValue = document.getElementById('scale-value')!;

const state: { json: string; options: Required<Pick<RenderOptions, 'lang' | 'theme' | 'scale'>> } = {
  json: JSON.stringify(SAMPLE_TEMPLATE),
  options: { lang: 'sq', theme: 'wood', scale: 50 },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render(): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(state.json);
  } catch (err) {
    validationEl.innerHTML = `<span class="parse-error">✗ Not valid JSON: ${escapeHtml(
      err instanceof Error ? err.message : String(err),
    )}</span>`;
    return;
  }

  const result = validateTemplate(parsed);
  if (result.violations.length === 0) {
    validationEl.innerHTML = '<span class="ok">✓ valid</span>';
  } else {
    const items = result.violations
      .map(
        (v) =>
          `<li class="${v.severity}">[${v.severity}] ${escapeHtml(v.code)} at ${escapeHtml(
            v.path || '(template)',
          )}: ${escapeHtml(v.message)}</li>`,
      )
      .join('');
    const headline = result.ok
      ? '<span class="ok">✓ valid (soft violations below)</span>'
      : `<span class="parse-error">✗ ${result.violations.filter((v) => v.severity === 'hard').length} hard violation(s)</span>`;
    validationEl.innerHTML = `${headline}<ul>${items}</ul>`;
  }

  // Hard-invalid templates keep the last good drawing; errors are shown above.
  if (result.ok) {
    previewEl.innerHTML = renderTemplate(parsed as Template, state.options);
  }
}

/* ----- file loading + hot reload ----------------------------------------- */

let pollTimer: number | undefined;
let lastModified = 0;

function loadText(text: string, name: string): void {
  state.json = text;
  sourceName.textContent = name;
  render();
}

function watchHandle(handle: FileHandleLike, name: string): void {
  if (pollTimer !== undefined) clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    try {
      const file = await handle.getFile();
      if (file.lastModified !== lastModified) {
        lastModified = file.lastModified;
        loadText(await file.text(), `${name} (watching)`);
      }
    } catch {
      // File moved/deleted: stop watching, keep the last render.
      clearInterval(pollTimer);
      pollTimer = undefined;
      sourceName.textContent = `${name} (watch lost)`;
    }
  }, FILE_POLL_MS);
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const item = e.dataTransfer?.items[0] as DataTransferItemWithHandle | undefined;
  if (!item) return;

  if (item.getAsFileSystemHandle) {
    const handle = await item.getAsFileSystemHandle();
    if (handle) {
      const file = await handle.getFile();
      lastModified = file.lastModified;
      loadText(await file.text(), file.name);
      watchHandle(handle, file.name);
      return;
    }
  }
  const file = item.getAsFile();
  if (file) loadText(await file.text(), file.name);
});

/* ----- controls ----------------------------------------------------------- */

function wireToggle(container: HTMLElement, apply: (button: HTMLButtonElement) => void): void {
  container.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    if (!button) return;
    container.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    apply(button);
    render();
  });
}

wireToggle(langToggle, (b) => {
  state.options.lang = b.dataset.lang as 'sq' | 'en';
});
wireToggle(themeToggle, (b) => {
  state.options.theme = b.dataset.theme as 'wood' | 'mono';
});
scaleInput.addEventListener('input', () => {
  state.options.scale = Number(scaleInput.value);
  scaleValue.textContent = scaleInput.value;
  render();
});

render();
