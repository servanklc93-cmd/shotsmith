import { type Job, exportZip, plan } from '../export';
import { type Issue, lint } from '../lint';
import {
  type Align, type Background, type DeviceClass, FONTS, type Frame, type Layout, PRESETS, type Project, SWATCHES,
  captionFor, imageFor, imageKey, isHex, newId, newProject, newSlide, normalizeHex,
} from '../project';
import { type ImageSource, deviceClass, measureWith, renderSlide } from '../render';
import { sampleProject } from '../samples';
import { LOCALES, TARGETS, locale, target } from '../specs';
import { collectGarbage, images as imageStore, loadProject, packProject, saveProject, unpackProject } from '../storage';

// --- state ---------------------------------------------------------------------------

let project: Project = newProject();
const images = new Map<string, ImageSource>();
const blobs = new Map<string, Blob>();
let lang = 'en';
let current = 0;
let previewTarget = 'iphone-6.9';
let tab: 'slide' | 'style' | 'checks' = 'slide';
let issues: Issue[] = [];

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== false) el.append(c);
  return el;
}

function slide() {
  return project.slides[current];
}

// --- undo -----------------------------------------------------------------------------------

const undoStack: string[] = [];
const redoStack: string[] = [];
let lastSnapshot = '';        // the project as of the last change
let lastChangeAt = 0;

function restore(from: string[], to: string[]) {
  const snap = from.pop();
  if (!snap) return;
  to.push(JSON.stringify(project));
  project = JSON.parse(snap);
  lastSnapshot = snap;
  lastChangeAt = 0;           // the next edit always starts a new undo step
  current = Math.min(current, Math.max(0, project.slides.length - 1));
  if (!project.languages.includes(lang)) lang = project.languages[0];
  saveProject(project);
  renderAll();
}

// --- persistence -------------------------------------------------------------------------

let saveTimer = 0;
function changed(structure = false) {
  // the state before this change is what undo goes back to. a burst of small
  // edits (typing a caption, dragging a slider) becomes a single undo step
  const now = Date.now();
  const burst = !structure && now - lastChangeAt < 800;
  lastChangeAt = now;
  if (!burst && lastSnapshot) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > 200) undoStack.shift();
  }
  redoStack.length = 0;
  lastSnapshot = JSON.stringify(project);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveProject(project), 300);
  drawPreview();
  drawThumbs();
  refreshIssues();
  if (structure) renderAll();
}

async function addImage(blob: Blob, id = newId('img')): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  images.set(id, { width: bitmap.width, height: bitmap.height, source: bitmap });
  blobs.set(id, blob);
  await imageStore.put(id, blob).catch(() => undefined);
  return id;
}

async function loadImages(ids: Iterable<string>) {
  for (const id of ids) {
    if (images.has(id)) continue;
    const blob = blobs.get(id) ?? await imageStore.get(id).catch(() => undefined);
    if (!blob) continue;
    try {
      await addImage(blob, id);
    } catch {
      // a corrupt blob: the slide just shows the empty screen
    }
  }
}

async function useProject(p: Project, withBlobs?: Map<string, Blob>) {
  project = p;
  images.clear();
  blobs.clear();
  for (const [id, b] of withBlobs ?? []) blobs.set(id, b);
  await loadImages(new Set(p.slides.flatMap((s) => Object.values(s.images))));
  lang = p.languages[0];
  current = 0;
  previewTarget = p.targets.find((t) => target(t).store === 'apple') ?? p.targets[0] ?? 'iphone-6.9';
  saveProject(p);
  // a different project: old undo steps don't apply, and its images can go
  undoStack.length = redoStack.length = 0;
  lastSnapshot = JSON.stringify(p);
  collectGarbage(p).catch(() => undefined);
  renderAll();
}

// --- drawing ---------------------------------------------------------------------------------

