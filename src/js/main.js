import Swiper from 'swiper';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import '../scss/style.scss';
import { lenis } from './lenis.js';

// ヘッダーのナビが横並びになる幅（$bp-nav）
const navQuery = window.matchMedia('(min-width: 1024px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * ヘッダー：MV を過ぎたら白背景に切り替え
 */
function initHeader() {
  const header = document.querySelector('[data-header]');
  const mv = document.querySelector('[data-mv]');
  if (!header || !mv) return;

  const observer = new IntersectionObserver(
    ([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting),
    { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` },
  );
  observer.observe(mv);
}

/**
 * SP メニュー（ドロワー）
 */
function initMenu() {
  const btn = document.querySelector('[data-menu-btn]');
  if (!btn) return;
  const nav = document.getElementById(btn.getAttribute('aria-controls'));
  const label = btn.querySelector('[data-menu-label]');

  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('is-menu-open', open);
    label.textContent = open ? 'メニューを閉じる' : 'メニューを開く';
    // 開いている間は背面のページをスクロールさせない
    if (open) lenis?.stop();
    else lenis?.start();
  };

  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      btn.focus();
    }
  });

  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  navQuery.addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

/**
 * モーダル（<dialog>）。動画は data-video-src があれば開いたときに iframe を差し込む
 */
function initModal() {
  document.querySelectorAll('[data-modal-open]').forEach((opener) => {
    const dialog = document.getElementById(opener.dataset.modalOpen);
    if (!dialog) return;
    const video = dialog.querySelector('[data-video-src]');

    // ボタン・背景クリックで閉じるときは close イベントを待たずにスクロールを再開
    // （Esc で閉じたときは下の close イベントで再開）
    const close = () => {
      dialog.close();
      lenis?.start();
    };

    opener.addEventListener('click', () => {
      if (video?.dataset.videoSrc) {
        video.innerHTML = `<iframe src="${video.dataset.videoSrc}" title="コーポレートムービー" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      }
      dialog.showModal();
      lenis?.stop();
    });

    dialog.querySelector('[data-modal-close]')?.addEventListener('click', close);

    // 背景クリックで閉じる
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });

    // 閉じたら動画を止める
    dialog.addEventListener('close', () => {
      lenis?.start();
      if (video?.dataset.videoSrc) video.innerHTML = '';
      opener.focus();
    });
  });
}

/**
 * 社員インタビュー（Swiper）
 *  - 自動再生＋ループ。current（.swiper-slide-active）は PC で大きく表示（CSS 側）
 *  - スライドはループ用に同じ並びを3回出力しているので、番号は実件数（data-total）で割った余り
 *  - SP のページャー（バー＋01 / 04）を current に合わせて更新
 */
function initPeopleSwiper() {
  const el = document.querySelector('[data-people-swiper]');
  if (!el) return;
  const total = Number(el.dataset.total);
  const bar = document.querySelector('[data-people-bar]');
  const count = document.querySelector('[data-people-count]');
  const pad = (n) => String(n).padStart(2, '0');

  bar.style.width = `${100 / total}%`;

  const updatePager = (swiper) => {
    const index = swiper.realIndex % total;
    bar.style.transform = `translateX(${index * 100}%)`;
    count.textContent = `${pad(index + 1)} / ${pad(total)}`;
  };

  // カード間の余白：PC は 40px、SP はデザイン 14px を CSS の svw() と同じ比率で拡大縮小
  // （375px で等倍、540px で拡大を止める。_variables.scss の $sp-design / $sp-scale-max と合わせる）
  const gap = () =>
    window.innerWidth >= 897 ? 40 : 14 * Math.min(window.innerWidth / 375, 540 / 375);

  const swiper = new Swiper(el, {
    modules: [Autoplay],
    loop: true,
    // 2セット目の先頭から始めて、PC で current の左側（3枚分）にもスライドがある状態にする
    initialSlide: total,
    slidesPerView: 'auto',
    spaceBetween: gap(),
    speed: 600,
    loopAdditionalSlides: 4,
    grabCursor: true, // PC でドラッグできることが分かるよう「つかむ」カーソルに
    autoplay: reducedMotion.matches
      ? false
      : { delay: 4000, disableOnInteraction: false, pauseOnMouseEnter: true },
    on: {
      init: updatePager,
      realIndexChange: updatePager,
      // 画面幅が変わったら、再計算の前に余白を更新
      beforeResize(s) {
        s.params.spaceBetween = gap();
      },
    },
  });

  // キーボード操作中は自動再生を止める
  el.addEventListener('focusin', () => swiper.autoplay?.stop());
  el.addEventListener('focusout', () => {
    if (!reducedMotion.matches) swiper.autoplay?.start();
  });
}

