// Turning a project into files: every (size, language, slide) rendered at full
// resolution, encoded as RGB PNG, and zipped in the folder layout fastlane's
// `deliver` (App Store) and `supply` (Google Play) upload from.

import { encodeRGB } from './png';
import type { Project } from './project';
import { type ImageSource, renderSlide } from './render';
import { TARGETS, type Target, locale } from './specs';
import { type ZipEntry, zip } from './zip';

export interface Job {
  target: Target;
  lang: string;
  slideIndex: number;
  path: string;
}

export function plan(project: Project, targetIds = project.targets, langs = project.languages): Job[] {
  const jobs: Job[] = [];
  for (const id of targetIds) {
    const target = TARGETS.find((t) => t.id === id);
    if (!target) continue;
    for (const lang of langs) {
      const loc = locale(lang);
      const dir = target.fastlaneDir(target.store === 'apple' ? loc.apple : loc.google);
      project.slides.forEach((_, i) => {
        const n = String(i + 1).padStart(2, '0');
        // deliver tells sizes apart by pixel dimensions, so all iPhone sizes can
        // share a folder; the target goes in the name to keep them distinct
        const name = target.store === 'apple' ? `${n}_${target.id}.png` : `${i + 1}.png`;
        jobs.push({ target, lang, slideIndex: i, path: `${dir}/${name}` });
      });
    }
  }
  return jobs;
}

export const README = `Made with shotsmith.

These folders follow fastlane's layout:

  fastlane/screenshots/<locale>/                          App Store, for \`fastlane deliver\`
  fastlane/metadata/android/<locale>/images/...           Google Play, for \`fastlane supply\`

Copy the fastlane folder into your project, or upload the PNGs by hand.
Every image is 24-bit RGB with no alpha channel, as both stores require.
`;

export type Progress = (done: number, total: number) => void;

function canvas(w: number, h: number) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function renderPNG(project: Project, job: Job, images: Map<string, ImageSource>): Promise<Uint8Array> {
  const { width, height } = job.target;
  const c = canvas(width, height);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  renderSlide(ctx, { project, slide: project.slides[job.slideIndex], lang: job.lang, target: job.target, images });
  const pixels = ctx.getImageData(0, 0, width, height).data;
  return encodeRGB(pixels, width, height);
}

export async function exportZip(project: Project, images: Map<string, ImageSource>, jobs: Job[], onProgress?: Progress): Promise<Uint8Array> {
  const entries: ZipEntry[] = [{ name: 'README.txt', data: new TextEncoder().encode(README) }];
  for (let i = 0; i < jobs.length; i++) {
    entries.push({ name: jobs[i].path, data: await renderPNG(project, jobs[i], images) });
    onProgress?.(i + 1, jobs.length);
    // let the page repaint the progress bar between big images
    await new Promise((r) => setTimeout(r, 0));
  }
  return zip(entries);
}
