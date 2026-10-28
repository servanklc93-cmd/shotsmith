// Pure geometry: where the caption and the device go on a canvas of a given
// size. No drawing here, so it can be tested without a browser.

import type { Caption, Frame, Layout, Style } from './project';
import type { DeviceKind } from './specs';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Measure = (text: string, fontPx: number) => number;

export interface TextBlock {
  lines: string[];
  fontPx: number;
  lineHeight: number;
}

export interface Placement {
  caption: { rect: Rect; title: TextBlock; subtitle: TextBlock; gap: number } | null;
  device: { rect: Rect; screen: Rect; rotation: number; frame: Exclude<Frame, 'auto'> } | null;
  // an image drawn edge to edge with no frame (the 'plain' layout)
  fullBleed: boolean;
}

// device bodies, relative to their width
export const FRAMES = {
  iphone: { bezel: 0.04, radius: 0.165, screenRadius: 0.13 },
  ipad: { bezel: 0.05, radius: 0.07, screenRadius: 0.045 },
  android: { bezel: 0.032, radius: 0.1, screenRadius: 0.075 },
};

export const DEFAULT_SCREEN_ASPECT: Record<Exclude<Frame, 'auto' | 'none'>, number> = {
  iphone: 1206 / 2622,
  ipad: 2064 / 2752,
  android: 1080 / 2400,
};

export function frameFor(frame: Frame, device: DeviceKind): Exclude<Frame, 'auto'> {
  if (frame !== 'auto') return frame;
  if (device === 'ipad') return 'ipad';
  if (device === 'iphone') return 'iphone';
  // Google asks for no device imagery in Play screenshots
  return 'none';
}

/** Greedy word wrap. Words longer than a line are broken by character. */
export function wrap(text: string, fontPx: number, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (measure(word, fontPx) > maxWidth && word.length > 1) {
        // break an over-long word (URLs, German compounds, CJK runs)
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut), fontPx) > maxWidth) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fontPx) <= maxWidth || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** Wrap, shrinking the font until it fits in maxLines (down to a floor). */
export function fitText(text: string, fontPx: number, maxWidth: number, maxLines: number, measure: Measure): TextBlock {
  let size = fontPx;
  let lines = wrap(text, size, maxWidth, measure);
  while (lines.length > maxLines && size > fontPx * 0.6) {
    size *= 0.92;
    lines = wrap(text, size, maxWidth, measure);
  }
  return { lines: text.trim() ? lines : [], fontPx: size, lineHeight: size * 1.18 };
}

export function textHeight(b: TextBlock): number {
  return b.lines.length ? b.lines.length * b.lineHeight : 0;
}

export function place(
  width: number,
  height: number,
  layout: Layout,
  style: Style,
  caption: Caption,
  device: DeviceKind,
  screenAspect: number | undefined,
  measure: Measure,
): Placement {
  if (layout === 'plain') return { caption: null, device: null, fullBleed: true };

  const margin = width * 0.07;
  const textWidth = width - 2 * margin;
  const title = fitText(caption.title, width * style.titleSize, textWidth, 3, measure);
  const subtitle = fitText(caption.subtitle, width * style.subtitleSize, textWidth, 3, measure);
  const gap = title.lines.length && subtitle.lines.length ? width * 0.025 : 0;
  const captionH = textHeight(title) + gap + textHeight(subtitle);

  const frame = frameFor(style.frame, device);
  const aspect = screenAspect ?? DEFAULT_SCREEN_ASPECT[frame === 'none' ? (device === 'ipad' ? 'ipad' : 'iphone') : frame];
  const spec = frame === 'none' ? { bezel: 0 } : FRAMES[frame];

  // tablets are wide: scale them down so they don't swallow the caption
  const scale = device === 'ipad' || device === 'android-tablet' ? style.deviceScale * 0.92 : style.deviceScale;
  let bodyW = width * scale;
  let screenW = bodyW * (1 - 2 * spec.bezel);
  let screenH = screenW / aspect;
  let bodyH = screenH + bodyW * 2 * spec.bezel;

  const top = height * 0.065;
  const captionGap = height * 0.04;
  const available = height - top - captionH - captionGap;
  // the device may run off the bottom edge (a common look), but not by more
  // than a quarter of itself
  const maxH = available + bodyH * 0.25;
  if (bodyH > maxH && maxH > 0) {
    const k = maxH / bodyH;
    bodyW *= k;
    screenW *= k;
    screenH *= k;
    bodyH *= k;
  }

  let captionY: number;
  let deviceY: number;
  if (layout === 'caption-bottom') {
    captionY = height - top - captionH;
    deviceY = captionY - captionGap - bodyH;
    if (deviceY > top) deviceY = top + (captionY - captionGap - bodyH - top) / 2;
  } else {
    captionY = top;
    deviceY = top + captionH + captionGap;
  }
  const deviceX = (width - bodyW) / 2;
  const bezel = bodyW * spec.bezel;

  return {
    caption: captionH ? { rect: { x: margin, y: captionY, w: textWidth, h: captionH }, title, subtitle, gap } : null,
    device: {
      rect: { x: deviceX, y: deviceY, w: bodyW, h: bodyH },
      screen: { x: deviceX + bezel, y: deviceY + bezel, w: screenW, h: screenH },
      rotation: layout === 'tilted' ? -8 : 0,
      frame,
    },
    fullBleed: false,
  };
}

/** Image scaled to cover a box (cropping the overflow), centred. */
export function cover(imgW: number, imgH: number, box: Rect): Rect {
  const k = Math.max(box.w / imgW, box.h / imgH);
  const w = imgW * k;
  const h = imgH * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
