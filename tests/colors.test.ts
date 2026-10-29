import { describe, expect, it } from 'vitest';
import { contrast, lint } from '../src/lint';
import { PRESETS, imageFor, isHex, newProject, newSlide, normalizeHex, parseProject, shade } from '../src/project';

const measure = (text: string, px: number) => text.length * px * 0.5;

describe('presets', () => {
  for (const p of PRESETS) {
    it(`${p.name} keeps both caption colours readable on both background colours`, () => {
      const bg = p.style.background!;
      for (const c of bg.kind === 'solid' ? [bg.colors[0]] : bg.colors) {
        // WCAG AA for normal-size text, stricter than the 3:1 titles need
        expect(contrast(p.style.textColor!, c), `${p.name} title on ${c}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.style.subtitleColor!, c), `${p.name} subtitle on ${c}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(isHex(p.style.frameColor!)).toBe(true);
    });
  }
});

describe('colour helpers', () => {
  it('normalizes hex', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('a1b2c3')).toBe('#a1b2c3');
    expect(normalizeHex(' #FF0000 ')).toBe('#ff0000');
    expect(normalizeHex('red')).toBe('red');
    expect(isHex('#12345')).toBe(false);
  });

  it('shades towards white and black', () => {
    expect(shade('#000000', 1)).toBe('#ffffff');
    expect(shade('#ffffff', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#204060', 0.5)).toBe('#90a0b0');
    expect(shade('not a colour', 0.5)).toBe('not a colour');
  });
});

describe('own colours per slide', () => {
  it('are checked for contrast too', () => {
    const p = newProject();
    p.targets = ['iphone-6.9', 'iphone-6.3'];
    const s = newSlide('en');
    s.images['*'] = 'a';
    s.background = { kind: 'solid', colors: ['#ffffff', '#ffffff'], angle: 0 };
    s.textColor = '#eeeeee';
    p.slides.push(s);
    const issues = lint(p, new Map([['a', { width: 1206, height: 2622 }]]), measure);
    expect(issues.some((i) => i.slide === 1 && /Title contrast is low/.test(i.message))).toBe(true);
  });
});

describe('tablet screenshots', () => {
  it('never fall back to the phone one', () => {
    const p = newProject();
    const s = newSlide('en');
    s.images['*'] = 'phone';
    expect(imageFor(p, s, 'en', 'tablet')).toBeUndefined();
    s.images['tablet:*'] = 'ipad';
    expect(imageFor(p, s, 'en', 'tablet')).toBe('ipad');
    expect(imageFor(p, s, 'en', 'phone')).toBe('phone');
  });

  it('are required for iPad sizes', () => {
    const p = newProject();
    p.targets = ['iphone-6.3', 'ipad-13'];
    const s = newSlide('en');
    s.images['*'] = 'phone';
    p.slides.push(s);
    const images = new Map([['phone', { width: 1206, height: 2622 }]]);
    expect(lint(p, images, measure).some((i) => /No tablet screenshot/.test(i.message))).toBe(true);
    s.images['tablet:*'] = 'ipad';
    images.set('ipad', { width: 2064, height: 2752 });
    expect(lint(p, images, measure).some((i) => /No tablet screenshot/.test(i.message))).toBe(false);
  });
});

describe('older project files', () => {
  it('upgrade named frame colours and the on/off shadow', () => {
    const p = parseProject({ version: 1, name: 'old', languages: ['en'], slides: [],
      style: { frameColor: 'silver', shadow: true } });
    expect(p.style.frameColor).toBe('#d9dade');
    expect(p.style.shadow).toBe(0.6);
  });
});
