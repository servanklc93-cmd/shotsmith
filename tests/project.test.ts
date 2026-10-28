import { describe, expect, it } from 'vitest';
import { plan } from '../src/export';
import { captionFor, imageFor, newProject, newSlide, parseProject } from '../src/project';

describe('project', () => {
  it('falls back to the default language', () => {
    const p = newProject();
    p.languages = ['en', 'tr'];
    const s = newSlide('en', 'Hello');
    s.images = { '*': 'shared', tr: 'turkish' };
    expect(captionFor(p, s, 'tr').title).toBe('Hello');
    expect(imageFor(p, s, 'tr')).toBe('turkish');
    expect(imageFor(p, s, 'en')).toBe('shared');
  });

  it('parses saved projects and rejects other JSON', () => {
    const p = newProject();
    p.slides.push(newSlide('en'));
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back.slides[0].captions).toEqual(p.slides[0].captions);
    expect(() => parseProject({ hello: 'world' })).toThrow('not a shotsmith project');
    // missing style fields come back with defaults
    const partial = parseProject({ version: 1, name: 'x', languages: ['en'], slides: [], style: { textColor: '#000000' } });
    expect(partial.style.textColor).toBe('#000000');
    expect(partial.style.titleSize).toBeGreaterThan(0);
  });
});

describe('export plan', () => {
  it('uses fastlane folders and store-specific locale codes', () => {
    const p = newProject();
    p.languages = ['en', 'tr'];
    p.targets = ['iphone-6.9', 'play-phone'];
    p.slides = [newSlide('en'), newSlide('en')];
    const paths = plan(p).map((j) => j.path);
    expect(paths).toEqual([
      'fastlane/screenshots/en-US/01_iphone-6.9.png',
      'fastlane/screenshots/en-US/02_iphone-6.9.png',
      'fastlane/screenshots/tr/01_iphone-6.9.png',
      'fastlane/screenshots/tr/02_iphone-6.9.png',
      'fastlane/metadata/android/en-US/images/phoneScreenshots/1.png',
      'fastlane/metadata/android/en-US/images/phoneScreenshots/2.png',
      'fastlane/metadata/android/tr-TR/images/phoneScreenshots/1.png',
      'fastlane/metadata/android/tr-TR/images/phoneScreenshots/2.png',
    ]);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
