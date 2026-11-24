import Swiper from 'swiper';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import flatpickr from 'flatpickr';
import { Japanese } from 'flatpickr/dist/l10n/ja.js';
import 'flatpickr/dist/flatpickr.css';
import JapaneseHolidays from 'japanese-holidays';
import '../scss/style.scss';
import { lenis, gsap } from './lenis.js';

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
  const header = btn.closest('[data-header]');

  // アコーディオン：最初は全部閉じる。1つ開くと他は閉じる
  const toggles = [...nav.querySelectorAll('[data-drawer-toggle]')];
  const setAccordion = (toggle, open) => {
    toggle.setAttribute('aria-expanded', String(open));
    document.getElementById(toggle.getAttribute('aria-controls')).classList.toggle('is-open', open);
  };
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggles.forEach((t) => setAccordion(t, t === toggle ? open : false));
    });
  });

  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    header?.classList.toggle('is-menu-open', open);
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
 * 社員インタビュー導線（c-people-link）の SP 写真スライダー
 *  - スワイプのみ・ループなし・自動再生なし（ユーザー指定）。PC は1枚画像なので Swiper を外す
 *  - 写真の間はデザイン 18px を CSS の svw() と同じ比率で拡大縮小
 */
function initPeopleLinkSwiper() {
  const el = document.querySelector('[data-people-link-swiper]');
  if (!el) return;
  const pcQuery = window.matchMedia('(min-width: 897px)');
  // デザイン px を CSS の svw() と同じ比率に（375px で等倍、540px で拡大を止める）
  const sp = (px) => px * Math.min(window.innerWidth / 375, 540 / 375);
  let swiper = null;

  const toggle = () => {
    if (pcQuery.matches) {
      swiper?.destroy(true, true);
      swiper = null;
    } else if (!swiper) {
      swiper = new Swiper(el, {
        slidesPerView: 'auto',
        spaceBetween: sp(18),
        // 1枚目の左端・最後の右端を見出しと同じ 15px 内側にそろえる
        slidesOffsetBefore: sp(15),
        slidesOffsetAfter: sp(15),
        on: {
          beforeResize(s) {
            s.params.spaceBetween = sp(18);
            s.params.slidesOffsetBefore = sp(15);
            s.params.slidesOffsetAfter = sp(15);
          },
        },
      });
    }
  };

  toggle();
  pcQuery.addEventListener('change', toggle);
}

/**
 * よくある質問（c-faq）：<details> の開閉に高さのアニメーションを付ける
 *  - summary のクリック（Enter / Space も click になる）で既定の開閉を止め、details の高さを動かす
 *  - 開く：open を付けてから「質問だけの高さ → 全体の高さ」。閉じる：逆に動かしてから open を外す
 *  - 動きを減らす設定のときはアニメーションなし（ブラウザ標準の開閉）
 */
function initFaq() {
  const duration = 400;
  const easing = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

  document.querySelectorAll('.c-faq__item').forEach((item) => {
    const summary = item.querySelector('summary');
    let anim = null;

    const animate = (from, to, onFinish) => {
      anim?.cancel();
      item.style.overflow = 'hidden';
      anim = item.animate({ height: [`${from}px`, `${to}px`] }, { duration, easing });
      anim.onfinish = () => {
        anim = null;
        item.style.overflow = '';
        onFinish?.();
      };
    };

    summary.addEventListener('click', (e) => {
      if (reducedMotion.matches) return;
      e.preventDefault();
      const start = item.offsetHeight; // アニメーション途中で押されたら、今の高さから動かす
      anim?.cancel(); // 行き先の高さを測る前に、動いている途中のアニメーションを外す

      if (!item.open || item.classList.contains('is-closing')) {
        item.classList.remove('is-closing');
        item.open = true;
        animate(start, item.offsetHeight);
      } else {
        item.classList.add('is-closing');
        animate(start, summary.offsetHeight, () => {
          item.open = false;
          item.classList.remove('is-closing');
        });
      }
    });
  });
}

/**
 * フォームのファイル選択：選んだファイル名を表示する（c-form__file）
 */
function initFileInput() {
  document.querySelectorAll('[data-file]').forEach((wrap) => {
    const input = wrap.querySelector('input[type="file"]');
    const name = wrap.querySelector('[data-file-name]');
    if (!input || !name) return;
    const empty = name.textContent;

    input.addEventListener('change', () => {
      const files = [...input.files].map((file) => file.name);
      name.textContent = files.length ? files.join('、') : empty;
      name.classList.toggle('is-selected', files.length > 0);
    });
  });
}

/**
 * 応募フォーム（静的版）：募集要項詳細から来たとき（?job_id=投稿 ID）、その職種を選んだ状態にする
 *  - radio の data-job-id と照合。該当がない（募集終了など）ときは初期状態（先頭を選択）のまま
 *  - WP 化後は CF7 のフィルターでサーバー側から初期選択するので、この処理は使わない
 */
function initEntryJob() {
  const group = document.querySelector('[data-entry-job]');
  const id = new URLSearchParams(location.search).get('job_id');
  if (!group || !id) return;

  const radio = group.querySelector(`input[type="radio"][data-job-id="${CSS.escape(id)}"]`);
  if (radio) radio.checked = true;
}

