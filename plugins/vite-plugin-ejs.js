import fs from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';

/**
 * src/**\/*.html の中に書いた EJS を、Vite が HTML を処理する前に展開する。
 *  - include('partials/_header', { page }) で src/partials/ を読み込める
 *  - 全ページに渡す変数
 *      site   … src/data/site.json の内容（サイト名・ナビなど）
 *      root   … ページから見たサイトルートへの相対パス（'./' や '../'）
 *      assets … root + 'assets/'（画像は assets + 'img/xxx.webp'）
 *  - .ejs / site.json を保存したらページ全体をリロード
 */
export default function ejsPages({ root }) {
  const dataFile = path.join(root, 'data/site.json');

  return {
    name: 'ejs-pages',

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const filename = ctx.filename ?? path.join(root, ctx.path);
        const rel = path.relative(path.dirname(filename), root).split(path.sep).join('/');
        const rootPath = rel ? `${rel}/` : './';
        const site = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        return ejs
          .render(
            html,
            { site, root: rootPath, assets: `${rootPath}assets/` },
            { filename, views: [root], cache: false },
          )
          .trimStart();
      },
    },

    configureServer(server) {
      const reload = (file) => {
        if (file.endsWith('.ejs') || path.resolve(file) === dataFile) {
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
    },
  };
}
