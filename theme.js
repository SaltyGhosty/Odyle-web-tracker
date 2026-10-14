// Faction themes: Elyos (light) and Asmodian (dark). The colours themselves live in CSS variables
// (index.html, :root[data-faction=…]); this module decides which theme applies and feeds the 3D scene.
export const THEMES = {
  elyos: {
    id: 'elyos', label: 'Luz', subtitle: 'Daevas de Elyos', themeColor: '#EEF3F8', light: true,
    orb: { primary: '#A87A1E', secondary: '#2E6FB0', urgent: '#B4232F' },
  },
  asmodian: {
    id: 'asmodian', label: 'Sombra', subtitle: 'Daevas de Asmodae', themeColor: '#120D17', light: false,
    orb: { primary: '#9B6BD6', secondary: '#C9C3D6', urgent: '#E0455A' },
  },
};

const isTheme = (v) => v === 'elyos' || v === 'asmodian';

// The free "Luz / Sombra" button (prefs.theme) wins; then the old prefs.faction choice; then the
// profile's faction; then the last theme this device applied; else Elyos.
export function resolveTheme({ prefs, profile, cached } = {}) {
  if (prefs && isTheme(prefs.theme)) return prefs.theme;
  if (prefs && isTheme(prefs.faction)) return prefs.faction;
  if (profile && isTheme(profile.faction)) return profile.faction;
  if (isTheme(cached)) return cached;
  return 'elyos';
}

export const otherTheme = (t) => (t === 'asmodian' ? 'elyos' : 'asmodian');
export const themeOf = (t) => THEMES[isTheme(t) ? t : 'elyos'];
