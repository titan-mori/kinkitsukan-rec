import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * 慣性スクロール（Lenis）＋ GSAP ScrollTrigger の連携
 *  - スマホ・タブレット（指で操作する端末）では Lenis を使わない → lenis は null。
 *    ネイティブのスクロールのまま ScrollTrigger が動く
 *  - Lenis の更新は GSAP の ticker で回す（autoRaf は使わない）→ アニメーションとスクロールのコマずれを防ぐ
 *  - Lenis がスクロールするたびに ScrollTrigger を更新
 *  - 「視差効果を減らす」設定の人には Lenis 側で慣性を無効化（respectReducedMotion: 既定 true）
 *  - ページ内リンク（anchors）は html の scroll-padding-top（固定ヘッダーの高さ）を考慮して止まる
 *
 * 他のモジュールからは lenis?.stop() / lenis?.start() でスクロールを止める・再開する（スマホでは null なので ?. を付ける）。
 * GSAP のアニメーションは `import { gsap, ScrollTrigger } from './lenis.js'` で読み込む。
 */
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

export const lenis = isTouchDevice ? null : new Lenis({ anchors: true });

if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000); // GSAP は秒、Lenis はミリ秒
  });
  gsap.ticker.lagSmoothing(0);
}

export { gsap, ScrollTrigger };
