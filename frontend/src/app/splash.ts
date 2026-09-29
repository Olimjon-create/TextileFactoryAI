/**
 * index.html dagi splash (sayt ochilayotgandagi loading) ni yashiradi.
 * Juda tez yuklansa ham splash qisqa vaqt ko'rinadi — "miltillash" bo'lmasligi uchun.
 */
const MIN_VISIBLE_MS = 450;

let hidden = false;

export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  const splash = document.getElementById('splash');
  if (!splash) return;
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    splash.classList.add('hidden');
    window.setTimeout(() => splash.remove(), 400);
  }, wait);
}
