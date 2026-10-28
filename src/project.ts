// The document model. Everything a project is, as plain JSON (images are
// referenced by id and stored separately, see storage.ts).

export type Layout = 'caption-top' | 'caption-bottom' | 'tilted' | 'plain';
export type Frame = 'auto' | 'iphone' | 'ipad' | 'android' | 'none';
export type Align = 'left' | 'center' | 'right';

export interface Background {
  kind: 'solid' | 'linear' | 'radial' | 'image';
  colors: [string, string];
  angle: number;            // degrees, for linear
  image?: string;           // image id, for kind 'image'
  dim?: number;             // 0..1 darkening over a background image
}

export interface Style {
  background: Background;
  textColor: string;        // title
  subtitleColor: string;
  font: string;
  titleSize: number;        // fraction of the canvas width
  subtitleSize: number;
  titleWeight: number;
  align: Align;
  frame: Frame;
  frameColor: string;       // any hex colour
  deviceScale: number;      // device width as a fraction of the canvas width
  shadow: number;           // 0 = none, 1 = strong
  tilt: number;             // degrees, for the tilted layout
}

export interface Caption {
  title: string;
  subtitle: string;
}

export type DeviceClass = 'phone' | 'tablet';

export interface Slide {
  id: string;
  layout: Layout;
  captions: Record<string, Caption>;     // by language code
  // image ids: '*' (phone, every language), '<lang>' (phone, one language),
  // 'tablet:*' and 'tablet:<lang>' for iPad / Android tablet sizes
  images: Record<string, string>;
  background?: Background;               // overrides for this slide
  textColor?: string;
  subtitleColor?: string;
}

export interface Project {
  version: 1;
  name: string;
  languages: string[];                   // first one is the default
  targets: string[];
  style: Style;
  slides: Slide[];
}