function draw(canvas: HTMLCanvasElement, targetId: string, index: number, maxWidth: number) {
  const t = target(targetId);
  const s = project.slides[index];
  const scale = Math.min(1, maxWidth / t.width);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(t.width * scale * dpr);
  canvas.height = Math.round(t.height * scale * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  if (s) renderSlide(ctx, { project, slide: s, lang, target: t, images });
}

function drawPreview() {
  const canvas = $<HTMLCanvasElement>('#preview');
  const wrap = $('#canvas-wrap');
  const t = target(previewTarget);
  if (!project.slides.length) {
    canvas.width = canvas.height = 0;
    return;
  }
  const box = wrap.getBoundingClientRect();
  const fit = Math.min((box.width - 48) / t.width, (box.height - 48) / t.height);
  draw(canvas, previewTarget, current, t.width * fit);
  canvas.style.width = `${t.width * fit}px`;
  canvas.style.height = `${t.height * fit}px`;
  $('#preview-size').textContent = `${t.width} × ${t.height}`;
}

function drawThumbs() {
  document.querySelectorAll<HTMLCanvasElement>('#slide-list canvas').forEach((c, i) => {
    draw(c, previewTarget, i, 150);
    c.style.width = '100%';
    c.style.height = 'auto';
  });
}

// --- top bar -------------------------------------------------------------------------------

function renderLanguages() {
  const box = $('#languages');
  box.replaceChildren();
  project.languages.forEach((code, i) => {
    const chip = h('span', { class: `lang${code === lang ? ' active' : ''}` },
      h('span', { onclick: () => { lang = code; renderAll(); } }, locale(code).name + (i === 0 ? ' ★' : '')),
      project.languages.length > 1 ? h('button', {
        class: 'x', title: 'Remove language',
        onclick: (e: Event) => {
          e.stopPropagation();
          if (!confirm(`Remove ${locale(code).name}? Its captions will be deleted.`)) return;
          project.languages = project.languages.filter((c) => c !== code);
          for (const s of project.slides) {
            delete s.captions[code];
            delete s.images[code];
          }
          if (lang === code) lang = project.languages[0];
          changed(true);
        },
      }, '×') : null);
    chip.title = i === 0 ? 'Default language: others fall back to it' : 'Click to edit captions in this language';
    box.append(chip);
  });
  const add = h('select', { class: 'add-lang', 'aria-label': 'Add a language' },
    h('option', { value: '' }, '+ language'),
    ...LOCALES.filter((l) => !project.languages.includes(l.code)).map((l) => h('option', { value: l.code }, l.name)));
  add.addEventListener('change', () => {
    if (!add.value) return;
    project.languages.push(add.value);
    lang = add.value;
    changed(true);
  });
  box.append(add);
}

// --- slide list ----------------------------------------------------------------------------

function renderSlideList() {
  const list = $('#slide-list');
  list.replaceChildren(...project.slides.map((s, i) => {
    const move = (d: number) => (e: Event) => {
      e.stopPropagation();
      const j = i + d;
      if (j < 0 || j >= project.slides.length) return;
      [project.slides[i], project.slides[j]] = [project.slides[j], project.slides[i]];
      current = j;
      changed(true);
    };
    return h('li', { class: `slide-item${i === current ? ' active' : ''}`, onclick: () => { current = i; renderAll(); } },
      h('span', { class: 'num' }, String(i + 1)),
      h('canvas'),
      h('div', { class: 'slide-tools' },
        h('button', { title: 'Move up', onclick: move(-1) }, '↑'),
        h('button', { title: 'Move down', onclick: move(1) }, '↓'),
        h('button', { title: 'Duplicate', onclick: (e: Event) => {
          e.stopPropagation();
          project.slides.splice(i + 1, 0, { ...structuredClone(s), id: newId() });
          current = i + 1;
          changed(true);
        } }, '⧉'),
        h('button', { title: 'Delete', onclick: (e: Event) => {
          e.stopPropagation();
          project.slides.splice(i, 1);
          current = Math.max(0, Math.min(current, project.slides.length - 1));
          changed(true);
        } }, '✕')));
  }));
  drawThumbs();
}

// a screenshot wider than 3:5 is a tablet one (iPad is 3:4, phones are ~9:19.5)
const isTabletShaped = (img: { width: number; height: number }) =>
  Math.min(img.width, img.height) / Math.max(img.width, img.height) > 0.6;

async function addScreenshots(files: File[]) {
  const pics = files.filter((f) => f.type.startsWith('image/'));
  if (!pics.length) return;
  let phones = 0;
  let tablets = 0;
  for (const f of pics) {
    const id = await addImage(f);
    const img = images.get(id)!;
    if (isTabletShaped(img)) {
      // give it to the first slide that has no tablet screenshot yet
      const free = project.slides.find((sl) => !sl.images['tablet:*']);
      if (free) {
        free.images['tablet:*'] = id;
      } else {
        const sl = newSlide(project.languages[0], 'Your headline here', 'A short line about this screen');
        sl.images['tablet:*'] = id;
        project.slides.push(sl);
      }
      tablets++;
      continue;
    }
    const free = project.slides.find((sl) => !sl.images['*'] && !sl.images[project.languages[0]]);
    if (free) {
      free.images['*'] = id;
    } else {
      const sl = newSlide(project.languages[0], 'Your headline here', 'A short line about this screen');
      sl.images['*'] = id;
      project.slides.push(sl);
      current = project.slides.length - 1;
    }
    phones++;
  }
  const parts = [phones && `${phones} phone`, tablets && `${tablets} tablet`].filter(Boolean).join(' and ');
  toast(`Added ${parts} screenshot${phones + tablets > 1 ? 's' : ''}`);
  changed(true);
}

// --- right panel -----------------------------------------------------------------------------

function field(label: string, control: Node) {
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

function segmented<T extends string>(options: [T, string][], value: T, onPick: (v: T) => void) {
  return h('div', { class: 'segmented' }, ...options.map(([v, label]) =>
    h('button', { class: v === value ? 'active' : '', type: 'button', onclick: () => onPick(v) }, label)));
}

function colorField(label: string, value: string, onChange: (v: string) => void, swatches = SWATCHES): HTMLElement {
  // a native picker, a hex box and quick swatches, all kept in sync
  const picker = h('input', { type: 'color', value: normalizeHex(value), 'aria-label': `${label} picker` });
  const hex = h('input', { type: 'text', class: 'hex', value: normalizeHex(value), maxLength: 7, spellcheck: false, 'aria-label': `${label} hex` });
  const set = (v: string, from?: HTMLElement) => {
    const n = normalizeHex(v);
    if (!/^#[0-9a-f]{6}$/.test(n)) return;
    if (from !== picker) picker.value = n;
    if (from !== hex) hex.value = n;
    onChange(n);
  };
  picker.addEventListener('input', () => set(picker.value, picker));
  hex.addEventListener('input', () => {
    const v = hex.value.startsWith('#') ? hex.value : '#' + hex.value;
    hex.classList.toggle('invalid', !isHex(v));
    if (isHex(v)) set(v, hex);
  });
  hex.addEventListener('blur', () => { hex.value = picker.value; hex.classList.remove('invalid'); });
  return h('div', { class: 'field' }, h('span', {}, label),
    h('div', { class: 'color-row' }, picker, hex),
    h('div', { class: 'swatches' }, ...swatches.map((c) => h('button', {
      type: 'button', class: 'swatch', title: c, style: `background:${c}`, onclick: () => set(c),
    }))));
}

function screenshotZone(s: Project['slides'][number], cls: DeviceClass): Node {
  const isDefault = lang === project.languages[0];
  const own = !isDefault && !!s.images[imageKey(cls, lang)];
  const has = !!imageFor(project, s, lang, cls);
  const id = imageFor(project, s, lang, cls);
  const info = id ? images.get(id) : undefined;
  const ownBox = h('input', { type: 'checkbox', checked: own });
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const newIdValue = await addImage(f);
    s.images[imageKey(cls, !isDefault && ownBox.checked ? lang : '*')] = newIdValue;
    changed(true);
  });
  ownBox.addEventListener('change', () => {
    if (!ownBox.checked) {
      delete s.images[imageKey(cls, lang)];
      changed(true);
    }
  });
  const label = cls === 'phone' ? 'Phone screenshot' : 'Tablet screenshot (iPad sizes)';
  return h('div', { class: 'field' },
    h('span', {}, label),
    h('label', { class: `drop-zone${has ? '' : ' empty'}` },
      has ? `Replace…${info ? `  (${info.width}×${info.height})` : ''}` : cls === 'phone' ? 'Choose a screenshot…' : 'Choose an iPad screenshot…',
      input),
    !isDefault ? h('label', { class: 'check' }, ownBox, `Different one for ${locale(lang).name}`) : null,
    has && cls === 'tablet' ? h('button', { type: 'button', class: 'link', onclick: () => { delete s.images['tablet:*']; changed(true); } }, 'Remove tablet screenshot') : null);
}

function slidePanel(): Node[] {
  const s = slide();
  if (!s) return [h('p', { class: 'muted' }, 'Add a screenshot to start: use the button on the left, or drop images on the page.')];
  const cap = s.captions[lang] ?? { title: '', subtitle: '' };
  const fallback = captionFor(project, s, lang);
  const setCaption = (key: 'title' | 'subtitle') => (e: Event) => {
    s.captions[lang] = { ...(s.captions[lang] ?? { title: '', subtitle: '' }), [key]: (e.target as HTMLTextAreaElement).value };
    changed();
  };
  const custom = !!(s.background || s.textColor || s.subtitleColor);

  return [
    field(`Title (${locale(lang).name})`, h('textarea', { rows: 2, value: cap.title, placeholder: fallback.title, oninput: setCaption('title') })),
    field('Subtitle', h('textarea', { rows: 2, value: cap.subtitle, placeholder: fallback.subtitle, oninput: setCaption('subtitle') })),
    field('Layout', segmented<Layout>([['caption-top', 'Top'], ['caption-bottom', 'Bottom'], ['tilted', 'Tilted'], ['plain', 'Plain']], s.layout,
      (v) => { s.layout = v; changed(true); })),
    screenshotZone(s, 'phone'),
    screenshotZone(s, 'tablet'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: custom, onchange: (e: Event) => {
        if ((e.target as HTMLInputElement).checked) {
          s.background = structuredClone(project.style.background);
          s.textColor = project.style.textColor;
          s.subtitleColor = project.style.subtitleColor;
        } else {
          s.background = s.textColor = s.subtitleColor = undefined;
        }
        changed(true);
      } }),
      'Own colours for this slide'),
    ...(custom ? [
      backgroundControls(s.background ??= structuredClone(project.style.background), () => changed()),
      colorField('Title colour', s.textColor ?? project.style.textColor, (v) => { s.textColor = v; changed(); }),
      colorField('Subtitle colour', s.subtitleColor ?? project.style.subtitleColor, (v) => { s.subtitleColor = v; changed(); }),
    ] : []),
  ];
}

