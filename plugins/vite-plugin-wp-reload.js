/**
 * WP テーマの PHP を保存したら、Vite 経由で開いているブラウザ（WP 含む）をリロードする。
 * chokidar v4 はグロブ非対応なので、ディレクトリをそのまま watch する。
 */
export default function wpReload({ dir }) {
  return {
    name: 'wp-reload',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(dir);
      server.watcher.on('change', (file) => {
        if (file.endsWith('.php')) server.ws.send({ type: 'full-reload', path: '*' });
      });
    },
  };
}
