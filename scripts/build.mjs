import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('public/assets', { recursive: true });

const shared = {
  bundle: true,
  minify: true,
  sourcemap: !process.env.VERCEL && process.env.NODE_ENV !== 'production',
  target: ['safari16.4', 'chrome109'],
  platform: 'browser',
  legalComments: 'none'
};

await Promise.all([
  build({ ...shared, entryPoints: ['src/client/app.js'], outfile: 'public/assets/app.js' }),
  build({ ...shared, entryPoints: ['src/client/history.js'], outfile: 'public/assets/history.js' }),
  build({ ...shared, entryPoints: ['src/client/reset-password.js'], outfile: 'public/assets/reset-password.js' })
]);
