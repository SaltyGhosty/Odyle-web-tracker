// Cielo vivo de Atreia detrás de las pantallas de cuenta y de privacidad (sin facción: tokens de Luz).
import { createSky, skyBudget } from './sky.js';

const canvas = document.getElementById('sky');
if (canvas) {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  // Los colores se leen una sola vez del CSS; sky.js los pide cada fotograma, esto es una caché.
  const cs = getComputedStyle(document.documentElement);
  const colors = ['--sky-1', '--sky-2', '--sky-3'].map((k) => cs.getPropertyValue(k).trim());
  const budget = () => skyBudget({ width: innerWidth, reduceMotion: mq.matches, lite: false, hidden: document.hidden });
  const sky = createSky(canvas, { budget, colors: () => colors });
  const sync = () => {
    if (budget().animate) sky.start();
    else { sky.stop(); sky.frame(); }
  };
  sync();
  document.addEventListener('visibilitychange', sync);
  mq.addEventListener?.('change', sync);
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => sync(), 200); });
}