export const FONTS = [
  { name: 'System', css: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' },
  { name: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif' },
  { name: 'Serif', css: '"New York", ui-serif, Georgia, "Times New Roman", serif' },
  { name: 'Mono', css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { name: 'Condensed', css: '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif-condensed, sans-serif' },
];

// every preset keeps its text at 4.5:1 or better against both background
// colours (tests/colors.test.ts checks this), so captions stay readable
export const PRESETS: { name: string; style: Partial<Style> }[] = [
  { name: 'Midnight', style: { background: { kind: 'linear', colors: ['#1b1f3b', '#3a2d6b'], angle: 160 }, textColor: '#ffffff', subtitleColor: '#d6d9f5', frameColor: '#16171a' } },
  { name: 'Sunset', style: { background: { kind: 'linear', colors: ['#c2410c', '#9d174d'], angle: 150 }, textColor: '#ffffff', subtitleColor: '#ffe4d6', frameColor: '#d9dade' } },
  { name: 'Mint', style: { background: { kind: 'linear', colors: ['#dcf7e7', '#a7e3c6'], angle: 170 }, textColor: '#0b3b2c', subtitleColor: '#14523f', frameColor: '#16171a' } },
  { name: 'Paper', style: { background: { kind: 'solid', colors: ['#f4f1ea', '#f4f1ea'], angle: 0 }, textColor: '#1c1b19', subtitleColor: '#4a4741', frameColor: '#16171a' } },
  { name: 'Ocean', style: { background: { kind: 'radial', colors: ['#1d6fb8', '#0b2f6b'], angle: 0 }, textColor: '#ffffff', subtitleColor: '#d4e6ff', frameColor: '#2c3e57' } },
  { name: 'Mono', style: { background: { kind: 'solid', colors: ['#0d0d0d', '#0d0d0d'], angle: 0 }, textColor: '#f2f2f2', subtitleColor: '#b8b8b8', frameColor: '#d9dade' } },
  { name: 'Lemon', style: { background: { kind: 'linear', colors: ['#fff6bf', '#ffe066'], angle: 165 }, textColor: '#2b2400', subtitleColor: '#5c4d00', frameColor: '#16171a' } },
  { name: 'Grape', style: { background: { kind: 'linear', colors: ['#5b21b6', '#86198f'], angle: 140 }, textColor: '#ffffff', subtitleColor: '#f1dcff', frameColor: '#e6d3b3' } },
  { name: 'Forest', style: { background: { kind: 'radial', colors: ['#166534', '#052e16'], angle: 0 }, textColor: '#f0fdf4', subtitleColor: '#bbf7d0', frameColor: '#16171a' } },
];

// quick picks in every colour field
export const SWATCHES = [
  '#ffffff', '#f4f1ea', '#d9dade', '#8a8f9c', '#16171a', '#000000',
  '#e11d48', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899',
];

export function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

/** #abc -> #aabbcc, lowercase. Anything else comes back unchanged. */
export function normalizeHex(v: string): string {
  const t = v.trim().toLowerCase();
  const short = t.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = t.match(/^#?([0-9a-f]{6})$/);
  return long ? `#${long[1]}` : v;
}

/** Mix a colour with white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const h = normalizeHex(hex);
  if (!/^#[0-9a-f]{6}$/.test(h)) return hex;
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const parts = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16);
    return Math.round(c + (target - c) * k).toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

export function defaultStyle(): Style {
  return {
    background: { kind: 'linear', colors: ['#1b1f3b', '#3a2d6b'], angle: 160 },
    textColor: '#ffffff',
    subtitleColor: '#d6d9f5',
    font: FONTS[0].css,
    titleSize: 0.082,
    subtitleSize: 0.042,
    titleWeight: 800,
    align: 'center',
    frame: 'auto',
    frameColor: '#16171a',
    deviceScale: 0.78,
    shadow: 0.6,
    tilt: -8,
  };
}

let counter = 0;
export function newId(prefix = 's'): string {
  counter++;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newProject(): Project {
  return {
    version: 1,
    name: 'My app',
    languages: ['en'],
    targets: ['iphone-6.9', 'iphone-6.3', 'play-phone'],
    style: defaultStyle(),
    slides: [],
  };
}

export function newSlide(lang: string, title = 'A headline that sells', subtitle = 'One line that explains it'): Slide {
  return { id: newId(), layout: 'caption-top', captions: { [lang]: { title, subtitle } }, images: {} };
}

/** The caption for a language, falling back to the project's default language. */
export function captionFor(project: Project, slide: Slide, lang: string): Caption {
  return slide.captions[lang] ?? slide.captions[project.languages[0]] ?? { title: '', subtitle: '' };
}

/** The screenshot for a language and device class: its own, else the
 *  shared one, else the default language's. Tablets never fall back to a
 *  phone screenshot: a phone image in an iPad frame looks wrong. */
export function imageFor(project: Project, slide: Slide, lang: string, cls: DeviceClass = 'phone'): string | undefined {
  const p = cls === 'tablet' ? 'tablet:' : '';
  return slide.images[p + lang] ?? slide.images[p + '*'] ?? slide.images[p + project.languages[0]];
}

export function imageKey(cls: DeviceClass, lang: string | '*'): string {
  return (cls === 'tablet' ? 'tablet:' : '') + lang;
}

/** Validates and upgrades a project loaded from a file. Throws on garbage. */
export function parseProject(json: unknown): Project {
  const p = json as Project;
  if (!p || typeof p !== 'object' || p.version !== 1 || !Array.isArray(p.slides) || !Array.isArray(p.languages)) {
    throw new Error('not a shotsmith project');
  }
  const style = { ...defaultStyle(), ...(p.style ?? {}) } as Style;
  // earlier files: named frame colours and an on/off shadow
  const named: Record<string, string> = { black: '#16171a', silver: '#d9dade', gold: '#e6d3b3', blue: '#2c3e57' };
  if (named[style.frameColor]) style.frameColor = named[style.frameColor];
  if (typeof (style.shadow as unknown) === 'boolean') style.shadow = (style.shadow as unknown) ? 0.6 : 0;
  const slides = p.slides.map((s) => ({
    id: typeof s.id === 'string' ? s.id : newId(),
    layout: (['caption-top', 'caption-bottom', 'tilted', 'plain'] as Layout[]).includes(s.layout) ? s.layout : 'caption-top',
    captions: typeof s.captions === 'object' && s.captions ? s.captions : {},
    images: typeof s.images === 'object' && s.images ? s.images : {},
    background: s.background,
    textColor: s.textColor,
    subtitleColor: s.subtitleColor,
  }));
  return {
    version: 1,
    name: String(p.name ?? 'Untitled'),
    languages: p.languages.length ? p.languages.map(String) : ['en'],
    targets: Array.isArray(p.targets) && p.targets.length ? p.targets.map(String) : newProject().targets,
    style,
    slides,
  };
}
