// Optional sounds, synthesized with Web Audio (no files). Off until the viewer turns them on.
export function createSound() {
  let ctx = null;
  let on = false;
  try { on = localStorage.getItem('odyle-sound') === '1'; } catch { on = false; }
  const ensure = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const tone = (freq, start, dur, gain = 0.12) => {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const t = c.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  };
  return {
    enabled: () => on,
    // Called from the toggle's click, so the browser allows audio to start.
    setEnabled(v) {
      on = !!v;
      try { localStorage.setItem('odyle-sound', on ? '1' : '0'); } catch {}
      if (on) ensure();
    },
    chime() { if (!on || !ctx) return; tone(880, 0, 0.15); tone(1320, 0.12, 0.2); },
    fanfare() { if (!on || !ctx) return; tone(660, 0, 0.18); tone(880, 0.16, 0.18); tone(1320, 0.32, 0.35, 0.14); },
  };
}
