import { context, build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const options = {
  entryPoints: ['src/ui/main.ts'],
  outfile: 'site/main.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !process.argv.includes('--watch'),
  sourcemap: process.argv.includes('--watch'),
  logLevel: 'info',
};

mkdirSync('site', { recursive: true });
const copy = () => {
  cpSync('app/index.html', 'site/index.html');
  cpSync('app/style.css', 'site/style.css');
};
copy();

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
