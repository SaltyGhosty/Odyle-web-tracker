// Faction themes: Elyos (golden dusk) and Asmodian (the Abyss); both are dark worlds. The colours themselves live in CSS variables
// (index.html, :root[data-faction=…]); this module decides which theme applies.
export const THEMES = {
  elyos: {
    id: 'elyos', label: 'Luz', subtitle: 'Daevas de Elyos', themeColor: '#2F3B55', light: false,
  },
  asmodian: {
    id: 'asmodian', label: 'Sombra', subtitle: 'Daevas de Asmodae', themeColor: '#1B1530', light: false,
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
