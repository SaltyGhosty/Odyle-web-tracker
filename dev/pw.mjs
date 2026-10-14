// Carga Playwright: primero el paquete local (npm i --no-save playwright), si no, el de /opt/npm-tools (Linux).
import { createRequire } from 'node:module';

export async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* no instalado en este equipo */ }
  return createRequire('/opt/npm-tools/node_modules/')('playwright').chromium;
}
