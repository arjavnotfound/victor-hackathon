// One set of line icons, all drawn on a 24 px grid with the same stroke.
// Pages ask for them with <span data-icon="name"></span>; ui.js fills them in.

const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  lens: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  night: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  wifi: '<path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.4a4 4 0 0 1 6 0"/><circle cx="12" cy="19.5" r=".6"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V20"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  more: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="16" cy="12" r=".6"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v8h14v-8"/>',
  call: '<path d="M5 3.5h4l2 5-2.5 1.5a11 11 0 0 0 5.5 5.5l1.5-2.5 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>',
};

/** SVG markup for one icon. */
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

/** Fill every <... data-icon="name"> in the page. */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
}