function backgroundControls(bg: Background, onChange: () => void): Node {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    bg.image = await addImage(f);
    bg.kind = 'image';
    onChange();
    renderPanel();
  });
  return h('div', { class: 'group' },
    h('div', { class: 'group-title' }, 'Background'),
    segmented([['solid', 'Solid'], ['linear', 'Gradient'], ['radial', 'Radial'], ['image', 'Image']], bg.kind,
      (v) => { bg.kind = v as Background['kind']; onChange(); renderPanel(); }),
    bg.kind === 'image'
      ? h('div', { class: 'field' },
        h('label', { class: 'drop-zone' }, bg.image ? 'Replace background image…' : 'Choose a background image…', input),
        h('span', {}, 'Darken'),
        h('input', { type: 'range', min: 0, max: 0.8, step: 0.01, value: bg.dim ?? 0,
          oninput: (e: Event) => { bg.dim = Number((e.target as HTMLInputElement).value); onChange(); } }))
      : null,
    colorField(bg.kind === 'solid' || bg.kind === 'image' ? 'Colour' : 'From', bg.colors[0], (v) => { bg.colors[0] = v; onChange(); }),
    bg.kind === 'linear' || bg.kind === 'radial'
      ? colorField('To', bg.colors[1], (v) => { bg.colors[1] = v; onChange(); }) : null,
    bg.kind === 'linear'
      ? field('Angle', h('input', { type: 'range', min: 0, max: 360, value: bg.angle,
        oninput: (e: Event) => { bg.angle = Number((e.target as HTMLInputElement).value); onChange(); } })) : null);
}

