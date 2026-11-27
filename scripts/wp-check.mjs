// 静的版（Vite）と WP（Local）の HTML を全ページ比べ、WP テンプレートに反映されていない差分を表示する
//   使い方: npm run wp:check            … 全ページ
//           npm run wp:check -- jobs/   … ページを指定（複数可）
//   前提: Vite（npm run dev）と Local のサイトが起動していること
//
// 比べるのは <header> <main> <footer> の中身。次の「想定どおりの違い」は比べる前にそろえる（＝差分として出さない）
//   - URL の書き方（静的版の ../assets/ ・ ../ と、WP の https://〜/ ・ http://localhost:5173/assets/）
//   - 属性値のエスケープ（&#039; &#038; など）、<br /> と <br>
//   - フォーム本体（静的版の <form> と CF7 の出力は別物なので、両方とも [FORM] に置き換える）
//   - 募集要項カードのリンク先（静的版は仮の # など、WP は実際の詳細ページ）、応募ボタンの ?job_id= の値
//   - 送信完了ページの「@〇〇〇〇」（WP は実際の送信元ドメイン）
// 終了コード: 差分なし 0 / 差分あり 1 / 取得できない 2
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { renderSiteDataPhp, SITE_PHP_DEST } from './wp-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE_ORIGIN = process.env.VITE_ORIGIN || 'http://localhost:5173';
// WP の URL は vite.config.js の WP_ORIGIN と同じものを使う
const WP_ORIGIN = process.env.WP_ORIGIN
  || (fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8').match(/const WP_ORIGIN = '([^']+)'/) || [])[1];

// ---- 取得（Local の https は自己署名証明書なので、検証しない。ローカル確認専用）
function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, headers: { 'Cache-Control': 'no-cache' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('タイムアウト')));
  });
}

