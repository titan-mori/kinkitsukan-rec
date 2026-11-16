import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * 画像は Vite のアセット処理に通さず、このプラグインで扱う。
 *  - 元画像: src/images/**（jpg / png / svg / gif / webp）
 *  - HTML・PHP・SCSS からは「出力後の名前」で参照する（jpg/png は .webp で書く）
 *  - dev   : /assets/img/xxx.webp へのリクエストに、元の jpg/png をその場で webp 変換して返す
 *  - build : scripts/build-images.mjs を別プロセスで実行して outDir に書き出す
 *            （sharp を Rollup と同じプロセスで動かすと Windows で落ちることがあるため）
 */
const SCRIPT = fileURLToPath(new URL('../scripts/build-images.mjs', import.meta.url));
const TYPES = { '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp' };

export default function images({ srcDir, outDir, urlPrefix }) {
  return {
    name: 'images',

    configureServer(server) {
      const cache = new Map(); // srcPath -> { mtimeMs, buf }

      server.middlewares.use(async (req, res, next) => {
        try {
          const pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (!pathname.startsWith(urlPrefix)) return next();
          const rel = pathname.slice(urlPrefix.length);
          const ext = path.extname(rel).toLowerCase();

          // そのまま存在するファイル（svg / gif / webp）
          const direct = path.join(srcDir, rel);
          if (TYPES[ext] && fs.existsSync(direct)) {
            res.setHeader('Content-Type', TYPES[ext]);
            res.setHeader('Access-Control-Allow-Origin', '*');
            fs.createReadStream(direct).pipe(res);
            return;
          }

          // .webp → 元の jpg / png を変換
          if (ext === '.webp') {
            const base = rel.slice(0, -ext.length);
            for (const e of ['.jpg', '.jpeg', '.png']) {
              const src = path.join(srcDir, base + e);
              if (!fs.existsSync(src)) continue;
              const { mtimeMs } = fs.statSync(src);
              let hit = cache.get(src);
              if (!hit || hit.mtimeMs !== mtimeMs) {
                const { default: sharp } = await import('sharp');
                hit = { mtimeMs, buf: await sharp(src).webp({ quality: 80 }).toBuffer() };
                cache.set(src, hit);
              }
              res.setHeader('Content-Type', 'image/webp');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(hit.buf);
              return;
            }
          }
          next();
        } catch (err) {
          next(err);
        }
      });

      // 画像の追加・差し替えでリロード
      const reload = (file) => {
        if (path.resolve(file).startsWith(path.resolve(srcDir))) {
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
    },

    closeBundle() {
      const r = spawnSync(process.execPath, [SCRIPT, srcDir, outDir], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('[images] build-images.mjs failed');
    },
  };
}