function stylePanel(): Node[] {
  const st = project.style;
  const range = (label: string, key: 'titleSize' | 'subtitleSize' | 'deviceScale' | 'shadow' | 'tilt', min: number, max: number, step: number) =>
    field(label, h('input', { type: 'range', min, max, step, value: st[key],
      oninput: (e: Event) => { st[key] = Number((e.target as HTMLInputElement).value); changed(); } }));
  const fontKnown = FONTS.some((f) => f.css === st.font);
  const customFont = h('input', { type: 'text', placeholder: 'or type any installed font, e.g. Avenir Next',
    value: fontKnown ? '' : st.font, spellcheck: false });
  customFont.addEventListener('input', () => {
    if (customFont.value.trim()) st.font = `"${customFont.value.trim().replace(/"/g, '')}", ${FONTS[0].css}`;
    changed();
  });

  return [
    h('div', { class: 'field' }, h('span', {}, 'Presets'),
      h('div', { class: 'presets' }, ...PRESETS.map((p) => {
        const bg = p.style.background!;
        const css = bg.kind === 'solid' ? bg.colors[0] : bg.kind === 'linear'
          ? `linear-gradient(${bg.angle}deg, ${bg.colors[0]}, ${bg.colors[1]})` : `radial-gradient(${bg.colors[0]}, ${bg.colors[1]})`;
        return h('button', { class: 'preset', type: 'button', style: `background:${css};color:${p.style.textColor}`,
          onclick: () => { Object.assign(st, structuredClone(p.style)); changed(true); } }, p.name);
      }))),
    backgroundControls(st.background, () => changed()),
    h('div', { class: 'group' },
      h('div', { class: 'group-title' }, 'Text'),
      colorField('Title colour', st.textColor, (v) => { st.textColor = v; changed(); }),
      colorField('Subtitle colour', st.subtitleColor, (v) => { st.subtitleColor = v; changed(); }),
      field('Font', h('select', { onchange: (e: Event) => { st.font = (e.target as HTMLSelectElement).value; customFont.value = ''; changed(); } },
        ...FONTS.map((f) => h('option', { value: f.css, selected: f.css === st.font }, f.name)),
        !fontKnown ? h('option', { value: st.font, selected: true }, 'Custom') : null)),
      customFont,
      h('div', { class: 'row' },
        field('Weight', h('select', { onchange: (e: Event) => { st.titleWeight = Number((e.target as HTMLSelectElement).value); changed(); } },
          ...[400, 500, 600, 700, 800, 900].map((w) => h('option', { value: w, selected: w === st.titleWeight }, String(w))))),
        field('Align', segmented<Align>([['left', '⟸'], ['center', '≡'], ['right', '⟹']], st.align, (v) => { st.align = v; changed(true); }))),
      range('Title size', 'titleSize', 0.05, 0.12, 0.002),
      range('Subtitle size', 'subtitleSize', 0.025, 0.07, 0.001)),
    h('div', { class: 'group' },
      h('div', { class: 'group-title' }, 'Device'),
      field('Frame', segmented<Frame>([['auto', 'Auto'], ['iphone', 'iPhone'], ['ipad', 'iPad'], ['android', 'Android'], ['none', 'None']], st.frame,
        (v) => { st.frame = v; changed(true); })),
      colorField('Frame colour', st.frameColor, (v) => { st.frameColor = v; changed(); },
        ['#16171a', '#3a3c42', '#d9dade', '#f5f5f7', '#e6d3b3', '#c9a77c', '#2c3e57', '#8fa9c7', '#4d3b5c', '#f4c2c2', '#1f4d3a', '#b22222']),
      range('Size', 'deviceScale', 0.55, 0.95, 0.01),
      range('Shadow', 'shadow', 0, 1, 0.05),
      range('Tilt (tilted layout)', 'tilt', -20, 20, 1)),
  ];
}