// ---- 比べる前にそろえる
function normalize(html, tag) {
  const i = html.search(new RegExp(`<${tag}[ >]`));
  if (i < 0) return null;
  const j = html.indexOf(`</${tag}>`, i);
  let s = html.slice(i, j + tag.length + 3);

  s = s
    .replace(/<!--[\s\S]*?-->/g, '')
    // フォーム本体
    .replace(/<div class="wpcf7 [\s\S]*?<\/form>\s*<\/div>/g, '[FORM]')
    .replace(/<form class="c-form"[\s\S]*?<\/form>/g, '[FORM]')
    // エスケープ
    .replace(/&#0?39;/g, "'").replace(/&#0?38;|&amp;/g, '&')
    // URL
    .replace(/https?:\/\/localhost:\d+\/assets\//g, '@/')
    .replace(/(?:\.\.\/)+assets\/|\.\/assets\//g, '@/')
    .replace(new RegExp(`${WP_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'g'), '@/')
    .replace(/(href|src|srcset)="(?:\.\.\/)+/g, '$1="@/')
    .replace(/(href|src|srcset)="\.\//g, '$1="@/')
    // 想定どおりの違い
    .replace(/(class="c-job-card" href=")[^"]*"/g, '$1(募集要項の詳細)"')
    .replace(/\?job_id=\d+/g, '?job_id=(ID)')
    .replace(/「@[^」]*」/g, '「@(送信元ドメイン)」')
    // 空白・自己終了タグ
    .replace(/\s*\/>/g, '>')
    .replace(/\s+/g, ' ').replace(/>\s+/g, '>').replace(/\s+</g, '<');

  return s.replace(/></g, '>\n<').split('\n');
}

// ---- 行の差分（LCS）
function diff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--) {
    dp[x][y] = a[x] === b[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
  }
  const out = [];
  let x = 0, y = 0;
  while (x < n || y < m) {
    if (x < n && y < m && a[x] === b[y]) { x++; y++; continue; }
    // 同じ長さなら静的版の行（-）を先に出す
    if (x < n && (y >= m || dp[x + 1][y] >= dp[x][y + 1])) out.push(`- ${a[x++]}`);
    else out.push(`+ ${b[y++]}`);
  }
  return out;
}

// ---- ページ一覧（src/**/index.html。_ で始まるフォルダは除く）
const pages = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => p.replace(/^\/|index\.html$/g, ''))
  : fg.sync('**/index.html', { cwd: path.join(ROOT, 'src'), ignore: ['partials/**', 'images/**', '**/_*/**', '_*/**'] })
    .map((f) => f.replace(/index\.html$/, ''))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

// ---- 共通データ・原稿の同期確認（npm run wp:sync を忘れていないか）
function checkSync() {
  const notes = [];
  try {
    if (!fs.existsSync(SITE_PHP_DEST) || fs.readFileSync(SITE_PHP_DEST, 'utf8') !== renderSiteDataPhp()) notes.push('inc/site-data.php が src/data/site.json の内容と違います');
  } catch (e) {
    notes.push(`src/data/site.json を読めません（${e.message}）`);
  }
  for (const dir of fg.sync('interview/interview*/index.html', { cwd: path.join(ROOT, 'src') })) {
    const slug = dir.split('/')[1];
    const php = path.join(ROOT, `wp/themes/kinkirec/interview-data/${slug}.php`);
    if (!fs.existsSync(php) || fs.statSync(php).mtimeMs < fs.statSync(path.join(ROOT, 'src', dir)).mtimeMs) notes.push(`interview-data/${slug}.php が原稿より古い可能性があります`);
  }
  return notes;
}

// ---- 実行
if (!WP_ORIGIN) {
  console.error('WP の URL が分かりません（vite.config.js の WP_ORIGIN か、環境変数 WP_ORIGIN を設定してください）');
  process.exit(2);
}
console.log(`静的版 ${VITE_ORIGIN}  ↔  WP ${WP_ORIGIN}\n`);

const syncNotes = checkSync();
if (syncNotes.length) {
  console.log('⚠ 同期されていないデータがあります（npm run wp:sync を実行してください）');
  syncNotes.forEach((n) => console.log(`  - ${n}`));
  console.log('');
}

let ng = 0, error = 0;
for (const page of pages) {
  const label = `/${page}`.padEnd(26);
  let st, wp;
  try {
    [st, wp] = await Promise.all([get(`${VITE_ORIGIN}/${page}`), get(`${WP_ORIGIN}/${page}`)]);
  } catch (e) {
    console.log(`${label} 取得できません（${e.message}）。Vite と Local は起動していますか？`);
    error++;
    continue;
  }
  if (st.status !== 200 || wp.status !== 200) {
    console.log(`${label} 取得できません（静的版 ${st.status} / WP ${wp.status}）${wp.status === 404 ? '。WP に固定ページがありますか？' : ''}`);
    error++;
    continue;
  }

  const results = [];
  for (const tag of ['header', 'main', 'footer']) {
    const a = normalize(st.body, tag), b = normalize(wp.body, tag);
    if (!a || !b) { results.push({ tag, lines: [`  <${tag}> がありません（静的版 ${a ? 'あり' : 'なし'} / WP ${b ? 'あり' : 'なし'}）`] }); continue; }
    const d = diff(a, b);
    if (d.length) results.push({ tag, lines: d });
  }

  if (!results.length) {
    console.log(`${label} ✓ 一致`);
    continue;
  }
  ng++;
  console.log(`${label} ✗ 差分あり（- 静的版にだけある行 / + WP にだけある行）`);
  for (const { tag, lines } of results) {
    console.log(`    <${tag}>`);
    lines.slice(0, 30).forEach((l) => console.log(`      ${l.length > 220 ? `${l.slice(0, 220)}…` : l}`));
    if (lines.length > 30) console.log(`      …ほか ${lines.length - 30} 行`);
  }
}

console.log(`\n${pages.length} ページ中 一致 ${pages.length - ng - error} / 差分あり ${ng}${error ? ` / 取得できない ${error}` : ''}`);
process.exit(error ? 2 : ng ? 1 : 0);
