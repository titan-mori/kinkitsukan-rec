// 使い方: node scripts/build-images.mjs <srcDir> <outDir>
// jpg / png → webp、svg → svgo で最適化、gif / webp → そのままコピー
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import sharp from 'sharp';
import { optimize } from 'svgo';

sharp.cache(false);
sharp.concurrency(1);

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('usage: node scripts/build-images.mjs <srcDir> <outDir>');
  process.exit(1);
}

const RASTER = new Set(['.jpg', '.jpeg', '.png']);
const COPY = new Set(['.gif', '.webp']);
let count = 0;

if (fs.existsSync(srcDir)) {
  for (const rel of fg.sync('**/*', { cwd: srcDir, onlyFiles: true })) {
    const src = path.join(srcDir, rel);
    const ext = path.extname(rel).toLowerCase();
    const base = rel.slice(0, -path.extname(rel).length);
    const dest = (e) => {
      const p = path.join(outDir, base + e);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      return p;
    };

    if (RASTER.has(ext)) {
      await sharp(src).webp({ quality: 80 }).toFile(dest('.webp'));
    } else if (ext === '.svg') {
      fs.writeFileSync(dest('.svg'), optimize(fs.readFileSync(src, 'utf8'), { path: src }).data);
    } else if (COPY.has(ext)) {
      fs.copyFileSync(src, dest(ext));
    } else {
      continue;
    }
    count++;
  }
}

console.log(`[images] ${count} files -> ${path.relative(process.cwd(), outDir)}`);