function checksPanel(): Node[] {
  if (!issues.length) return [h('p', { class: 'ok' }, '✓ Ready for both stores. No problems found.')];
  return issues.map((x) => h('div', {
    class: `issue ${x.level}`, 'data-slide': x.slide,
    onclick: () => { if (x.slide) { current = x.slide - 1; tab = 'slide'; renderAll(); } },
  },
  h('span', { class: 'icon' }, x.level === 'error' ? '●' : '▲'),
  h('div', {}, x.message, h('div', { class: 'where' },
    [x.slide && `slide ${x.slide}`, x.target && target(x.target).label, x.lang && locale(x.lang).name].filter(Boolean).join(' · ')))));
}

function renderPanel() {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#panel-body').replaceChildren(...(tab === 'slide' ? slidePanel() : tab === 'style' ? stylePanel() : checksPanel()));
}

function refreshIssues() {
  const ctx = document.createElement('canvas').getContext('2d')!;
  issues = lint(project, images, measureWith(ctx, project.style.font, project.style.titleWeight));
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  const b = $('#checks-button');
  b.textContent = errors ? `● ${errors} to fix` : warnings ? `▲ ${warnings} to check` : '✓ Store-ready';
  b.className = `ghost${errors ? ' has-errors' : warnings ? ' has-warnings' : ''}`;
  if (tab === 'checks') renderPanel();
}

