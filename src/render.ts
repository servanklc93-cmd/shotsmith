// Drawing a slide onto a 2D canvas context. The same function renders the
// small preview and the full-size export, so what you see is what you upload.

import { FRAMES, type Placement, type Rect, cover, place } from './layout';
import {
  type Align, type Background, type DeviceClass, type Project, type Slide, captionFor, imageFor, shade,
} from './project';
import type { DeviceKind, Target } from './specs';
import { locale } from './specs';

export interface ImageSource {
  width: number;
  height: number;
  source: CanvasImageSource;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function deviceClass(device: DeviceKind): DeviceClass {
  return device === 'ipad' || device === 'android-tablet' ? 'tablet' : 'phone';
}

function roundRect(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function fillBackground(ctx: Ctx, bg: Background, w: number, h: number, images: Map<string, ImageSource>) {
  if (bg.kind === 'image') {
    const img = bg.image ? images.get(bg.image) : undefined;
    ctx.fillStyle = bg.colors[0];
    ctx.fillRect(0, 0, w, h);
    if (img) {
      const r = cover(img.width, img.height, { x: 0, y: 0, w, h });
      ctx.drawImage(img.source, r.x, r.y, r.w, r.h);
      if (bg.dim) {
        ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    return;
  }
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.colors[0];
  } else if (bg.kind === 'linear') {
    const a = (bg.angle * Math.PI) / 180;
    const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    const cx = w / 2;
    const cy = h / 2;
    const dx = (Math.sin(a) * len) / 2;
    const dy = (-Math.cos(a) * len) / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    g.addColorStop(0, bg.colors[0]);
    g.addColorStop(1, bg.colors[1]);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.hypot(w, h) * 0.7);
    g.addColorStop(0, bg.colors[0]);
    g.addColorStop(1, bg.colors[1]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, w, h);
}

interface TextStyle {
  title: string;
  subtitle: string;
  font: string;
  weight: number;
  align: Align;
  rtl: boolean;
}

function drawText(ctx: Ctx, p: NonNullable<Placement['caption']>, t: TextStyle) {
  // in a right-to-left language, "left" and "right" swap
  const align = t.rtl && t.align !== 'center' ? (t.align === 'left' ? 'right' : 'left') : t.align;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  (ctx as CanvasRenderingContext2D).direction = t.rtl ? 'rtl' : 'ltr';
  const x = align === 'left' ? p.rect.x : align === 'right' ? p.rect.x + p.rect.w : p.rect.x + p.rect.w / 2;
  let y = p.rect.y;
  ctx.fillStyle = t.title;
  ctx.font = `${t.weight} ${p.title.fontPx}px ${t.font}`;
  for (const line of p.title.lines) {
    ctx.fillText(line, x, y + (p.title.lineHeight - p.title.fontPx) / 2);
    y += p.title.lineHeight;
  }
  y += p.gap;
  ctx.fillStyle = t.subtitle;
  ctx.font = `500 ${p.subtitle.fontPx}px ${t.font}`;
  for (const line of p.subtitle.lines) {
    ctx.fillText(line, x, y + (p.subtitle.lineHeight - p.subtitle.fontPx) / 2);
    y += p.subtitle.lineHeight;
  }
}

function drawScreen(ctx: Ctx, screen: Rect, radius: number, image: ImageSource | undefined, placeholder: string) {
  ctx.save();
  roundRect(ctx, screen, radius);
  ctx.clip();
  if (image) {
    const r = cover(image.width, image.height, screen);
    ctx.drawImage(image.source, r.x, r.y, r.w, r.h);
  } else {
    // an empty screen still shows where the screenshot goes
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
    ctx.fillStyle = '#8b90a0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${screen.w * 0.055}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(placeholder, screen.x + screen.w / 2, screen.y + screen.h / 2);
  }
  ctx.restore();
}

function setShadow(ctx: Ctx, strength: number, size: number) {
  if (strength <= 0) return;
  ctx.shadowColor = `rgba(0,0,0,${0.55 * strength})`;
  ctx.shadowBlur = size * 0.09 * strength;
  ctx.shadowOffsetY = size * 0.035 * strength;
}

function drawDevice(ctx: Ctx, d: NonNullable<Placement['device']>, color: string, shadow: number,
  image: ImageSource | undefined, placeholder: string) {
  const { rect, screen, frame } = d;
  ctx.save();
  if (d.rotation) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((d.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (frame === 'none') {
    const radius = rect.w * 0.05;
    setShadow(ctx, shadow, rect.w);
    roundRect(ctx, screen, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    drawScreen(ctx, screen, radius, image, placeholder);
    ctx.restore();
    return;
  }

  const spec = FRAMES[frame];
  const w = rect.w;
  // the edge highlight and the buttons are derived from the chosen colour
  const dark = luminanceOf(color) < 0.4;
  const edge = shade(color, dark ? 0.22 : 0.5);
  const button = shade(color, dark ? 0.08 : -0.12);

  ctx.fillStyle = button;
  const btn = (x: number, y: number, bw: number, bh: number) => {
    roundRect(ctx, { x, y, w: bw, h: bh }, bw / 2);
    ctx.fill();
  };
  if (frame === 'iphone') {
    btn(rect.x - w * 0.012, rect.y + rect.h * 0.17, w * 0.02, rect.h * 0.035);
    btn(rect.x - w * 0.012, rect.y + rect.h * 0.235, w * 0.02, rect.h * 0.065);
    btn(rect.x - w * 0.012, rect.y + rect.h * 0.315, w * 0.02, rect.h * 0.065);
    btn(rect.x + w - w * 0.008, rect.y + rect.h * 0.26, w * 0.02, rect.h * 0.1);
  } else if (frame === 'android') {
    btn(rect.x + w - w * 0.008, rect.y + rect.h * 0.2, w * 0.018, rect.h * 0.08);
    btn(rect.x + w - w * 0.008, rect.y + rect.h * 0.32, w * 0.018, rect.h * 0.05);
  } else if (frame === 'ipad') {
    // top button and the volume keys on the right edge, in portrait
    btn(rect.x + w * 0.78, rect.y - w * 0.006, w * 0.09, w * 0.012);
    btn(rect.x + w - w * 0.006, rect.y + rect.h * 0.08, w * 0.012, rect.h * 0.045);
    btn(rect.x + w - w * 0.006, rect.y + rect.h * 0.135, w * 0.012, rect.h * 0.045);
  }

  setShadow(ctx, shadow, w);
  roundRect(ctx, rect, w * spec.radius);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.strokeStyle = edge;
  const inset = ctx.lineWidth / 2;
  roundRect(ctx, { x: rect.x + inset, y: rect.y + inset, w: rect.w - 2 * inset, h: rect.h - 2 * inset }, w * spec.radius);
  ctx.stroke();

  drawScreen(ctx, screen, w * spec.screenRadius, image, placeholder);

  ctx.fillStyle = '#000';
  if (frame === 'iphone') {
    // Dynamic Island
    const iw = screen.w * 0.31;
    const ih = screen.w * 0.09;
    roundRect(ctx, { x: screen.x + (screen.w - iw) / 2, y: screen.y + screen.w * 0.035, w: iw, h: ih }, ih / 2);
    ctx.fill();
  } else if (frame === 'android') {
    ctx.beginPath();
    ctx.arc(screen.x + screen.w / 2, screen.y + screen.w * 0.06, screen.w * 0.028, 0, Math.PI * 2);
    ctx.fill();
  } else if (frame === 'ipad') {
    // front camera in the top bezel
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + (screen.y - rect.y) / 2, w * 0.007, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, dark ? 0.15 : -0.35);
    ctx.fill();
  }
  ctx.restore();
}

function luminanceOf(hex: string): number {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface RenderInput {
  project: Project;
  slide: Slide;
  lang: string;
  target: Target;
  images: Map<string, ImageSource>;
}

export function measureWith(ctx: Ctx, font: string, weight: number) {
  return (text: string, px: number) => {
    ctx.font = `${weight} ${px}px ${font}`;
    return ctx.measureText(text).width;
  };
}

/** Draws a slide at the target's full resolution into ctx (already sized). */
export function renderSlide(ctx: Ctx, input: RenderInput): Placement {
  const { project, slide, lang, target, images } = input;
  const { width: w, height: h } = target;
  const style = project.style;
  const caption = captionFor(project, slide, lang);
  const cls = deviceClass(target.device);
  const imageId = imageFor(project, slide, lang, cls);
  const image = imageId ? images.get(imageId) : undefined;
  const rtl = !!locale(lang).rtl;

  fillBackground(ctx, slide.background ?? style.background, w, h, images);

  const measure = measureWith(ctx, style.font, style.titleWeight);
  const placement = place(w, h, slide.layout, style, caption, target.device,
    image ? image.width / image.height : undefined, measure);

  if (placement.fullBleed) {
    if (image) {
      const r = cover(image.width, image.height, { x: 0, y: 0, w, h });
      ctx.drawImage(image.source, r.x, r.y, r.w, r.h);
    }
    return placement;
  }
  const placeholder = cls === 'tablet' ? 'Drop a tablet screenshot' : 'Drop a screenshot';
  if (placement.device) drawDevice(ctx, placement.device, style.frameColor, style.shadow, image, placeholder);
  if (placement.caption) {
    drawText(ctx, placement.caption, {
      title: slide.textColor ?? style.textColor,
      subtitle: slide.subtitleColor ?? style.subtitleColor,
      font: style.font, weight: style.titleWeight, align: style.align, rtl,
    });
  }
  return placement;
}
