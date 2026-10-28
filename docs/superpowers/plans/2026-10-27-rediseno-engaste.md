# Rediseño «Engaste de orbes» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Odyle into a modern, living app: a one-line top bar with three live timers (refill, **daily reset**, next event), an Energía screen with the urgent character's 3D orb on a stage plus floating character cards, an animated Atreia sky behind every screen, and the same card skin on every section and on the account pages.

**Architecture:** The app stays one `index.html` (inline `<style>` + inline module script, split by `scripts/build-web.mjs` for the web build). New decisions that can be tested without a DOM go into small pure modules (`layout.js` additions, `clocks.js`, `stage.js`, `sky.js`) tested with `node --test`; `index.html` wires them into the existing node-moving layout (`TABS` / `PLACE` / `placeChrome`). The sky is one fixed `<canvas>` drawn with Canvas 2D.

**Tech Stack:** Vanilla ES modules, Canvas 2D, three.js 0.160 (existing `orb3d.js`), Popover API, View Transitions API (optional), `node --test`, Playwright e2e (`dev/e2e.mjs`, `dev/e2e-web.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-27-rediseno-engaste-design.md`. Approved sketch: `.impeccable/mocks/decision5/assigned-v2.html` (composition, palette, type, density to match).

## Global Constraints

- Colours: only the current DESIGN.md tokens (Luz: `#2F3B55 #1F2840 #18203A #F4E7C8 #B9C2D6 #E3A853 #F2C77E #9CC3E6 #5C8DC2 #D2453A #B9372D #FF9A8E`; Sombra: `#1B1530 #120E22 #0D0A19 #ECE8F6 #B9B3D0 #A58CE8 #C9B8F5 #C8CDE4 #7A58C0`) and transparencies of them. No new hues.
- Type: Marcellus (names, headings, brand) + Gothic A1 (everything else, `tnum` for numbers). No other font.
- CSP: no inline script in the web build, Trusted Types, never `innerHTML`; build DOM with the existing `el(...)` helper.
- Both builds work: web (`npm run build:web`) and the claude.ai artifact (same `index.html`, `SOCIAL = false`).
- Every new user-facing Spanish string is added to `i18n-strings.js` under `en`, `it` and `pt` (keys are the Spanish text; keep `{0}` placeholders identical). `npm test` must stay green (`i18n.test.js` checks key parity).
- The «Sitio de fans no oficial · no afiliado a NCSOFT» note is visible on every screen.
- Motion: `prefers-reduced-motion: reduce` → sky still (one frame), no motes, no parallax, no entrances; timers keep counting. `lite` (`body.calm`) → today's behaviour plus a still sky. Hidden tab → sky stops.
- Desktop ≥ 900 px; folded clocks 900–1199 px; mobile < 900 px keeps the existing bottom bar (`navModel`, 4 + «Más»).
- Daily reset = the `daily` event in `events.js` (07:00 UTC). No per-server time.

## Review Focus

1. **No characters / no recharge time set** — the stage must show the first-run guide state, not crash or show an empty orb; refill clock shows «—» and links to Ajustes. Test: Task 3 `pickStage([])` → `null`; Task 6 e2e empty screenshot.
2. **A pinned character is removed** — stage falls back to the most urgent one. Test: Task 3 `pickStage` with a `pinnedId` not in rows.
3. **Every reset event is the soonest** — the event clock must never show «Reinicio diario/semanal» (those have their own place). Test: Task 2 `headerClocks` with only resets → `next: null`.
4. **Narrow desktop (900–1199 px) and long Spanish/Italian labels** — bar must stay one line. Test: Task 5 e2e screenshot at 1000 px in `it`.
5. **Read-only viewer (legion mate's board / stale data)** — no «Gastar ahora» on the stage. Test: Task 6 e2e read-only check (`ui.readOnly` path in `dev/e2e.mjs`).

---

### Task 0: Direction contract

**Files:**
- Create via script: `.impeccable/surfaces/index-html.md` (update existing brief)

- [ ] **Step 1:** Get the seed reference: run `"C:/Users/Salty/.claude/plugins/cache/impeccable/impeccable/4.5.2/skills/impeccable/scripts/impeccable" concept-seed --scope direction --mode operate --from b98d8853 --reroll 1 | grep "SEED REFERENCE"`. If it prints none, use `seed: none (unavailable)`.
- [ ] **Step 2:** Read the current brief: `impeccable surface-brief read index.html`.
- [ ] **Step 3:** Write a body file with the existing brief content plus `## Direction contract` with the six blocks: THESIS (the urgent character's orb set in its turning rune ring as the stage; refuses the spreadsheet rows and the generic card store), OWN-WORLD (slate/gold Luz, violet Sombra, liquid-light orbs in 56-rune rings, Marcellus names, tabular Gothic A1 numbers, 18 px radius cards on a living aether sky), STORY (glance: who is full, refill/daily-reset/event timers; act: Gastar ahora), FIRST VIEWPORT (one-line bar 72 px: brand · menu+Más · three 48 px clocks, daily in gold; left 560 px stage with 250 px orb, name 58 px Marcellus, number + loss line, red primary button; right column: cards, quick spends, Hoy), FORM (Piedras de Estigma → Engaste de orbes, position 4 of the grounded list, seed reference), FINISH (verbatim line from new-work.md §5). Write with `impeccable surface-brief write index.html <body-file> web/auth.html web/privacidad.html`, read it back, confirm six blocks + seed line.
- [ ] **Step 4: Commit** `git add .impeccable/surfaces && git commit -m "docs(impeccable): contrato de dirección «Engaste de orbes»"`

### Task 1: Top-bar navigation model

**Files:**
- Modify: `layout.js` (add export after `resolveTab`)
- Test: `layout.test.js`

**Interfaces:**
- Consumes: `SECTIONS`, `navModel` (existing).
- Produces: `topbarModel({ social: boolean }) -> { menu: string[], more: string[] }`.

- [ ] **Step 1: Write the failing tests** in `layout.test.js`:

```js
test('topbarModel web: cinco en el menú, el resto en Más', () => {
  assert.deepEqual(topbarModel({ social: true }), {
    menu: ['personajes', 'eventos', 'legion', 'amigos', 'chat'],
    more: ['buscar', 'estadisticas', 'ajustes', 'novedades', 'acerca'],
  });
});
test('topbarModel artifact: sin sociales, Estadísticas en el menú', () => {
  assert.deepEqual(topbarModel({ social: false }), {
    menu: ['personajes', 'eventos', 'legion', 'estadisticas'],
    more: ['ajustes', 'novedades', 'acerca'],
  });
});
test('topbarModel cubre cada sección una sola vez', () => {
  for (const social of [true, false]) {
    const { menu, more } = topbarModel({ social });
    assert.deepEqual([...menu, ...more].sort(), navModel({ social }).rail.slice().sort());
  }
});
```

- [ ] **Step 2:** Run `node --test layout.test.js` → FAIL (`topbarModel` not exported).
- [ ] **Step 3:** Implement `topbarModel` with a `MENU = { web: [...], artifact: [...] }` constant; `more` = `navModel(...).rail` minus `menu`, in rail order.
- [ ] **Step 4:** Run `node --test layout.test.js` → PASS.
- [ ] **Step 5: Commit** `git add layout.js layout.test.js && git commit -m "feat(layout): modelo de la barra superior con menú y Más"`

### Task 2: Header clocks and event order

**Files:**
- Create: `clocks.js`
- Test: `clocks.test.js`
- Modify: `scripts/build-web.mjs` (add `'clocks.js'` to `EXPECTED`)

**Interfaces:**
- Consumes: `EVENTS`, `nextOccurrence(event, nowMs) -> { startMs, endMs, active }` from `events.js`.
- Produces:
  - `RESET_IDS = ['daily', 'weekly']`
  - `headerClocks(nowMs, events = EVENTS) -> { daily: { startMs } | null, weekly: { startMs } | null, next: { id, name, startMs, endMs, active } | null }` — `next` is the soonest non-reset event; an active one beats any upcoming one (soonest end among active).
  - `sortEvents(items) -> items` where `items` are `{ e, o, f }` as built in `paintEvents`: resets first (daily, then weekly), then today's existing order (active, favourite, time). Returns a new array.

- [ ] **Step 1: Write the failing tests** in `clocks.test.js` (use small custom event lists so times are deterministic; `NOW = Date.UTC(2026, 9, 27, 6, 0)`):
  - `headerClocks(NOW).daily.startMs === nextOccurrence(EVENTS.find(e => e.id === 'daily'), NOW).startMs` and equals `Date.UTC(2026, 9, 27, 7, 0)`.
  - with events `[daily, weekly]` only → `next === null`.
  - with an event active now (started 10 min ago, 30 min long) and another starting in 5 min → `next.id` is the active one, `next.active === true`.
  - with two upcoming events → `next` is the earlier `startMs`.
  - `sortEvents` puts `daily` then `weekly` first and keeps the relative order of the rest (build 4 items, assert ids).
- [ ] **Step 2:** Run `node --test clocks.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement `clocks.js` with the signatures above (pure, imports only `events.js`); add `'clocks.js'` to `EXPECTED` in `scripts/build-web.mjs`.
- [ ] **Step 4:** Run `node --test clocks.test.js` → PASS; `npm test` → all PASS.
- [ ] **Step 5: Commit** `git add clocks.js clocks.test.js scripts/build-web.mjs && git commit -m "feat(clocks): relojes de cabecera y orden de eventos con reinicios primero"`

### Task 3: Stage choice

**Files:**
- Create: `stage.js`
- Test: `stage.test.js`
- Modify: `scripts/build-web.mjs` (`EXPECTED` += `'stage.js'`)

**Interfaces:**
- Consumes: view rows from `buildView(...)` (fields used: `id, name, isFull, fullAtMs, regen`), `formatDuration` from `energy.js`.
- Produces:
  - `pickStage(rows, { pinnedId = null } = {}) -> { id, tone: 'urgent' | 'next' | 'pinned' } | null`
    - no rows → `null`
    - `pinnedId` found in rows → `{ id: pinnedId, tone: row.isFull ? 'urgent' : 'pinned' }`
    - else first `isFull` row (rows order) → `'urgent'`
    - else row with smallest non-null `fullAtMs` → `'next'`
    - else `rows[0]` → `'next'`
  - `stageCaption(row, nowMs) -> string`: full → `pierde ${row.regen} OD cada 3 h`; `fullAtMs` null/undefined → `Sin hora de recarga`; else `Lleno en ${formatDuration(row.fullAtMs - nowMs)}`.
  - `CARD_3D_LIMIT = 8`; `cardOrbMode(count) -> '3d' | '2d'` (`count > 8` → `'2d'`).

- [ ] **Step 1: Write the failing tests** covering every bullet above, including: pinned id not in rows → falls back to the urgent row; pinned + full → tone `'urgent'`; two full rows → the first; `stageCaption` for a full row with `regen: 30` → `'pierde 30 OD cada 3 h'`; `cardOrbMode(8) === '3d'`, `cardOrbMode(9) === '2d'`.
- [ ] **Step 2:** Run `node --test stage.test.js` → FAIL.
- [ ] **Step 3:** Implement `stage.js`; add to `EXPECTED`.
- [ ] **Step 4:** `node --test stage.test.js` → PASS. Add the templates `pierde {0} OD cada 3 h`, `Lleno en {0}` and `Sin hora de recarga` to `i18n-strings.js` (en/it/pt), skipping any already present (search first; `tr()` translates interpolated text through templates, see `i18n.test.js` «plantillas nuevas»). `npm test` → PASS.
- [ ] **Step 5: Commit** `git add stage.js stage.test.js scripts/build-web.mjs i18n-strings.js && git commit -m "feat(stage): elección del personaje del escenario y su leyenda"`

### Task 4: Living sky engine

**Files:**
- Create: `sky.js`
- Test: `sky.test.js`
- Modify: `scripts/build-web.mjs` (`EXPECTED` += `'sky.js'`)

**Interfaces:**
- Produces:
  - `skyBudget({ width, reduceMotion, lite, hidden }) -> { animate: boolean, motes: number, fps: number, scale: number }`
    - `reduceMotion || lite` → `{ animate: false, motes: 0, fps: 0, scale: 0.5 }` (one still frame)
    - `hidden` → `animate: false`, other values as for width
    - `width < 900` → `{ animate: true, motes: 16, fps: 24, scale: 0.35 }`
    - otherwise → `{ animate: true, motes: 40, fps: 30, scale: 0.5 }`
  - `stepMote(m, dtMs, height) -> mote` where `m = { x, y, r, v, a }` (`v` px/ms upward): `y' = y - v*dt`; if `y' < -r` → `y' = height + r` (same `x`). Returns a new object.
  - `createSky(canvas, { budget: () => Budget, colors: () => [string, string, string] }) -> { start(), stop(), frame(), pulse(xCss, yCss), parallax(nx, ny), destroy() }`
    - Draws on a canvas sized `innerWidth*scale × innerHeight*scale` (CSS stretches it to the viewport). Three large soft radial blobs in the three colours at alpha 0.18–0.28 drift on slow Lissajous paths (periods 60–90 s); motes are 1–2.5 px dots in colour 2 at alpha ≤ 0.35; `pulse` adds one expanding ring (radius 0 → 60 % of the shorter side, 1200 ms ease-out, alpha 0.35 → 0); `parallax(nx, ny)` with `nx, ny ∈ [-1, 1]` sets CSS `translate` on the canvas of at most 8 px; `frame()` draws one still frame (used when `animate` is false). Frame loop throttled to `budget().fps` with `requestAnimationFrame`.
- Not unit-tested: `createSky` (checked by e2e screenshots in Task 7).

- [ ] **Step 1: Write the failing tests** for `skyBudget` (four cases above, exact objects) and `stepMote` (normal rise; wrap below `-r` to `height + r`; input object not mutated).
- [ ] **Step 2:** `node --test sky.test.js` → FAIL.
- [ ] **Step 3:** Implement `sky.js` (pure helpers + `createSky`; no imports; colours read through the `colors` callback so the module never touches CSS itself); add to `EXPECTED`.
- [ ] **Step 4:** `node --test sky.test.js` → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `git add sky.js sky.test.js scripts/build-web.mjs && git commit -m "feat(sky): motor del cielo vivo con presupuesto de movimiento"`

### Task 5: Top bar and clocks in the page

**Files:**
- Modify: `index.html` — `<header>` markup (≈ lines 671–689), CSS for header/rail/topnav (≈ 400–440), layout code (`navButton`…`placeChrome`, ≈ 1832–1921), `paintClock` (≈ 2119–2140), imports (≈ 1058).
- Modify: `i18n-strings.js`
- Modify: `dev/e2e.mjs` (screenshots)

**Interfaces:**
- Consumes: `topbarModel` (Task 1), `headerClocks`, `RESET_IDS` (Task 2), `formatClock`, `countdown`, existing `themeSwitch()`, `setTab`, `goTo`.
- Produces (DOM contract used by Tasks 6–8): `header.topbar` with `.brand`, `nav#topnav`, `.clocks` containing three `button.ck` with `data-clock="refill" | "daily" | "event"`, each with `small.k` (label) and `b.v` (value); `#next-tick` stays the refill value node; `#more-menu[popover]`; `#clocks-menu[popover]`; `footer.fan-foot` with the fan note; `canvas#sky` placeholder is added in Task 7.

- [ ] **Step 1:** Restructure the desktop header (≥ 900 px) as a 3-column grid `auto 1fr auto`, `height: 72px`, `align-items: center`, all controls in the menu 40 px high, clocks 48 px high, `min-width: 138px`, matching the sketch. Menu buttons come from `topbarModel(...).menu`; a last «Más ▾» button toggles `#more-menu` (Popover API, anchored under the button) listing `topbarModel(...).more`. Badges stay as `.badge` inside the button (existing `setBadge` keeps working because buttons keep `data-tab`). The rail styles (`.rail-brand`, `.rail-foot`, vertical `#topnav`) are removed for ≥ 900 px; < 900 px keeps the bottom bar exactly as today.
- [ ] **Step 2:** Right zone: the three clocks, then `#profile-chip`, then `themeSwitch()`. Daily clock has class `reset` (gold-tinted background). Refill clock is a button → `goTo('ajustes', 'adjust-minutes')` (replaces `#clock-fix`); event clock → `setTab('eventos')`; daily clock → `setTab('eventos')`. Between 900 and 1199 px, refill and event clocks are hidden and a «Relojes ▾» button opens `#clocks-menu` (popover) with the same two clocks; the daily clock stays visible.
- [ ] **Step 3:** Remove `#page-head` subline (`#sub-*`), `#ruler`, `#clock-fix` from the header; the section title becomes an `h1.page-title` at the top of each tab panel (keep id `page-title`, still set by `setTab`). Move `#add-btn` into `#chars-bar`'s `.chars-actions`. Keep `#next-tick` id on the refill clock's `b.v`. Update `paintClock` to fill all three clocks each second from `headerClocks(Date.now())`: refill `formatClock(left)` or «—» when there is no anchor; daily `formatClock(daily.startMs - now)`; event label = event name, value `formatClock(start - now)` or, when active, `En curso` + `formatClock(end - now)`. No `aria-live` on clocks.
- [ ] **Step 4:** Mobile (< 900 px): header shows brand + profile chip + theme switch; `.clocks` moves (via `placeChrome`) into a `div.clock-strip` right under the header, `position: sticky; top: 0`, horizontal scroll, daily first (CSS `order`).
- [ ] **Step 5:** Fan note: one `footer.fan-foot` appended after `.page` on every screen (both widths); remove the rail-foot and More-sheet copies.
- [ ] **Step 6:** Add new strings to `i18n-strings.js` (en/it/pt): `Más`, `Relojes`, `+{0} OD en`, `En curso`, `Próximo evento`. Run `npm test` → PASS.
- [ ] **Step 7:** Add e2e screenshots in `dev/e2e.mjs`: `topbar-luz-1440.png`, `topbar-sombra-1440.png`, `topbar-it-1000.png` (Italian, 1000 px: assert the header's `scrollHeight <= 72` and no element of `.clocks` overflows), `topbar-390.png`. Run `npm run e2e` → PASS and open each screenshot.
- [ ] **Step 8: Commit** `git commit -am "feat(ui): barra superior de una línea con relojes de recarga, reinicio diario y evento"`

### Task 6: Energía stage and character cards

**Files:**
- Modify: `index.html` — `PLACE.personajes` (≈ 1823), `orbFor` / `cardNode` (≈ 1392–1500), card click handler (≈ 2322), `paintSummary` / `paintQuick` (≈ 1949–1990), `render` (≈ 2252), CSS for `.card`, `.grid`, new `.energy`, `.stage`, `.case`, `.today`.
- Modify: `i18n-strings.js`, `dev/e2e.mjs`

**Interfaces:**
- Consumes: `pickStage`, `stageCaption`, `cardOrbMode` (Task 3); `becameFull` (motion.js); existing `goSpend(id)`, `orbFor(row)`, `alertAction` / `#alert`.
- Produces: `ui.stageId` (session-only, never stored) and `#stage` element with `.stage-orb` slot (Task 7 reads its centre for the pulse).

- [ ] **Step 1:** Layout: `PLACE.personajes` returns `[h1, section.energy]` where `section.energy` is a grid `560px 1fr` (≥ 1200 px; `minmax(420px, 40%) 1fr` at 900–1199; one column < 900) containing `div#stage.stage` and `div.case`. `div.case` holds, in order: `#guide`, `#chars-bar`, `#cards`, `#quick`, `section#today.today` (holds moved `#side-events` list + weekly reset line + `#side-online-box`), `#plan`. `#summary` is no longer placed (keep the node detached so `paintSummary` still computes `planBand` and `#band-status` still announces). The wide `#side` aside is no longer shown.
- [ ] **Step 2:** Stage: each `render`, `const s = pickStage(rows, { pinnedId: ui.stageId })`; if `s === null` the stage shows the first-run guide prompt (button «Añadir personaje» → `openAdd()`). Otherwise render: `.stage-orb` (the row's `orbFor(row)` nodes — the 3D canvas moves here; slot 250 px desktop, 180 px mobile), `h2` name (Marcellus 58 px), class name, `.r-num` number with roll (`data-num` same as cards so `stepRolls` updates it), caption `stageCaption(row, now)` placed right after the number, and a «Gastar ahora» button → `goSpend(row.id)`, red primary when `tone === 'urgent'`, secondary otherwise, hidden when `ui.readOnly || ui.noDb`.
- [ ] **Step 3:** Cards: `#cards` shows every row except `s.id`, as vertical tiles (orb 108 px on top, name, class, `615 / 840`, status line, actions). Keep all existing card logic (edit form, confirm, notes, menu). When `cardOrbMode(rows.length) === '2d'`, `orbFor` returns only the SVG for cards (stage always gets 3D). `#chars-bar` h2 reads `Tus personajes` + `span` `{n} más` (n = cards shown).
- [ ] **Step 4:** Clicking a card (not on a button, input, link or form) sets `ui.stageId = id` and `ui.selectedId = id`, then `render()` inside `document.startViewTransition` when available. Pressing Escape on the stage clears `ui.stageId`.
- [ ] **Step 5:** Cap notice: in the tick path where `becameFull(prev, rows, max)` is already evaluated, for each newly full id `!== s.id` show `#alert` with text `{0} está al tope` and `alertAction` = set `ui.stageId` to that id + `render()`; the stage itself does not change.
- [ ] **Step 6:** CSS for stage/case/cards/today matching the sketch (radius 18 px cards on `--panel`, stage radial red glow only when urgent, no 1 px rule grids). Add strings `{0} más`, `{0} está al tope`, `Gastar ahora`, `Hoy`, `Reinicio semanal` (if missing) to `i18n-strings.js`; `npm test` → PASS.
- [ ] **Step 7:** e2e: screenshots `energia-{luz,sombra}-{1440,390}.png` with the demo data (one full, three not), `energia-empty-1440.png` (no characters), and a read-only check that `#stage button` with text «Gastar ahora» is absent. Add a test that clicking a card moves it to the stage (`#stage h2` text changes) and that reloading returns the urgent one. `npm run e2e` → PASS; open the screenshots.
- [ ] **Step 8: Commit** `git commit -am "feat(energia): escenario del personaje urgente y tarjetas con orbe"`

### Task 7: Sky, pulse and motion wiring

**Files:**
- Modify: `index.html` (import `sky.js`; `canvas#sky`; CSS tokens `--sky-1/2/3` per theme; motion hooks), `dev/e2e.mjs`

**Interfaces:**
- Consumes: `createSky`, `skyBudget` (Task 4); `#stage .stage-orb` (Task 6); existing `reduceMotion`, `lite`, `animate`, `detectGains` gain path.

- [ ] **Step 1:** Insert `canvas#sky` (`aria-hidden="true"`, `position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: -1; pointer-events: none`) as the first child of `body`. Theme tokens: Luz `--sky-1: #E3A853; --sky-2: #9CC3E6; --sky-3: #5C8DC2`; Sombra `--sky-1: #A58CE8; --sky-2: #C8CDE4; --sky-3: #7A58C0`; `colors()` reads them with `getComputedStyle(document.documentElement)`. Page backgrounds that are opaque today become transparent enough (`--bg` on `body` only) for the sky to show.
- [ ] **Step 2:** Create the sky after first render: `budget = () => skyBudget({ width: innerWidth, reduceMotion, lite, hidden: document.hidden })`; `start()` when `budget().animate`, else `frame()`. Re-evaluate on `visibilitychange`, `resize` (debounced 200 ms), theme change (call `frame()` so colours update) and when «Reducir animaciones» toggles.
- [ ] **Step 3:** Parallax: on `pointermove` (desktop only, `animate` true), rAF-throttled, `sky.parallax((x / innerWidth) * 2 - 1, (y / innerHeight) * 2 - 1)`.
- [ ] **Step 4:** Refill pulse: where gains from `detectGains` are applied, call `sky.pulse(cx, cy)` once per tick with the centre of `#stage .stage-orb` (`getBoundingClientRect`). Existing orb ripple and number roll stay as they are.
- [ ] **Step 5:** Entrances: tab panels' cards get class `enter` with `--i` stagger (60 ms steps, max 6) only the first time a tab is shown in the session (track a `Set` of shown tabs). Card orb float: CSS `@keyframes orb-float` (translateY 0 → -6px, 4 s ease-in-out infinite, delay from `--i`), off under `body.calm` and reduced motion. Stage urgent: existing `.full` beat on the ring; the button never animates.
- [ ] **Step 6:** e2e: with `reducedMotion: 'reduce'` assert the sky canvas is not redrawn after load (read a pixel twice 1 s apart → equal); with motion on, two reads differ. Screenshots `sky-{luz,sombra}-1440.png`. `npm run e2e` → PASS.
- [ ] **Step 7: Commit** `git commit -am "feat(motion): cielo de Atreia vivo, pulso de recarga y entradas"`

### Task 8: Card skin for every other section

**Files:**
- Modify: `index.html` (CSS for `.panel`, `.tab-panel`, events list, legion, stats, settings, news, about; `paintEvents` uses `sortEvents`), `web/social.css` (friends, chat, search)

**Interfaces:**
- Consumes: `sortEvents` (Task 2); the card tokens introduced in Task 6.

- [ ] **Step 1:** `paintEvents` sorts with `sortEvents(items)`; event rows become cards with the countdown as a large tabular number (32 px), resets on top with the gold tint used by the daily clock.
- [ ] **Step 2:** Apply the card skin (18 px radius, `--panel` background, 22 px padding, Marcellus h2) to all `.panel`s in Legión, Estadísticas, Ajustes, Novedades, Acerca de, and to `.social` screens in `web/social.css`; keep every id, control and behaviour. Chat keeps its current layout inside a card.
- [ ] **Step 3:** e2e screenshots for each tab at 1440 and 390 in Luz and Sombra (extend the existing loops). `npm run e2e` and `node dev/e2e-web.mjs` → PASS; open the screenshots.
- [ ] **Step 4: Commit** `git commit -am "feat(ui): piel de tarjetas en todas las secciones"`

### Task 9: Account pages and privacy page

**Files:**
- Create: `web/sky-boot.js`
- Modify: `web/auth.html`, `web/auth.css`, `web/privacidad.html`, `scripts/build-web.mjs` (add `'sky-boot.js'` to the required `web/` list)

**Interfaces:**
- Consumes: `createSky`, `skyBudget` from `./sky.js` (same folder in the build output).

- [ ] **Step 1:** `web/sky-boot.js`: finds `canvas#sky`, builds the budget from `matchMedia('(prefers-reduced-motion: reduce)')` (no lite there) and `document.hidden`, reads `--sky-1..3` from CSS, starts or draws one frame; handles `visibilitychange`.
- [ ] **Step 2:** Add `<canvas id="sky" aria-hidden="true">` and `<script type="module" src="sky-boot.js"></script>` to `web/auth.html` and `web/privacidad.html`; give the form/content a card (18 px radius, `--panel`) over the sky in `web/auth.css`; define `--sky-1..3` for both themes there.
- [ ] **Step 3:** `node dev/e2e-web.mjs` → PASS (login flow still works); screenshots `auth-{1440,390}.png`, `privacidad-1440.png`; open them.
- [ ] **Step 4: Commit** `git add web scripts/build-web.mjs && git commit -m "feat(cuenta): cielo vivo y tarjeta en las pantallas de cuenta y privacidad"`

### Task 10: Finish review and DESIGN.md

**Files:**
- Modify: `DESIGN.md`, `.impeccable/design.json` (by the documenter)
- Capture: `.impeccable/review/desktop.png` (1440 full page), `.impeccable/review/mobile.png` (390)

- [ ] **Step 1:** `npm test` and `npm run e2e` and `node dev/e2e-web.mjs` → all PASS.
- [ ] **Step 2:** Capture `desktop.png` and `mobile.png` (Energía, Luz) and `desktop-sombra.png`, `mobile-sombra.png` into `.impeccable/review/`; open each and confirm it shows what its name claims (settle entrance motion first).
- [ ] **Step 3:** Run `impeccable detect --json index.html web/auth.html web/privacidad.html`; fix mechanical findings; keep the rest for the reviewer.
- [ ] **Step 4:** Spawn `impeccable-finish-reviewer` fresh with: the user's request (modern, dynamic, ARCADE-like, current colours, Aion theme, animations, daily reset timer), the spec path, the direction contract (`.impeccable/surfaces/index-html.md`), the screenshots, the remaining detector findings, the chosen sketch `.impeccable/mocks/decision5/assigned-v2.html` as critique reference, and `reference/craft-floor.md`. Act on its disposition (fix batch → recapture → verdict; at most two rounds).
- [ ] **Step 5:** Spawn `impeccable-documenter` to rewrite `DESIGN.md` + `.impeccable/design.json` from the built world (radius, sky tokens, card system, motion grammar).
- [ ] **Step 6: Commit** `git add DESIGN.md .impeccable && git commit -m "docs(design): DESIGN.md del mundo «Engaste de orbes»"`