/**
 * フォームの日付選択（flatpickr）：職場見学・カジュアル面談の希望日
 *  - 選べるのは「今日から7日後以降」の平日だけ（土日・祝日はカレンダー上でグレーアウト）
 *    祝日は japanese-holidays で計算（振替休日・国民の休日を含む。法改正・臨時の祝日はパッケージ更新で反映）
 *  - 元の input（CF7 の [date]）は hidden にして Y-m-d で送り、表示用の欄に「2026年12月3日（木）」を出す
 *  - スマホも同じカレンダーを使う（標準のカレンダーだと土日を選べてしまうため）
 *  - 年末年始・お盆などの会社の休業日は未対応（WP 化時に管理画面で指定できるようにする予定）
 *  - 送信時の土日・祝日・日付チェックは WP 化時に CF7 のフィルターでも行う
 */
function initDatepicker() {
  const inputs = document.querySelectorAll('[data-datepicker]');
  if (!inputs.length) return;

  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);
  minDate.setDate(minDate.getDate() + 7);

  inputs.forEach((input) => {
    flatpickr(input, {
      locale: Japanese,
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'Y年n月j日（D）',
      altInputClass: `${input.className} c-form__datepicker`,
      minDate,
      disable: [(date) => date.getDay() === 0 || date.getDay() === 6 || Boolean(JapaneseHolidays.isHoliday(date))],
      disableMobile: true,
      onReady(_dates, _str, fp) {
        const alt = fp.altInput;
        // 読み上げ用のラベル・補足を表示用の欄へ移す
        ['aria-label', 'aria-describedby'].forEach((attr) => {
          if (input.hasAttribute(attr)) alt.setAttribute(attr, input.getAttribute(attr));
        });
        // readonly だとブラウザの必須チェックが効かないので外し、代わりに文字入力を止める
        alt.readOnly = false;
        alt.inputMode = 'none';
        alt.autocomplete = 'off';
        alt.addEventListener('beforeinput', (e) => e.preventDefault());
        alt.addEventListener('paste', (e) => e.preventDefault());
      },
    });
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

// ================================================================
// 数字のカウントアップ（[data-count-up]。会社を知る「数字で見る近畿通関」）
//  - 親の [data-count-up-trigger]（なければ要素自身）の上端が画面の 80% まで来たら、
//    0 → 書かれている値まで数える（1回だけ。まとめて同時に動く）
//  - 小数（17.5）は小数の桁数を、"00" のような先頭ゼロは桁数を保つ
//  - 数えている間に幅が変わって単位が動かないよう、最終値の幅を min-width（em）で確保して右揃え
//  - 読み上げは最終値の隠しテキストで行い、動く数字は aria-hidden
//  - 「視差効果を減らす」設定の人には何もしない（最初から最終値）
// ================================================================
function initCountUp() {
  const els = document.querySelectorAll('[data-count-up]');
  if (!els.length || reducedMotion.matches) return;

  els.forEach((el) => {
    const text = el.textContent.trim();
    const target = parseFloat(text);
    if (Number.isNaN(target)) return;

    const decimals = (text.split('.')[1] || '').length;
    const padLength = /^0\d/.test(text) ? text.length : 0; // "00" のように先頭ゼロがあるときだけ桁をそろえる
    const format = (v) => (decimals ? v.toFixed(decimals) : String(Math.round(v)).padStart(padLength, '0'));

    const sr = document.createElement('span');
    sr.className = 'u-visually-hidden';
    sr.textContent = text;
    el.after(sr);
    el.setAttribute('aria-hidden', 'true');

    const fontSize = parseFloat(getComputedStyle(el).fontSize);
    el.style.display = 'inline-block';
    el.style.minWidth = `${el.getBoundingClientRect().width / fontSize}em`;
    el.style.textAlign = 'right';
    el.textContent = format(0);

    const counter = { value: 0 };
    gsap.to(counter, {
      value: target,
      duration: 1.6,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = format(counter.value);
      },
      scrollTrigger: { trigger: el.closest('[data-count-up-trigger]') || el, start: 'top 80%', once: true },
    });
  });
}

// ================================================================
// 下から色が満ちる（[data-fill-up]。会社を知る 男女比の人型）
//  - style の --fill（例：81%）を 0% → その値までアニメーション（背景グラデーションの境目）
//  - 開始タイミング・時間はカウントアップと同じ（親の [data-count-up-trigger] が画面の 80% に来たら）
//  - 「視差効果を減らす」設定の人には何もしない（最初から塗られた状態）
// ================================================================
function initFillUp() {
  const els = document.querySelectorAll('[data-fill-up]');
  if (!els.length || reducedMotion.matches) return;

  els.forEach((el) => {
    const target = el.style.getPropertyValue('--fill').trim();
    if (!target) return;

    gsap.fromTo(el, { '--fill': '0%' }, {
      '--fill': target,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: el.closest('[data-count-up-trigger]') || el, start: 'top 80%', once: true },
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('is-loaded');
  initMvScenes();
  initHeader();
  initMenu();
  initModal();
  initPeopleSwiper();
  initPeopleLinkSwiper();
  initFaq();
  initTabs();
  initJobsNav();
  initFileInput();
  initEntryJob();
  initDatepicker();
  initCountUp();
  initFillUp();
});
