// Small helpers shared by the phone pages.
import { APP_NAME } from './config.js';

export const $ = (id) => document.getElementById(id);
export const isDemo = new URLSearchParams(location.search).has('demo');

/**
 * Fill in the app name, set the tab title, and keep ?demo=1 on every link
 * inside the app so the simulated camera carries through the whole flow.
 */
export function initPage(title) {
  document.title = title ? `${APP_NAME} · ${title}` : APP_NAME;
  for (const el of document.querySelectorAll('[data-app-name]')) el.textContent = APP_NAME;
  if (!isDemo) return;
  for (const a of document.querySelectorAll('a[href]')) {
    if (a.origin !== location.origin) continue; // tel: links and other sites
    if (a.pathname.endsWith('challenge.html')) continue; // the Wi-Fi page has its own sample data
    a.search = 'demo=1';
  }
}
