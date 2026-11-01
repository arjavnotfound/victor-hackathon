// Small helpers shared by the phone pages.
import { APP_NAME } from './config.js';
import { fillIcons } from './icons.js';

export const $ = (id) => document.getElementById(id);
export const isDemo = new URLSearchParams(location.search).has('demo');
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Set the tab title, draw the icons, collapse the large title into the nav
 * bar on scroll, and keep ?demo=1 on every link inside the app so the
 * simulated camera carries through the whole flow.
 */
export function initPage(title) {
  document.title = title ? `${APP_NAME} · ${title}` : APP_NAME;
  for (const el of document.querySelectorAll('[data-app-name]')) el.textContent = APP_NAME;
  fillIcons();
  collapseTitle();
  if (!isDemo) return;
  for (const a of document.querySelectorAll('a[href]')) {
    if (a.origin !== location.origin) continue; // tel: links and other sites
    if (a.pathname.endsWith('challenge.html')) continue; // the Wi-Fi page has its own sample data
    a.search = 'demo=1';
  }
}

/** The small centred nav title appears once the large title scrolls away. */
function collapseTitle() {
  const nav = document.querySelector('.nav'), large = document.querySelector('.large');
  if (!nav || !large || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => nav.classList.toggle('scrolled', !e.isIntersecting), {
    rootMargin: `-${nav.offsetHeight}px 0px 0px 0px`,
  }).observe(large);
}

// ---------- bottom sheets ----------

let backdrop = null, openOne = null;

/** Open a sheet (an element with class "sheet"). Tapping the dim area or swiping down closes it. */
export function openSheet(sheet, onClose) {
  if (openOne && openOne !== sheet) closeSheet();
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => closeSheet());
    document.body.append(backdrop);
  }
  if (!sheet.dataset.wired) wireDrag(sheet);
  sheet._onClose = onClose;
  sheet.hidden = false;
  requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); });
  openOne = sheet;
}

export function closeSheet() {
  const s = openOne;
  if (!s) return;
  openOne = null;
  backdrop.classList.remove('open');
  s.classList.remove('open');
  s.style.transform = '';
  s._onClose?.();
}

/** Drag the sheet down from its top area; let go past 100 px (or flick) to close. */
function wireDrag(sheet) {
  sheet.dataset.wired = '1';
  let y0 = null, t0 = 0, dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    // Only start a drag from the top of a sheet that is scrolled to the top.
    if (sheet.scrollTop > 0 || e.touches[0].clientY - sheet.getBoundingClientRect().top > 64) return;
    y0 = e.touches[0].clientY; t0 = performance.now(); dy = 0;
    sheet.classList.add('dragging');
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.classList.remove('dragging');
    const fast = dy / (performance.now() - t0) > 0.6;
    y0 = null;
    if (dy > 100 || (fast && dy > 30)) closeSheet();
    else sheet.style.transform = '';
  });
}

/** Buttons with data-sheet="id" open that sheet; [data-close] inside a sheet closes it. */
export function wireSheetButtons() {
  for (const b of document.querySelectorAll('[data-sheet]')) {
    const sheet = $(b.dataset.sheet);
    b.addEventListener('click', () => {
      if (openOne === sheet) return closeSheet();
      b.setAttribute('aria-pressed', 'true');
      openSheet(sheet, () => b.setAttribute('aria-pressed', 'false'));
    });
  }
  for (const c of document.querySelectorAll('[data-close]')) c.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
}

/** Count a number up or down smoothly to `to`. */
export function animateNumber(el, to, { ms = 400, fmt = (v) => Math.round(v) } = {}) {
  const from = Number(el.dataset.v ?? to);
  el.dataset.v = to;
  if (reduced() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Mark list rows so they fade in one after another. */
export function stagger(list) {
  list.classList.add('stagger');
  [...list.children].forEach((li, i) => li.style.setProperty('--i', i));
}

/** "today, 8:49 AM", "yesterday, 9:02 PM" or "28 Oct, 8:49 AM". */
export function when(iso) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