function renderAll() {
  $<HTMLInputElement>('#project-name').value = project.name;
  const select = $<HTMLSelectElement>('#preview-target');
  select.replaceChildren(...TARGETS.map((t) => h('option', { value: t.id, selected: t.id === previewTarget }, t.label)));
  renderLanguages();
  renderSlideList();
  renderPanel();
  refreshIssues();
  drawPreview();
}

// --- export ---------------------------------------------------------------------------------

function openExport() {
  const dialog = $<HTMLDialogElement>('#export-dialog');
  const box = $('#export-targets');
  box.replaceChildren(...TARGETS.map((t) => h('label', {},
    h('input', { type: 'checkbox', name: 'target', value: t.id, checked: project.targets.includes(t.id), onchange: summary }),
    h('div', {}, t.label, t.required ? h('span', { class: 'badge' }, 'required') : null,
      h('small', {}, `${t.width} × ${t.height}${t.note ? ' · ' + t.note : ''}`)))));
  $('#export-langs').replaceChildren(...project.languages.map((code) => h('label', {},
    h('input', { type: 'checkbox', name: 'lang', value: code, checked: true, onchange: summary }), locale(code).name)));
  $<HTMLProgressElement>('#export-progress').hidden = true;
  summary();
  dialog.showModal();
}

function chosenJobs(): Job[] {
  const form = $<HTMLFormElement>('#export-form');
  const targets = [...form.querySelectorAll<HTMLInputElement>('input[name=target]:checked')].map((i) => i.value);
  const langs = [...form.querySelectorAll<HTMLInputElement>('input[name=lang]:checked')].map((i) => i.value);
  return plan(project, targets, langs);
}

function summary() {
  const n = chosenJobs().length;
  $('#export-summary').textContent = n ? `${n} image${n > 1 ? 's' : ''} will be rendered.` : 'Pick at least one size and one language.';
  $<HTMLButtonElement>('#export-go').disabled = n === 0;
}

