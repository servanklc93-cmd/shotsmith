// The document model. Everything a project is, as plain JSON (images are
// referenced by id and stored separately, see storage.ts).

export type Layout = 'caption-top' | 'caption-bottom' | 'tilted' | 'plain';
export type Frame = 'auto' | 'iphone' | 'ipad' | 'android' | 'none';
export type FrameColor = 'black' | 'silver' | 'gold' | 'blue';

export interface Background {
  kind: 'solid' | 'linear' | 'radial';
  colors: [string, string];
  angle: number;            // degrees, for linear
}

export interface Style {
  background: Background;
  textColor: string;
  font: string;
  titleSize: number;        // fraction of the canvas width
  subtitleSize: number;
  titleWeight: number;
  frame: Frame;
  frameColor: FrameColor;
  deviceScale: number;      // device width as a fraction of the canvas width
  shadow: boolean;
}

export interface Caption {
  title: string;
  subtitle: string;
}

export interface Slide {
  id: string;
  layout: Layout;
  captions: Record<string, Caption>;     // by language code
  images: Record<string, string>;        // language code -> image id; '*' for every language
  background?: Background;               // overrides the project style for this slide
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

export const PRESETS: { name: string; style: Partial<Style> }[] = [
  { name: 'Midnight', style: { background: { kind: 'linear', colors: ['#1b1f3b', '#3a2d6b'], angle: 160 }, textColor: '#ffffff', frameColor: 'black' } },
  { name: 'Sunrise', style: { background: { kind: 'linear', colors: ['#ff9a5a', '#ff5e7e'], angle: 150 }, textColor: '#ffffff', frameColor: 'silver' } },
  { name: 'Mint', style: { background: { kind: 'linear', colors: ['#d8f5e3', '#9fe0c1'], angle: 170 }, textColor: '#0f3d2e', frameColor: 'black' } },
  { name: 'Paper', style: { background: { kind: 'solid', colors: ['#f4f1ea', '#f4f1ea'], angle: 0 }, textColor: '#1c1b19', frameColor: 'black' } },
  { name: 'Ocean', style: { background: { kind: 'radial', colors: ['#3fa9f5', '#0b3d91'], angle: 0 }, textColor: '#ffffff', frameColor: 'blue' } },
  { name: 'Mono', style: { background: { kind: 'solid', colors: ['#0d0d0d', '#0d0d0d'], angle: 0 }, textColor: '#f2f2f2', frameColor: 'silver' } },
];

export function defaultStyle(): Style {
  return {
    background: { kind: 'linear', colors: ['#1b1f3b', '#3a2d6b'], angle: 160 },
    textColor: '#ffffff',
    font: FONTS[0].css,
    titleSize: 0.082,
    subtitleSize: 0.042,
    titleWeight: 800,
    frame: 'auto',
    frameColor: 'black',
    deviceScale: 0.78,
    shadow: true,
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

/** The screenshot for a language: its own, else the shared one, else the default language's. */
export function imageFor(project: Project, slide: Slide, lang: string): string | undefined {
  return slide.images[lang] ?? slide.images['*'] ?? slide.images[project.languages[0]];
}

/** Validates and upgrades a project loaded from a file. Throws on garbage. */
export function parseProject(json: unknown): Project {
  const p = json as Project;
  if (!p || typeof p !== 'object' || p.version !== 1 || !Array.isArray(p.slides) || !Array.isArray(p.languages)) {
    throw new Error('not a shotsmith project');
  }
  const style = { ...defaultStyle(), ...(p.style ?? {}) };
  const slides = p.slides.map((s) => ({
    id: typeof s.id === 'string' ? s.id : newId(),
    layout: (['caption-top', 'caption-bottom', 'tilted', 'plain'] as Layout[]).includes(s.layout) ? s.layout : 'caption-top',
    captions: typeof s.captions === 'object' && s.captions ? s.captions : {},
    images: typeof s.images === 'object' && s.images ? s.images : {},
    background: s.background,
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
