import { defineConfig, createLogger } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import * as sass from 'sass';
import ejsPages from './plugins/vite-plugin-ejs.js';
import images from './plugins/vite-plugin-images.js';
import wpReload from './plugins/vite-plugin-wp-reload.js';

// ================================================================
// 環境ごとの設定（ここだけ書き換えればOK）
// ================================================================
const DEV_ORIGIN = 'http://localhost:5173';            // Vite 開発サーバー
const WP_ORIGIN = 'https://kinkitsukan-rec.net';       // Local のサイトURL
const WP_THEME_DIR = 'wp/themes/kinkirec';              // テーマ（Local へシンボリックリンク）

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, 'src');

// 画像は Vite の外（plugins/vite-plugin-images.js）で出力するため、
// CSS の url("../img/...") に出る「didn't resolve at build time」は想定どおり。ログから除外する。
const logger = createLogger();
const isImgWarn = (msg) => msg.includes("didn't resolve at build time") && msg.includes('/img/');
for (const key of ['warn', 'warnOnce']) {
  const original = logger[key];
  logger[key] = (msg, opts) => {
    if (!isImgWarn(msg)) original(msg, opts);
  };
}

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  const isWp = mode === 'wp';

  // 出力先：静的版は dist/（assets/ 配下に css/js/img）、WP版はテーマの assets/ 直下に css/js/img
  const outDir = isWp
    ? path.resolve(__dirname, WP_THEME_DIR, 'assets')
    : path.resolve(__dirname, 'dist');
  const assetsPrefix = isWp ? '' : 'assets/';

  // 静的版は src/**/index.html すべてをエントリに。WP版は main.js だけ。
  const input = isWp
    ? { main: path.resolve(SRC, 'js/main.js') }
    : Object.fromEntries(
        fg
          .sync('**/*.html', { cwd: SRC, ignore: ['partials/**', 'images/**'] })
          .map((file) => [file.replace(/\.html$/, '') || 'index', path.resolve(SRC, file)]),
      );

  return {
    root: SRC,
    base: './',
    // 存在しない URL は 404 に（既定の 'spa' だと TOP の HTML が返り、相対リンクがずれる）
    appType: 'mpa',
    customLogger: logger,
    publicDir: false,
    plugins: [
      ejsPages({ root: SRC }),
      images({
        srcDir: path.resolve(SRC, 'images'),
        outDir: path.resolve(outDir, `${assetsPrefix}img`),
        urlPrefix: '/assets/img/',
      }),
      wpReload({ dir: path.resolve(__dirname, WP_THEME_DIR) }),
    ],
    css: {
      devSourcemap: true,
      preprocessorOptions: {
        scss: {
          // SCSS から画像を参照するときは img('top/bg.webp') を使う。
          //  dev   → http://localhost:5173/assets/img/top/bg.webp（WP上でも同じURLで届く）
          //  build → ../img/top/bg.webp（assets/css/style.css からの相対）
          functions: {
            'img($path)': (args) => {
              const p = args[0].assertString('path').text.replace(/^\//, '');
              const url = isDev ? `${DEV_ORIGIN}/assets/img/${p}` : `../img/${p}`;
              return new sass.SassString(`url("${url}")`, { quotes: false });
            },
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // ブラウザを自動で開く：npm run dev → 静的版 / npm run dev:wp → WP（Local）
      open: isWp ? `${WP_ORIGIN}/` : '/',
      origin: DEV_ORIGIN,
      cors: { origin: WP_ORIGIN },
    },
    build: {
      outDir,
      emptyOutDir: true,
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      minify: false,
      rollupOptions: {
        input,
        output: {
          // ハッシュなし固定ファイル名
          entryFileNames: `${assetsPrefix}js/[name].js`,
          chunkFileNames: `${assetsPrefix}js/[name].js`,
          assetFileNames: (info) => {
            const name = info.names?.[0] ?? info.name ?? '';
            // main.js から import した SCSS は css/style.css に固定
            if (name === 'main.css') return `${assetsPrefix}css/style.css`;
            if (name.endsWith('.css')) return `${assetsPrefix}css/[name][extname]`;
            if (/\.(woff2?|ttf|otf)$/.test(name)) return `${assetsPrefix}fonts/[name][extname]`;
            return `${assetsPrefix}img/[name][extname]`;
          },
        },
      },
    },
  };
});
