import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(root, '../../..');
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const { createServer } = await import(pathToFileURL(vitestRequire.resolve('vite')).href);
const server = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  resolve: {
    alias: { '@': path.join(workspace, 'src'), 'next/image': path.join(root, 'test-image.tsx') },
  },
  server: { host: '127.0.0.1', port: 3101, strictPort: true, fs: { allow: [workspace] } },
});
await server.listen();
server.printUrls();