async function runExport(e: Event) {
  e.preventDefault();
  const jobs = chosenJobs();
  if (!jobs.length) return;
  const progress = $<HTMLProgressElement>('#export-progress');
  const go = $<HTMLButtonElement>('#export-go');
  progress.hidden = false;
  go.disabled = true;
  project.targets = [...new Set(jobs.map((j) => j.target.id))];
  saveProject(project);
  try {
    const data = await exportZip(project, images, jobs, (done, total) => {
      progress.value = done / total;
      go.textContent = `Rendering ${done}/${total}…`;
    });
    download(data, `${slug(project.name)}-screenshots.zip`);
    $<HTMLDialogElement>('#export-dialog').close();
    toast(`Exported ${jobs.length} images`);
  } catch (err) {
    toast(`Export failed: ${(err as Error).message}`);
  } finally {
    go.disabled = false;
    go.textContent = 'Download zip';
  }
}

function slug(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shotsmith';
}

function download(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let toastTimer = 0;
function toast(text: string) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2600);
}

// --- wiring ---------------------------------------------------------------------------------

function wire() {
  $<HTMLInputElement>('#project-name').addEventListener('input', (e) => {
    project.name = (e.target as HTMLInputElement).value;
    changed();
  });
  $<HTMLSelectElement>('#preview-target').addEventListener('change', (e) => {
    previewTarget = (e.target as HTMLSelectElement).value;
    drawPreview();
    drawThumbs();
  });
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
    b.addEventListener('click', () => { tab = b.dataset.tab as typeof tab; renderPanel(); }));
  $('#checks-button').addEventListener('click', () => { tab = 'checks'; renderPanel(); });
  $('#export-button').addEventListener('click', openExport);
  $('#export-form').addEventListener('submit', (e) => {
    if ((e as SubmitEvent).submitter?.getAttribute('value') === 'cancel') return;
    runExport(e);
  });
  $<HTMLInputElement>('#add-files').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    addScreenshots([...(input.files ?? [])]);
    input.value = '';
  });

  // file menu
  const menu = $('#file-menu');
  $('#file-button').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => (menu.hidden = true));
  menu.addEventListener('click', async (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (action === 'new' && confirm('Start a new, empty project? The current one is replaced.')) await useProject(newProject());
    if (action === 'demo') {
      const { project: p, blobs: b } = await sampleProject();
      await useProject(p, b);
    }
    if (action === 'save') {
      download(await packProject(project, async (id) => blobs.get(id) ?? imageStore.get(id)), `${slug(project.name)}.shotsmith`);
    }
  });
  $<HTMLInputElement>('#open-file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { project: p, blobs: b } = unpackProject(new Uint8Array(await f.arrayBuffer()));
      for (const [id, blob] of b) await imageStore.put(id, blob).catch(() => undefined);
      await useProject(p, b);
      toast(`Opened ${p.name}`);
    } catch (err) {
      toast(`Couldn't open that file: ${(err as Error).message}`);
    }
  });

  // drag and drop anywhere
  const overlay = $('#drop-overlay');
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; overlay.hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    addScreenshots([...(e.dataTransfer?.files ?? [])]);
  });

  // paste a screenshot from the clipboard
  window.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) addScreenshots(files);
  });

  window.addEventListener('keydown', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !el?.closest('input, textarea')) {
      e.preventDefault();
      if (e.shiftKey) restore(redoStack, undoStack);
      else restore(undoStack, redoStack);
      return;
    }
    if (el?.closest('input, textarea, select')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') current = Math.min(current + 1, project.slides.length - 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') current = Math.max(current - 1, 0);
    else return;
    e.preventDefault();
    renderAll();
  });

  new ResizeObserver(() => drawPreview()).observe($('#canvas-wrap'));
}

async function start() {
  wire();
  const saved = loadProject();
  if (saved && saved.slides.length) {
    await useProject(saved);
  } else {
    const { project: p, blobs: b } = await sampleProject();
    await useProject(p, b);
  }
}

start();
