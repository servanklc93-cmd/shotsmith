// Checks a project against the store rules before you upload, so App Store
// Connect or the Play Console don't reject it (or quietly crop it).

import { DEFAULT_SCREEN_ASPECT, type Measure, frameFor, place } from './layout';
import { type Project, captionFor, imageFor } from './project';
import { LIMITS, TARGETS, type Target, locale } from './specs';

export interface Issue {
  level: 'error' | 'warning';
  message: string;
  slide?: number;          // 1-based
  target?: string;
  lang?: string;
}

// WCAG relative luminance and contrast ratio
function luminance(hex: string): number {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0.5;
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ImageInfo {
  width: number;
  height: number;
}

export function lint(project: Project, images: Map<string, ImageInfo>, measure: Measure): Issue[] {
  const issues: Issue[] = [];
  const targets = project.targets.map((id) => TARGETS.find((t) => t.id === id)).filter(Boolean) as Target[];
  const n = project.slides.length;

  if (!targets.length) issues.push({ level: 'error', message: 'Pick at least one export size' });
  const apple = targets.some((t) => t.store === 'apple');
  const google = targets.some((t) => t.store === 'google');
  if (n === 0) issues.push({ level: 'error', message: 'Add at least one screenshot' });
  if (apple && n > LIMITS.apple.maxScreenshots) {
    issues.push({ level: 'error', message: `App Store allows at most ${LIMITS.apple.maxScreenshots} screenshots per size; you have ${n}` });
  }
  if (google && n > LIMITS.google.maxScreenshots) {
    issues.push({ level: 'error', message: `Google Play allows at most ${LIMITS.google.maxScreenshots} phone screenshots; you have ${n}` });
  }
  if (google && n > 0 && n < LIMITS.google.minScreenshots) {
    issues.push({ level: 'error', message: `Google Play needs at least ${LIMITS.google.minScreenshots} screenshots to publish` });
  }
  if (apple && !project.targets.includes('iphone-6.3')) {
    issues.push({ level: 'warning', message: 'App Store Connect requires the iPhone 6.3" (Dynamic Island, medium) size' });
  }
  if (apple && !project.targets.includes('iphone-6.9') && !project.targets.includes('iphone-6.5')) {
    issues.push({ level: 'warning', message: 'Without the 6.9" set, App Store Connect also requires the 6.5" set' });
  }

  const style = project.style;
  const bg = style.background;
  const worst = Math.min(contrast(style.textColor, bg.colors[0]), contrast(style.textColor, bg.colors[1]));
  if (worst < 3) {
    issues.push({ level: 'warning', message: `Caption contrast is low (${worst.toFixed(1)}:1); aim for at least 3:1 so it reads at thumbnail size` });
  }

  project.slides.forEach((slide, i) => {
    const num = i + 1;
    for (const lang of project.languages) {
      const own = slide.captions[lang];
      if (lang !== project.languages[0] && (!own || !own.title.trim()) && captionFor(project, slide, lang).title.trim()) {
        issues.push({ level: 'warning', slide: num, lang, message: `No ${locale(lang).name} caption; the ${locale(project.languages[0]).name} one will be used` });
      }
    }
    const imageId = imageFor(project, slide, project.languages[0]);
    const image = imageId ? images.get(imageId) : undefined;
    if (!image) issues.push({ level: 'error', slide: num, message: 'No screenshot yet' });

    for (const t of targets) {
      const caption = captionFor(project, slide, project.languages[0]);
      const pl = place(t.width, t.height, slide.layout, style, caption, t.device,
        image ? image.width / image.height : undefined, measure);
      if (pl.caption && t.store === 'google' && pl.caption.rect.h / t.height > LIMITS.google.maxCaptionShare) {
        const pct = Math.round((pl.caption.rect.h / t.height) * 100);
        issues.push({ level: 'warning', slide: num, target: t.id, message: `Caption covers ${pct}% of the image; Google Play asks for at most 20%` });
      }
      if (pl.caption && pl.caption.title.fontPx < t.width * 0.045) {
        issues.push({ level: 'warning', slide: num, target: t.id, message: 'Title had to shrink a lot to fit; it may be hard to read in the store. Try a shorter one' });
      }
      if (t.store === 'google' && pl.device && pl.device.frame !== 'none') {
        issues.push({ level: 'warning', slide: num, target: t.id, message: 'Google Play recommends no device frames in screenshots' });
      }
      if (image && pl.device) {
        const frame = frameFor(style.frame, t.device);
        const expected = frame === 'none' ? undefined : DEFAULT_SCREEN_ASPECT[frame];
        const actual = image.width / image.height;
        if (expected && Math.abs(actual / expected - 1) > 0.12) {
          issues.push({ level: 'warning', slide: num, target: t.id, message: `The screenshot (${image.width}×${image.height}) isn't shaped like a ${frame} screen, so the frame gets reshaped around it. Use a screenshot taken on that kind of device` });
        }
      }
      if (slide.layout === 'plain' && image) {
        const ratio = (image.width / image.height) / (t.width / t.height);
        if (Math.abs(ratio - 1) > 0.02) {
          issues.push({ level: 'warning', slide: num, target: t.id, message: `Edge-to-edge layout: the screenshot will be cropped to fit ${t.width}×${t.height}` });
        }
      }
    }
  });

  // one message per (slide, problem) instead of one per size
  const seen = new Set<string>();
  return issues.filter((x) => {
    const key = `${x.level}|${x.slide ?? ''}|${x.lang ?? ''}|${x.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
