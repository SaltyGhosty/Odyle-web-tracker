// Glide of a displayed value toward its target (energy: number, liquid level, runes). Pure: times are passed in.
// A tween is { from, to, start }; retarget keeps it when the target is unchanged, so a repaint never restarts it.
export const TWEEN_MS = 700;
const ease = (k) => 1 - (1 - k) ** 4; // ease-out close to cubic-bezier(0.23, 1, 0.32, 1)

export function valueAt(tw, now) {
  const k = (now - tw.start) / TWEEN_MS;
  return k >= 1 ? tw.to : tw.from + (tw.to - tw.from) * ease(Math.max(0, k));
}
export const running = (tw, now) => tw.from !== tw.to && now - tw.start < TWEEN_MS;

// No previous tween (first paint) or instant (calm / reduced motion): jump. Otherwise start from what is shown now.
export function retarget(tw, to, now, instant = false) {
  if (tw && tw.to === to && !instant) return tw;
  return { from: !tw || instant ? to : valueAt(tw, now), to, start: now };
}
