import path from 'node:path';
import { syncAll, SITE_JSON_SRC, INTERVIEW_SRC } from '../scripts/wp-sync.mjs';

/**
 * 静的版のデータを WP テーマへ自動で書き出す（中身は scripts/wp-sync.mjs）
 *  - 開発サーバー起動時・ビルド開始時に 1 回
 *  - 開発中は src/data/site.json と src/interview/interviewXX/index.html を保存するたびに
 * 書き出した PHP の変更は vite-plugin-wp-reload.js がブラウザのリロードにつなぐ
 * 失敗しても開発サーバーは止めず、ターミナルにエラーを出す
 */
export default function wpSync() {
  const run = (logger, label) => {
    try {
      const { site, interviews } = syncAll();
      const done = [site && 'inc/site-data.php', ...interviews.map((f) => `interview-data/${f}`)].filter(Boolean);
      if (done.length) logger.info(`[wp-sync] ${label}: ${done.join('、')} を WP テーマへ書き出しました`, { timestamp: true });
    } catch (e) {
      logger.error(`[wp-sync] ${e.message}`, { timestamp: true });
    }
  };

  const isTarget = (file) => {
    const f = path.resolve(file);
    return f === SITE_JSON_SRC || (f.startsWith(INTERVIEW_SRC) && /[\\/]interview\d+[\\/]index\.html$/.test(f));
  };

  let logger = console;

  return {
    name: 'wp-sync',

    configResolved(config) {
      logger = config.logger;
    },

    buildStart() {
      run(logger, '起動時');
    },

    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (isTarget(file)) run(logger, path.basename(path.dirname(file)) === 'data' ? 'site.json' : path.basename(path.dirname(file)));
      });
    },
  };
}
