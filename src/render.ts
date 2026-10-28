// Drawing a slide onto a 2D canvas context. The same function renders the
// small preview and the full-size export, so what you see is what you upload.

import { FRAMES, type Placement, type Rect, cover, place } from './layout';
import { type Background, type FrameColor, type Project, type Slide, captionFor, imageFor } from './project';
import type { Target } from './specs';
import { locale } from './specs';

export interface ImageSource {
  width: number;
  height: number;
  source: CanvasImageSource;
}

const FRAME_COLORS: Record<FrameColor, { body: string; edge: string; button: string }> = {
  black: { body: '#16171a', edge: '#3a3c42', button: '#26272b' },
  silver: { body: '#d9dade', edge: '#f5f5f7', button: '#b9bbc1' },
  gold: { body: '#e6d3b3', edge: '#f7ecd9', button: '#cdb791' },
  blue: { body: '#2c3e57', edge: '#4c6688', button: '#22324a' },
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function roundRect(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function fillBackground(ctx: Ctx, bg: Background, w: number, h: number) {
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

function drawText(ctx: Ctx, p: NonNullable<Placement['caption']>, color: string, font: string, weight: number, rtl: boolean) {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  (ctx as CanvasRenderingContext2D).direction = rtl ? 'rtl' : 'ltr';
  const cx = p.rect.x + p.rect.w / 2;
  let y = p.rect.y;
  ctx.font = `${weight} ${p.title.fontPx}px ${font}`;
  for (const line of p.title.lines) {
    ctx.fillText(line, cx, y + (p.title.lineHeight - p.title.fontPx) / 2);
    y += p.title.lineHeight;
  }
  y += p.gap;
  ctx.globalAlpha = 0.82;
  ctx.font = `500 ${p.subtitle.fontPx}px ${font}`;
  for (const line of p.subtitle.lines) {
    ctx.fillText(line, cx, y + (p.subtitle.lineHeight - p.subtitle.fontPx) / 2);
    y += p.subtitle.lineHeight;
  }
  ctx.globalAlpha = 1;
}

function drawScreen(ctx: Ctx, screen: Rect, radius: number, image: ImageSource | undefined) {
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
    ctx.font = `600 ${screen.w * 0.06}px -apple-system, system-ui, sans-serif`;
    ctx.fillText('Drop a screenshot', screen.x + screen.w / 2, screen.y + screen.h / 2);
  }
  ctx.restore();
}

function drawDevice(ctx: Ctx, d: NonNullable<Placement['device']>, color: FrameColor, shadow: boolean, image: ImageSource | undefined) {
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
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = rect.w * 0.06;
      ctx.shadowOffsetY = rect.w * 0.025;
    }
    const radius = rect.w * 0.05;
    roundRect(ctx, screen, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    drawScreen(ctx, screen, radius, image);
    ctx.restore();
    return;
  }

  const spec = FRAMES[frame];
  const c = FRAME_COLORS[color];
  const w = rect.w;

  // side buttons, drawn first so the body covers their inner edge
  ctx.fillStyle = c.button;
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
  }

  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = w * 0.08;
    ctx.shadowOffsetY = w * 0.03;
  }
  roundRect(ctx, rect, w * spec.radius);
  ctx.fillStyle = c.body;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // a thin highlight along the edge
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.strokeStyle = c.edge;
  roundRect(ctx, { x: rect.x + ctx.lineWidth / 2, y: rect.y + ctx.lineWidth / 2, w: rect.w - ctx.lineWidth, h: rect.h - ctx.lineWidth }, w * spec.radius);
  ctx.stroke();

  drawScreen(ctx, screen, w * spec.screenRadius, image);

  ctx.fillStyle = '#000';
  if (frame === 'iphone') {
    // Dynamic Island
    const iw = screen.w * 0.31;
    const ih = screen.w * 0.09;
    roundRect(ctx, { x: screen.x + (screen.w - iw) / 2, y: screen.y + screen.w * 0.035, w: iw, h: ih }, ih / 2);
    ctx.fill();
  } else if (frame === 'android') {
    // punch-hole camera
    ctx.beginPath();
    ctx.arc(screen.x + screen.w / 2, screen.y + screen.w * 0.06, screen.w * 0.028, 0, Math.PI * 2);
    ctx.fill();
  } else if (frame === 'ipad') {
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + (screen.y - rect.y) / 2, w * 0.008, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2d33';
    ctx.fill();
  }
  ctx.restore();
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
  const imageId = imageFor(project, slide, lang);
  const image = imageId ? images.get(imageId) : undefined;
  const rtl = !!locale(lang).rtl;

  fillBackground(ctx, slide.background ?? style.background, w, h);

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
  if (placement.device) drawDevice(ctx, placement.device, style.frameColor, style.shadow, image);
  if (placement.caption) drawText(ctx, placement.caption, style.textColor, style.font, style.titleWeight, rtl);
  return placement;
}
