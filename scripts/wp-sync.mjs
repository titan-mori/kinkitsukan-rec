// 静的版のデータを WP テーマ（wp/themes/kinkirec）へ書き出す
//   使い方: npm run wp:sync（Vite 起動中は保存のたびに plugins/vite-plugin-wp-sync.js が自動で実行）
//
//   1. 共通データ: src/data/site.json → wp/themes/kinkirec/inc/site-data.php（PHP の配列＋kinkirec_site()）
//   2. 社員インタビュー原稿: src/interview/interviewXX/index.html の `const d = {...};`
//                           → wp/themes/kinkirec/interview-data/interviewXX.php（PHP の配列）
// 書き出した PHP は自動生成なので直接編集しない（直すのは src/ 側）。本番サーバーには PHP だけが要る（site.json は不要）
//
// HTML の構造（マークアップ）は自動では反映しない。差分は npm run wp:check で確認して PHP を直す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(ROOT, 'src');
export const THEME = path.join(ROOT, 'wp/themes/kinkirec');

export const SITE_JSON_SRC = path.join(SRC, 'data/site.json');
export const SITE_PHP_DEST = path.join(THEME, 'inc/site-data.php');
export const INTERVIEW_SRC = path.join(SRC, 'interview');
const INTERVIEW_DEST = path.join(THEME, 'interview-data');

/** 中身が同じなら書かない（保存のたびに PHP の更新日時が変わってリロードが走らないように） */
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ---- PHP の配列リテラルを作る
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function toPhp(value, indent = '') {
  const next = `${indent}\t`;
  if (Array.isArray(value) && !value.length) return 'array()';
  if (Array.isArray(value)) {
    return `array(\n${value.map((v) => `${next}${toPhp(v, next)},`).join('\n')}\n${indent})`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    const width = Math.max(...keys.map((k) => q(k).length));
    return `array(\n${keys.map((k) => `${next}${q(k).padEnd(width)} => ${toPhp(value[k], next)},`).join('\n')}\n${indent})`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return q(value);
}

/**
 * 1. 共通データ：site.json の内容から inc/site-data.php の中身を作る（wp:check の同期確認でも使う）
 * @returns {string}
 */
export function renderSiteDataPhp() {
  const site = JSON.parse(fs.readFileSync(SITE_JSON_SRC, 'utf8'));
  return `<?php
/**
 * サイト共通データ（ナビ・社員インタビュー・フォームの URL など）
 *
 * npm run wp:sync で src/data/site.json から自動生成（Vite 起動中は site.json を保存したときに自動）。直接編集しないこと。
 * href はサイトルートからの相対パスで書き、出力時に kinkirec_url() で URL にする。
 */

defined( 'ABSPATH' ) || exit;

/**
 * サイト共通データを返す
 *
 * @param string|null $key 省略時は全体。'nav' / 'interviews' / 'entry' / 'corporateUrl' / 'privacyUrl' など
 * @return mixed
 */
function kinkirec_site( $key = null ) {
	static $site = ${toPhp(site, '\t')};

	if ( null === $key ) {
		return $site;
	}

	return isset( $site[ $key ] ) ? $site[ $key ] : null;
}
`;
}

/**
 * 1. 共通データ：inc/site-data.php を書き出す
 * @returns {boolean} 書き換えたか
 */
export function syncSiteData() {
  return writeIfChanged(SITE_PHP_DEST, renderSiteDataPhp());
}

/**
 * 2. 社員インタビュー原稿を PHP に変換
 *   原稿の中の root（サイトルートへの相対パス）は空文字として評価する
 *   → special.href などは「サイトルートからのパス」になり、テンプレートが kinkirec_url() で URL にする
 * @returns {string[]} 書き換えたファイル名
 */
export function syncInterviews() {
  const changed = [];
  const dirs = fs.readdirSync(INTERVIEW_SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^interview\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();

  for (const slug of dirs) {
    const file = path.join(INTERVIEW_SRC, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const m = html.match(/const d = (\{[\s\S]*?\n {2}\});/);
    if (!m) throw new Error(`${path.relative(ROOT, file)}: 原稿（const d = {...};）が見つかりません`);

    let d;
    try {
      d = new Function('root', `return ${m[1]};`)('');
    } catch (e) {
      throw new Error(`${path.relative(ROOT, file)}: 原稿を読めません（${e.message}）`);
    }
    if (d.slug !== slug) throw new Error(`${path.relative(ROOT, file)}: d.slug（${d.slug}）がフォルダ名（${slug}）と違います`);

    // 原稿ファイル内の // コメントは PHP のコメントへ引き継ぐ
    const notes = [...html.matchAll(/^\s*\/\/ (.*)$/gm)].map((x) => ` * ${x[1]}`).join('\n');
    const php = `<?php
/**
 * 社員インタビュー詳細の原稿（npm run wp:sync で src/interview/${slug}/index.html から自動生成。直接編集しないこと）
 * page-templates/interview-detail.php が読み込む。項目の説明は template-parts/interview-detail.php を参照
${notes}
 */

defined( 'ABSPATH' ) || exit;

return ${toPhp(d)};
`;
    if (writeIfChanged(path.join(INTERVIEW_DEST, `${slug}.php`), php)) changed.push(`${slug}.php`);
  }
  return changed;
}

/** まとめて実行（CLI・Vite プラグイン共通） */
export function syncAll() {
  const site = syncSiteData();
  const interviews = syncInterviews();
  return { site, interviews };
}

// ---- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { site, interviews } = syncAll();
    console.log(`共通データ（inc/site-data.php）: ${site ? '更新しました' : '変更なし'}`);
    console.log(`社員インタビュー原稿（interview-data/）: ${interviews.length ? `${interviews.join('、')} を更新しました` : '変更なし'}`);
  } catch (e) {
    console.error(`wp:sync に失敗しました: ${e.message}`);
    process.exit(1);
  }
}
