import { describe, expect, it } from 'vitest';
import { cover, fitText, frameFor, place, wrap } from '../src/layout';
import { defaultStyle } from '../src/project';
import { TARGETS } from '../src/specs';

// every character is half the font size wide: crude, but deterministic
const measure = (text: string, px: number) => text.length * px * 0.5;

describe('wrap', () => {
  it('breaks on spaces and keeps words whole', () => {
    expect(wrap('track every run you make', 10, 60, measure)).toEqual(['track every', 'run you make']);
  });

  it('breaks a word longer than the line', () => {
    const lines = wrap('Donaudampfschifffahrtsgesellschaft', 10, 50, measure);
    expect(lines.every((l) => measure(l, 10) <= 50)).toBe(true);
    expect(lines.join('')).toBe('Donaudampfschifffahrtsgesellschaft');
  });

  it('keeps explicit line breaks', () => {
    expect(wrap('one\ntwo', 10, 500, measure)).toEqual(['one', 'two']);
  });
});

describe('fitText', () => {
  it('shrinks until it fits the line budget', () => {
    const long = 'Bütün koşularını tek bir yerde takip et ve hedeflerine ulaş';
    const b = fitText(long, 100, 600, 3, measure);   // ~12 characters a line: 5 lines at full size
    expect(b.lines.length).toBeLessThanOrEqual(3);
    expect(b.fontPx).toBeLessThan(100);
  });

  it('empty text takes no lines', () => {
    expect(fitText('  ', 50, 1000, 3, measure).lines).toEqual([]);
  });
});

describe('place', () => {
  const style = defaultStyle();
  const caption = { title: 'Plan your week in seconds', subtitle: 'Drag, drop, done' };

  for (const t of TARGETS) {
    it(`keeps everything sensible on ${t.id}`, () => {
      for (const layout of ['caption-top', 'caption-bottom', 'tilted'] as const) {
        const p = place(t.width, t.height, layout, style, caption, t.device, undefined, measure);
        const c = p.caption!;
        expect(c.rect.x).toBeGreaterThanOrEqual(0);
        expect(c.rect.x + c.rect.w).toBeLessThanOrEqual(t.width);
        expect(c.rect.y).toBeGreaterThanOrEqual(0);
        expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(t.height);
        const d = p.device!;
        expect(d.rect.w).toBeLessThan(t.width);
        // the device may run off one edge, but most of it is on the canvas
        const visible = Math.min(d.rect.y + d.rect.h, t.height) - Math.max(d.rect.y, 0);
        expect(visible / d.rect.h).toBeGreaterThan(0.7);
        // caption and device don't overlap
        if (layout === 'caption-top') expect(d.rect.y).toBeGreaterThanOrEqual(c.rect.y + c.rect.h);
        if (layout === 'caption-bottom') expect(d.rect.y + d.rect.h).toBeLessThanOrEqual(c.rect.y);
      }
    });
  }

  it('fits the screen to the screenshot so nothing gets cropped', () => {
    const p = place(1320, 2868, 'caption-top', style, caption, 'iphone', 1179 / 2556, measure);
    expect(p.device!.screen.w / p.device!.screen.h).toBeCloseTo(1179 / 2556, 5);
  });

  it('plain layout is edge to edge', () => {
    expect(place(1080, 1920, 'plain', style, caption, 'android-phone', undefined, measure)).toEqual({
      caption: null, device: null, fullBleed: true,
    });
  });

  it('picks a frame per device, and none for Google Play by default', () => {
    expect(frameFor('auto', 'iphone')).toBe('iphone');
    expect(frameFor('auto', 'ipad')).toBe('ipad');
    expect(frameFor('auto', 'android-phone')).toBe('none');
    expect(frameFor('android', 'android-phone')).toBe('android');
  });
});

describe('cover', () => {
  it('fills the box and centres the overflow', () => {
    expect(cover(100, 200, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: -50, w: 100, h: 200 });
  });
});
