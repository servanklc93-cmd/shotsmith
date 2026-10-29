import { describe, expect, it } from 'vitest';
import { contrast, lint } from '../src/lint';
import { newProject, newSlide } from '../src/project';

const measure = (text: string, px: number) => text.length * px * 0.5;

function project(n: number, targets = ['iphone-6.9', 'iphone-6.3', 'play-phone']) {
  const p = newProject();
  p.targets = targets;
  for (let i = 0; i < n; i++) {
    const s = newSlide('en', 'Short title', 'sub');
    s.images['*'] = `img${i}`;
    p.slides.push(s);
  }
  const images = new Map(p.slides.map((_, i) => [`img${i}`, { width: 1206, height: 2622 }]));
  return { p, images };
}

const messages = (issues: { message: string }[]) => issues.map((i) => i.message).join('\n');

describe('lint', () => {
  it('a good project only gets the Google frame note at most', () => {
    const { p, images } = project(4);
    const issues = lint(p, images, measure);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('counts screenshots per store', () => {
    expect(messages(lint(project(11).p, project(11).images, measure))).toMatch(/at most 10 screenshots/);
    expect(messages(lint(project(9).p, project(9).images, measure))).toMatch(/at most 8 phone screenshots/);
    expect(messages(lint(project(1).p, project(1).images, measure))).toMatch(/at least 2 screenshots/);
  });

  it('flags missing screenshots and required sizes', () => {
    const { p } = project(2, ['iphone-6.9']);
    const m = messages(lint(p, new Map(), measure));
    expect(m).toMatch(/No phone screenshot yet/);
    expect(m).toMatch(/requires the iPhone 6.3"/);
  });

  it("enforces Google's 20% caption rule", () => {
    const { p, images } = project(2, ['play-phone']);
    p.slides[0].captions.en = { title: 'A very long caption that keeps going and going for many words', subtitle: 'and a subtitle that is also quite long, longer than it should be really' };
    expect(messages(lint(p, images, measure))).toMatch(/Google Play asks for at most 20%/);
  });

  it('warns about unreadable contrast', () => {
    const { p, images } = project(2);
    p.style.textColor = '#3a2d6b';
    expect(messages(lint(p, images, measure))).toMatch(/contrast is low/);
  });

  it('notices missing translations', () => {
    const { p, images } = project(2);
    p.languages = ['en', 'tr'];
    p.slides[1].captions.tr = { title: 'Kısa başlık', subtitle: '' };
    const issues = lint(p, images, measure);
    expect(issues.filter((i) => /No Türkçe caption/.test(i.message)).map((i) => i.slide)).toEqual([1]);
  });

  it('warns when a landscape screenshot is put in a phone frame', () => {
    const { p } = project(2, ['iphone-6.9']);
    const images = new Map([['img0', { width: 2622, height: 1206 }], ['img1', { width: 1206, height: 2622 }]]);
    const issues = lint(p, images, measure);
    expect(issues.filter((i) => /isn't shaped like/.test(i.message)).map((i) => i.slide)).toEqual([1]);
  });
});

describe('contrast', () => {
  it('matches WCAG reference values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
