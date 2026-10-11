import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { devShot } from './dev/vite-plugin-dev-shot.js';

// 開発サーバーだけ：POST /__save?name=<名前> で、送られた中身を shots/<名前> にそのまま保存（音の書き出し確認用）
function devSave() {
  return {
    name: 'dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') || 'out.bin';
        const safe = name.split('/').map((s) => s.replace(/[^\w.-]/g, '_')).join('/');
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const file = path.join(process.cwd(), 'shots', safe);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, Buffer.concat(chunks));
          res.end(path.relative(process.cwd(), file));
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [devShot(), devSave()],
  server: { host: '127.0.0.1', port: 5183 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