/**
 * タブ（WAI-ARIA tablist）。物流を知る：輸出 / 輸入
 *  - クリック・←→・Home・End で切り替え（フォーカス移動と同時に選択）
 */
function initTabs() {
  document.querySelectorAll('[data-tabs]').forEach((root) => {
    const tabs = [...root.querySelectorAll('[data-tab]')];
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));

    const select = (index, focus = false) => {
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      });
      if (focus) tabs[index].focus();
      // パネルの高さが変わるので ScrollTrigger 等の位置を再計算させる
      lenis?.resize();
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (e) => {
        const last = tabs.length - 1;
        const next = {
          ArrowRight: i === last ? 0 : i + 1,
          ArrowLeft: i === 0 ? last : i - 1,
          Home: 0,
          End: last,
        }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(next, true);
      });
    });
  });
}

/**
 * 仕事を知る：職種ナビの現在地
 *  - 画面の縦中央にかかっている職種セクションのリンクに aria-current="true" を付ける
 */
function initJobsNav() {
  const links = [...document.querySelectorAll('[data-jobs-nav] a')];
  if (!links.length) return;

  const setCurrent = (id) => {
    links.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting && setCurrent(entry.target.id)),
    { rootMargin: '-50% 0px -50% 0px' },
  );
  links.forEach((link) => {
    const section = document.getElementById(link.hash.slice(1));
    if (section) observer.observe(section);
  });
}

/**
 * TOP MV：昼 → 夕方 → 夜 をフェードでループ（雲の流れは CSS）
 *  - 昼は HTML で読み込み済み。次のシーンは表示中に先読みし、読み込み完了を待ってからフェード（白抜け防止）
 *  - MV が画面外・タブ非表示の間はループと雲を止める
 *  - 視差効果を減らす設定の場合は昼のまま切り替えない
 */
const MV_ORDER = ['day', 'dusk', 'night']; // ループする順番
const MV_HOLD = 8; // 1つの時間帯を表示しておく秒数
const MV_FADE = 3; // 切り替えのフェード秒数（_top.scss の --mv-fade と合わせる）

function initMvScenes() {
  const root = document.querySelector('[data-mv-scenes]');
  if (!root) return;

  const scenes = Object.fromEntries(
    [...root.querySelectorAll('[data-scene]')].map((el) => [el.dataset.scene, el]),
  );
  const loading = {};
  let current = root.querySelector('.is-active')?.dataset.scene ?? MV_ORDER[0];
  let timer = null;
  let visible = true;

  const nextOf = (name) => MV_ORDER[(MV_ORDER.indexOf(name) + 1) % MV_ORDER.length];

  // シーンの画像を読み込む（2回目以降は同じ Promise を返す）
  const loadScene = (name) => {
    if (loading[name]) return loading[name];
    const el = scenes[name];
    const imgs = [...el.querySelectorAll('img')];
    imgs.forEach((img) => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
    });
    el.classList.add('is-ready'); // 雲画像（CSS 背景）もここで読み込み開始
    loading[name] = Promise.all(imgs.map((img) => img.decode().catch(() => {})));
    return loading[name];
  };

  const showScene = async (name) => {
    await loadScene(name);
    const prev = scenes[current];
    prev.classList.remove('is-active');
    prev.classList.add('is-leaving');
    setTimeout(() => prev.classList.remove('is-leaving'), MV_FADE * 1000);
    scenes[name].classList.add('is-active');
    current = name;
    loadScene(nextOf(name));
  };

  const schedule = () => {
    clearTimeout(timer);
    if (!visible || document.hidden || reducedMotion.matches) return;
    timer = setTimeout(async () => {
      await showScene(nextOf(current));
      schedule();
    }, (MV_HOLD + MV_FADE) * 1000);
  };

  const update = () => {
    root.classList.toggle('is-paused', !visible || document.hidden);
    schedule();
  };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  }).observe(root);
  document.addEventListener('visibilitychange', update);
  reducedMotion.addEventListener('change', update);

  if (!reducedMotion.matches) loadScene(nextOf(current));
}

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('is-loaded');
  initMvScenes();
  initHeader();
  initMenu();
  initModal();
  initPeopleSwiper();
  initTabs();
  initJobsNav();
});
