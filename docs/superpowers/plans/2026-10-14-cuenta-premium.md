# Cuenta normal o premium y runas de Atreia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each character is Normal (+15 every 3 h, cap 560) or Premium (+30 every 3 h, cap 840). The whole app computes with that character's rules. The ring's star marks become an original alphabet of 28 Atreia runes.

**Architecture:** One rules table in `energy.js` (`ACCOUNTS`, `rulesOf(char)`). Every pure module reads `regen` and `max` from it instead of the constants 15 and 840. View rows carry `account`, `regen` and `max`, so the UI, planner, layout and orbs take their numbers from the row. The server only validates the new field and passes it through to friends. The rune shapes live as SVG path data in `runes.js`. The SVG orb draws them as paths, and the 3D orb draws them from a canvas atlas built from the same data.

**Tech Stack:** Vanilla ES modules, `node --test`, Fastify 5 + Postgres (server validation only), three.js 0.160 (`orb3d.js`), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-14-cuenta-premium-design.md`

## Global Constraints

- Rules: Normal `{ regen: 15, max: 560 }`, Premium `{ regen: 30, max: 840 }`. The recharge happens every 3 h (`TICK_MS`) at the same shared moment for every character.
- Missing or unknown `account` means **Premium**. New characters default to **Normal** in the add form.
- Energy above the cap is kept until it is spent and does not recharge.
- When the account changes, the current energy is first fixed under the old rule (`energy` = the current value, `recordedAt` = now). The edit form already does this through `changeEnergy`, so `account` has to be saved through the same write.
- The ring always has 56 positions, and each one is worth `max / 56` (10 OD on Normal, 15 OD on Premium).
- Runes are original drawings. Never copy the official Aion 2 script, NCSOFT art, Latin letters or Elder Futhark shapes.
- Strict CSP and Trusted Types:
  - No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function`.
  - `setTimeout` takes an arrow function only, and `import()` a string literal only.
  - `new Path2D(d)` with path data is fine.
- Every new UI literal is in Spanish in the code and gets translated to en, it and pt in `i18n-strings.js`. User-written text uses `translate="no"`.
- Fan site: keep the "not official" notice and add no NCSOFT assets.
- Commits: never add a `Co-Authored-By` trailer. Do not push.
- Ponytail rules: make the smallest complete change, add no abstractions nobody asked for, add tests for new logic, and never cut validation, security or accessibility.
- Verification commands:
  - Root: `node --test *.test.js web/*.test.js`.
  - Build: `npm run build:web`.
  - Server, from `server/`: `node --test --test-concurrency=1`. Only `app.test.js:166` and the SR-34 test in `pages.test.js` may fail; both are known Windows failures.
  - Browser: `node dev/e2e-web.mjs` and `node dev/preview.mjs`. Run `npm i --no-save playwright` first if it is missing.
  - `dev/preview.mjs` already fails 6 checks on `main` ("rune timer text" ×4, "no schedule: rune timer says so", "seeded: class icon and name shown"). Those may still fail; any other new failure is not allowed.

## Review Focus

1. **Characters saved before this change** (no `account`, energy up to 840) must keep showing «x / 840» with +30 per recharge. Test: Task 1, `rulesOf({})` and `currentEnergy` without `account`.
2. **A character switched from Premium to Normal while above 560** must keep its energy, count as full and not recharge, and its orb must show the full ring without overflowing. Tests: Task 1 (`currentEnergy` and `fullAt` with energy 700 on Normal) and Task 2 (`litRunes(700, 560)` = 56).
3. **Mixed accounts in the header and the decision band:** with one Normal and one Premium character, the header shows no figures, and each band text uses its own character's cap. Tests: Task 3 (`headerRule` with mixed accounts) and Task 2 (`decisionBand` with a Normal character at 560).
4. **Friends who have not updated** (shared characters without `account`) count as Premium. A malicious `account` value is rejected by the server and ignored by the client. Tests: Task 4 (validation rejects `'gold'`, `1` and `null`) and Task 2 (`friendEnergy` with `account: 'gold'` → Premium).
5. **A Normal recharge of +15 over 10-OD runes** sometimes lights 1 rune and sometimes 2, and must never light more than 56 or fewer than 0. Test: Task 2 (`litRunes(15, 560)` = 1, `litRunes(30, 560)` = 3, `litRunes(9999, 560)` = 56).

---

### Task 1: Account rules in `energy.js` and `view.js`

**Files:**
- Modify: `energy.js` (lines 1-29)
- Modify: `view.js` (lines 1-41)
- Test: `energy.test.js`, `view.test.js`

**Interfaces:**
- Produces:
  - `ACCOUNTS: { normal: { regen: 15, max: 560 }, premium: { regen: 30, max: 840 } }`.
  - `rulesOf(char) → { account: 'normal'|'premium', regen: number, max: number }`. Unknown or missing `account` gives Premium.
  - `currentEnergy(char, anchorMs, nowMs)` and `fullAt(char, anchorMs, nowMs)` keep their signatures and use `rulesOf(char)`.
  - `MAX` stays exported at 840, meaning "the highest cap". Remove the `REGEN` export only after Task 2 has removed every import of it; until then keep it at 15.
  - `buildView` rows gain `account`, `regen` and `max` (the per-account cap). `nearFull` becomes `!isFull && energy >= max - 2 * regen`.
  - Remove the `NEAR_FULL` export; grep shows no other user.

- [ ] **Step 1: Write the failing tests** (append to `energy.test.js`; reuse its `R`, `A`, `H`)

```js
import { ACCOUNTS, rulesOf } from './energy.js';

test('reglas por cuenta: normal 15/560, premium 30/840, sin cuenta = premium', () => {
  assert.deepEqual(ACCOUNTS.normal, { regen: 15, max: 560 });
  assert.deepEqual(ACCOUNTS.premium, { regen: 30, max: 840 });
  assert.deepEqual(rulesOf({}), { account: 'premium', regen: 30, max: 840 });
  assert.deepEqual(rulesOf({ account: 'gold' }), { account: 'premium', regen: 30, max: 840 });
  assert.deepEqual(rulesOf({ account: 'normal' }), { account: 'normal', regen: 15, max: 560 });
});
test('normal: +15 por recarga y tope 560', () => {
  const c = { energy: 225, recordedAt: R, account: 'normal' };
  assert.equal(currentEnergy(c, A, A), 240);
  assert.equal(currentEnergy(c, A, A + 30 * H), 375);
  assert.equal(currentEnergy({ ...c, energy: 550 }, A, A), 560);
  assert.equal(fullAt(c, A, R), A + 22 * 3 * H); // (560-225)/15 = 22.33 → 23 recharges
});
test('premium: +30 por recarga y tope 840', () => {
  const c = { energy: 225, recordedAt: R, account: 'premium' };
  assert.equal(currentEnergy(c, A, A), 255);
  assert.equal(fullAt(c, A, R), A + 20 * 3 * H); // (840-225)/30 = 20.5 → 21 recharges
});
test('normal por encima de 560 (venía de premium): se queda, no recarga, ya está lleno', () => {
  const c = { energy: 700, recordedAt: R, account: 'normal' };
  assert.equal(currentEnergy(c, A, A + 9 * H), 700);
  assert.equal(fullAt(c, A, A), null);
});
```

The existing tests in `energy.test.js` assume +15 and a cap of 840, which is no longer an account. Change their characters to `account: 'normal'` and recompute the expectations, or move the cap tests to Premium. Keep every case: tick boundary, future `recordedAt`, energy above the cap, and `fullAt` for the three characters. Write the new expected numbers with the arithmetic in a comment, as above.

- [ ] **Step 2: Run them, expect FAIL**

Run: `node --test energy.test.js`. Expected: FAIL with `ACCOUNTS` / `rulesOf` not exported.

- [ ] **Step 3: Implement**

```js
// energy.js (top)
export const REGEN = 15;          // removed in Task 2 once nothing imports it
export const TICK_MS = 10_800_000;
export const MAX = 840;           // highest cap of any account
// Odyle energy per account (Aion 2): same shared recharge moment, different amount and cap.
export const ACCOUNTS = { normal: { regen: 15, max: 560 }, premium: { regen: 30, max: 840 } };
// Characters saved before accounts existed were tracked with the 840 cap: no account = premium.
export function rulesOf(char) {
  const account = char && char.account === 'normal' ? 'normal' : 'premium';
  return { account, ...ACCOUNTS[account] };
}

export function currentEnergy(char, anchorMs, nowMs) {
  const { regen, max } = rulesOf(char);
  if (char.energy >= max) return char.energy;
  return Math.min(max, char.energy + regen * Math.max(0, ticksBetween(anchorMs, char.recordedAt, nowMs)));
}

export function fullAt(char, anchorMs, nowMs) {
  const { regen, max } = rulesOf(char);
  const c = currentEnergy(char, anchorMs, nowMs);
  if (c >= max) return null;
  return nextTickAt(anchorMs, nowMs) + (Math.ceil((max - c) / regen) - 1) * TICK_MS;
}
```

In `view.js`, import `rulesOf` instead of `MAX` and drop `NEAR_FULL`. In the row mapping:

```js
    const { account, regen, max } = rulesOf(c);
    const energy = anchorMs === null ? c.energy : currentEnergy(c, anchorMs, nowMs);
    const isFull = energy >= max;
    ...
      account, regen, max,
      nearFull: !isFull && energy >= max - 2 * regen, // within two recharges of the cap
      percent: Math.min(100, Math.floor(energy / max * 100)),
```

Add to `view.test.js`:

```js
test('filas con la cuenta: tope, recarga, porcentaje y casi lleno', () => {
  const rows = buildView([
    { id: 'n', name: 'N', energy: 540, recordedAt: 0, order: 1, account: 'normal' },
    { id: 'p', name: 'P', energy: 540, recordedAt: 0, order: 2 },
  ], null, 0).rows;
  assert.deepEqual(rows.map(r => [r.account, r.regen, r.max, r.percent, r.nearFull, r.isFull]),
    [['normal', 15, 560, 96, true, false], ['premium', 30, 840, 64, false, false]]);
});
```

- [ ] **Step 4: Run them, expect PASS**

Run: `node --test energy.test.js view.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add energy.js energy.test.js view.js view.test.js
git commit -m "feat(energía): reglas por cuenta normal (15/560) y premium (30/840)"
```

---

### Task 2: Planner, layout, runes, charts and social use the character's rules

**Files:**
- Modify: `planner.js` (`wasteWarning`, `projectEnergy` comment, `runsToday`, `simulate`)
- Modify: `layout.js:40,53` (pass the row's rules)
- Modify: `runes.js` (`litRunes(energy, max)`)
- Modify: `charts.js:24-29` (cap line from the series)
- Modify: `social.js:104-118` (`friendEnergy`, `shareText`)
- Modify: `starorb.js` (`litStars` takes max)
- Modify: `energy.js` (remove `REGEN`)
- Test: `planner.test.js`, `planner2.test.js`, `layout.test.js`, `runes.test.js`, `social.test.js`, `starorb.test.js`

**Interfaces:**
- Consumes: `rulesOf`, `ACCOUNTS`, and rows with `regen` and `max` (Task 1).
- Produces:
  - `wasteWarning(fullAtMs, nowMs, quiet, tzOffsetMin, regen)`, where `regen` is required.
  - `runsToday(energy, cost, anchorMs, nowMs, endOfDayMs, regen)`, where `regen` is required.
  - `simulate(energy, anchorMs, nowMs, runsPerDay, cost, days, rules)`, where `rules = { regen, max }` is required and `days` is passed explicitly.
  - `litRunes(energy, max = MAX) = clamp(floor(energy / max * 56), 0, 56)`.
  - `RUNE_COUNT` stays 56, as a literal.
  - `friendEnergy` rows gain `account` and `max`, computed with `rulesOf(c)`.
  - `shareText` prints `${energy}/${max}` for each row.
  - `charts` series points may carry `max`. The cap line goes at the largest `max` among the series, defaulting to 840.

- [ ] **Step 1: Write the failing tests**

`runes.test.js`:
```js
test('runas: cada una vale tope/56 (10 OD en normal, 15 en premium)', () => {
  assert.equal(litRunes(15, 560), 1);
  assert.equal(litRunes(30, 560), 3);
  assert.equal(litRunes(559, 560), 55);
  assert.equal(litRunes(560, 560), 56);
  assert.equal(litRunes(700, 560), 56);
  assert.equal(litRunes(9999, 560), 56);
  assert.equal(litRunes(-1, 560), 0);
  assert.equal(litRunes(30, 840), 2);
});
```

`planner.test.js` (adapt the existing calls of `wasteWarning`, `runsToday` and `simulate` to pass `15` or `{ regen: 15, max: 840 }` so their current expectations keep holding, then add):
```js
test('premium pierde 30 por recarga desperdiciada; normal 15', () => {
  const quiet = { start: '00:00', end: '06:00' };
  const now = Date.UTC(2026, 9, 14, 23, 0), full = Date.UTC(2026, 9, 15, 0, 0);
  assert.equal(wasteWarning(full, now, quiet, 0, 30).lossOD, 60);
  assert.equal(wasteWarning(full, now, quiet, 0, 15).lossOD, 30);
});
test('simulate respeta el tope de la cuenta', () => {
  const r = simulate(550, 0, 1, 0, 100, 1, { regen: 15, max: 560 });
  assert.equal(r.wasteOD, 8 * 15 - 10); // the first recharge fills 10, the rest are lost
});
test('runsToday con recarga premium', () => {
  assert.equal(runsToday(0, 30, 0, 1, 3 * 10_800_000, 30).byMidnight, 3);
});
```
(Check the `wasteWarning` fixture against the function before relying on it. The intent: the character fills at 00:00 and the quiet window ends at 06:00, so 2 recharges are lost, at 03:00 and at 06:00, which is `2 × regen`. If the boundary arithmetic gives a different number of recharges, fix the expected values to `ticks × regen` and say so in a comment.)

`social.test.js`:
```js
test('friendEnergy usa la cuenta de cada personaje (sin cuenta o desconocida = premium)', () => {
  const rows = friendEnergy([
    { name: 'N', energy: 550, recordedAt: 0, account: 'normal' },
    { name: 'P', energy: 550, recordedAt: 0 },
    { name: 'G', energy: 550, recordedAt: 0, account: 'gold' },
  ], 1, 3 * 10_800_000);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(by.N.energy, 560); assert.equal(by.N.max, 560); assert.equal(by.N.isFull, true);
  assert.equal(by.P.energy, 640); assert.equal(by.P.max, 840);
  assert.equal(by.G.max, 840);
  assert.match(shareText([by.N]), /560\/560/);
});
```

`layout.test.js`: add a case where `decisionBand` gets a row `{ account: 'normal', max: 560, regen: 15, energy: 560, isFull: true, … }` and returns the urgent tone, and pass `regen` through in the existing `runsToday`/`wasteWarning` paths.

`starorb.test.js`: `buildStarOrb(doc, { energy: 280, max: 560 })` lights 28 stars (`data-lit="28"`).

- [ ] **Step 2: Run them, expect FAIL**

Run: `node --test runes.test.js planner.test.js planner2.test.js social.test.js layout.test.js starorb.test.js`. Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

`runes.js`:
```js
import { MAX } from './energy.js';
export const RUNE_COUNT = 56; // one position per 1/56 of the cap: 15 OD on premium (840), 10 OD on normal (560)
export function litRunes(energy, max = MAX) {
  const e = Number(energy);
  if (!Number.isFinite(e) || !(max > 0)) return 0;
  return Math.max(0, Math.min(RUNE_COUNT, Math.floor(e / max * RUNE_COUNT)));
}
```

`planner.js`:
- Replace each `REGEN` with the `regen` parameter.
- In `simulate`, replace the literal `840` with `rules.max` and `REGEN` with `rules.regen`, and update the header comment ("cap of the account").
- Import only `TICK_MS`, `currentEnergy`, `nextTickAt` and `formatDuration`.

`layout.js:40`: `wasteWarning(r.fullAtMs, now, quiet, tzOffsetMin, r.regen)`. `layout.js:53`: `runsToday(r.energy, p.cost, anchorMs, now, endOfDayMs, r.regen)`.

`social.js` (no extra `Math.min`: `currentEnergy` already caps the recharge and keeps energy that was above a Normal cap):
```js
    const { account, max } = rulesOf(c);
    const energy = anchorMs != null && Number.isFinite(c.recordedAt)
      ? currentEnergy({ energy: c.energy, recordedAt: c.recordedAt, account }, anchorMs, now) : c.energy;
    ...
    return { name: …, classId: …, account, max, energy,
      percent: Math.min(100, Math.floor(energy / max * 100)), isFull: energy >= max };
```
`shareText` uses `${r.energy}/${r.max ?? MAX}`. The cost check at `social.js:79` keeps `MAX` (840, the highest cap).

`charts.js`: `const capOf = series.reduce((m, s) => Math.max(m, s.max || 0), 0) || 840;`, and use `capOf` for `top`, for the grid `[0, capOf / 2, capOf]` and for the `cap` class. In `index.html:1579`, pass `max: r.max` in each series object.

`starorb.js`: `litStars = (energy, max) => litRunes(energy, max)`. `updateStarOrb` uses `ref.max`. Have `updateStarOrb` also accept `max` and store it in `ref.max` when given, because an account change alters the cap of an orb that already exists.

`energy.js`: delete `REGEN` once grep shows no import left. Update `energy.test.js` imports if it used `REGEN`.

- [ ] **Step 4: Run all root tests, expect PASS**

Run: `node --test *.test.js web/*.test.js`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add planner.js layout.js runes.js charts.js social.js starorb.js energy.js *.test.js index.html
git commit -m "feat(energía): planner, banda, runas, gráfico y amigos con la regla de cada cuenta"
```

---

### Task 3: UI — account selector, Premium mark, header, orbs, assistant, translations

**Files:**
- Modify: `index.html`. The add form is at ~850-862 and its submit at ~2387-2400. `addCharacter` is at ~1104, `updateCharacter` at ~1158 and the edit form at ~1410-1440. The row text is at ~1390, `orbFor` at ~1363, the header sub-line at 658 and its paint at ~2068-2080. The series is at ~1579, `simulate` at ~1704, `runsToday`/`wasteWarning` at ~2954-2955, `wasteWarning` at ~1568 and the assistant rules at ~2970.
- Modify: `orb3d.js` (`update(id, { energy, state, max })` → `levelOf(energy, max)` and `litRunes(energy, max)`)
- Modify: `web/social-dom.js:58-66` (`miniOrb` uses `row.max`; label `'{0} de {1} de energía'`)
- Modify: `i18n-strings.js` (en, it, pt for each new literal)
- Create: `layout.js` export `headerRule(rows)` + test in `layout.test.js`

**Interfaces:**
- Consumes: rows with `account`, `regen` and `max`; the new planner signatures (Task 2).
- Produces:
  - `headerRule(rows) → { regen: number, max: number } | null`. It returns null when the rows mix accounts or there are none.
  - `addCharacter(name, classId, account)`.
  - `updateCharacter(row, value, classId, cp, goal, account)`. It writes `account` in `extra`, so it goes in the same write that fixes `energy` and `recordedAt`.

- [ ] **Step 1: Failing test for `headerRule`** (`layout.test.js`)

```js
test('cabecera: cifras solo si todas las cuentas coinciden', () => {
  assert.deepEqual(headerRule([{ regen: 15, max: 560 }, { regen: 15, max: 560 }]), { regen: 15, max: 560 });
  assert.deepEqual(headerRule([{ regen: 30, max: 840 }]), { regen: 30, max: 840 });
  assert.equal(headerRule([{ regen: 15, max: 560 }, { regen: 30, max: 840 }]), null);
  assert.equal(headerRule([]), null);
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `node --test layout.test.js`.

- [ ] **Step 3: Implement**

`layout.js`:
```js
// The page header names the recharge and the cap only when every character shares them.
export function headerRule(rows) {
  if (!rows.length) return null;
  const { regen, max } = rows[0];
  return rows.every((r) => r.regen === regen && r.max === max) ? { regen, max } : null;
}
```

`index.html`:
1. **Account selector.** It is two radio buttons in a `fieldset`, styled as the existing segmented Luz/Sombra switch (reuse its classes), with a hint line below:
   ```html
   <fieldset class="field account-pick">
     <legend>Cuenta</legend>
     <label><input type="radio" name="add-account" value="normal" checked> Normal</label>
     <label><input type="radio" name="add-account" value="premium"> Premium</label>
     <p class="hint">Normal: +15 cada 3 h, tope 560 · Premium: +30 cada 3 h, tope 840</p>
   </fieldset>
   ```
   - Add it to the add form, before the submit button.
   - In the edit form, build the same thing with `el()`, name it `account-${row.id}`, and check `row.account`.
   - The add submit reads `document.querySelector('input[name=add-account]:checked').value` and resets to `normal` after adding.
2. **Saving the account.**
   - `addCharacter` writes `account` in `data`.
   - `updateCharacter` gets an `account` parameter and adds `extra.account = account`. `changeEnergy` already sets `recordedAt`, so the energy shown when the form was opened (the current value) is fixed under the old rule.
3. **Premium mark.** In the row `who` block, after the class name: `row.account === 'premium' ? el('span', { class: 'acct-mark' }, 'Premium') : null`. CSS: small (`.6875rem`), uppercase with `.14em` tracking like `.cls-name`, in `var(--gold)`, with a 1px `var(--line)` border, square corners and `2px 6px` padding. Do not show it in compact mode, the same way as `.cls-name`.
4. **Number.** The row already prints `/ ${row.max}`. Check that it reads `row.max` and not the constant.
5. **Header.**
   - Give `<span>tope 840</span>` the id `sub-cap`, and wrap «+15 OD en» so its number has the id `sub-regen`.
   - In the paint at ~2068, compute `const rule = headerRule(view.rows)` (use the rows of the view built for this paint).
   - When `rule` exists, show `+${rule.regen} OD en` and `tope ${rule.max}`.
   - Otherwise show «Recarga en» and hide `sub-cap` and its separator.
   - Only touch `textContent` when it changes, as the code already does.
6. **Orbs.**
   - `orbFor(row)` passes `max: row.max` to `buildStarOrb` and `updateStarOrb`, and passes `{ energy, state, max }` to `orbs3d.update`.
   - In `orb3d.js`, `update` stores `max` and uses it in `levelOf` and `litRunes`.
   - The 'full' state comes from `row.isFull`, which already uses the account cap.
7. **Planner calls.**
   - Lines ~1568 and ~2955: pass `r.regen` / `row.regen` to `wasteWarning`.
   - Line ~2954: pass `r.regen` to `runsToday`.
   - Line ~1704: call `simulate(r.energy, anchor, now, runs, cost, 7, { regen: r.regen, max: r.max })`.
8. **Assistant.**
   - Set `rules` to `'Odyle energy (OD): every 3 hours, at the same moment for every character, each character recharges by its account: normal +15 up to 560, premium +30 up to 840; energy above the cap is not lost but does not recharge.'`
   - Add `account: r.account, max: r.max` to each character object in the assistant context.
9. **Friends.** In `web/social-dom.js` `miniOrb`, use `buildStarOrb(document, { energy, max: row.max, … })` with the label `fmt(S('{0} de {1} de energía'), row.energy, row.max)`.
10. **Translations.** Add to `i18n-strings.js` for en, it and pt: `Cuenta`, `Normal`, `Premium`, `Normal: +15 cada 3 h, tope 560 · Premium: +30 cada 3 h, tope 840`, `Recarga en`, `+{0} OD en`, `tope {0}`, `{0} de {1} de energía`. Remove the old `{0} de 840 de energía` key only if nothing else uses it. `i18n.test.js` checks the placeholders.

- [ ] **Step 4: Run tests and build**

Run: `node --test *.test.js web/*.test.js`, then `npm run build:web`. Expected: all pass, and the build prints `listo`.

- [ ] **Step 5: Commit**

```bash
git add index.html layout.js layout.test.js orb3d.js web/social-dom.js i18n-strings.js
git commit -m "feat(cuenta): selector normal/premium, marca Premium, cabecera y orbes con el tope de cada cuenta"
```

---

### Task 4: Server — validate `account` and share it with friends

**Files:**
- Modify: `server/src/lib/validate.js:84-88`
- Modify: `server/src/routes/profiles.js:51-58`
- Test: `server/test/docs.test.js` (validation through the docs API, like the existing `classId` cases) and `server/test/profiles.test.js`

**Interfaces:**
- Produces:
  - A character doc accepts `account: 'normal' | 'premium'`. Any other value gets the same error as other invalid fields.
  - `GET /api/profiles/:uid` characters include `account` when it is valid and omit it otherwise.

- [ ] **Step 1: Failing tests.** Read how `docs.test.js` writes a character with an invalid `classId`, then copy that test for `account`:
  - `account: 'normal'` and `account: 'premium'` → 200, and the value is stored.
  - `account: 'gold'`, `account: 1` and `account: null` → the same status and error code as the existing invalid-field case.

  In `profiles.test.js`, extend the friends-with-shared-energy case: one character saved with `account: 'normal'` comes back with `account: 'normal'`, and one without it comes back with no `account` key.

- [ ] **Step 2: Run them, expect FAIL.** Run: `cd server && node --test --test-concurrency=1 test/docs.test.js test/profiles.test.js`.

- [ ] **Step 3: Implement**

```js
// validate.js, characters
    allowed: ['name', 'classId', 'energy', 'recordedAt', 'order', 'cp', 'cpGoal', 'notes', 'account'],
    fields: { …, account: (v) => v === 'normal' || v === 'premium' },
```
```js
// profiles.js, inside the map
        ...(d.account === 'normal' || d.account === 'premium' ? { account: d.account } : {}),
```

- [ ] **Step 4: Run the server suite.** Run: `cd server && node --test --test-concurrency=1`. Expected: only the two known Windows failures.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/validate.js server/src/routes/profiles.js server/test/docs.test.js server/test/profiles.test.js
git commit -m "feat(servidor): valida account (normal|premium) y lo comparte con los amigos"
```

---

### Task 5: Atreia rune alphabet and specimen sheet (user approval gate)

**Files:**
- Modify: `runes.js` (add `RUNE_GLYPHS`)
- Test: `runes.test.js`
- Create: `dev/rune-sheet.mjs` (renders the sheet with Playwright from a page built with `createElementNS`)

**Interfaces:**
- Produces:
  - `RUNE_GLYPHS: Array<{ name: string, d: string }>`, with 28 entries.
  - `d` is SVG path data on a 10 × 14 grid (x 0..10, y 0..14, y down), using only `M`, `L` and at most one `A` or `Q`.
  - `runeGlyph(i) → RUNE_GLYPHS[i % 28]`.

**Drawing rules** (from the spec), so the runes read as one family at 7-8 px:
- Each rune has one main stroke, vertical or diagonal.
- At most 4 subpaths (`M` count ≤ 4), straight lines plus at most one arc.
- No fills: the SVG gives every stroke the same width and square line ends.
- Use the Atreia vocabulary: wing strokes (short diagonals rising out from the stem), crescent arcs, chevrons and crossbars at 1/3 and 2/3.
- No rune may resemble a Latin letter, a digit or an Elder Futhark rune. Compare each one with ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ and with A–Z, and redraw it if it matches.
- Give each rune a short invented name in Spanish-like phonetics (`'ael'`, `'dren'`, …) for review and tests.

- [ ] **Step 1: Failing tests** (`runes.test.js`)

```js
import { RUNE_GLYPHS, runeGlyph } from './runes.js';

test('alfabeto de Atreia: 28 runas con nombre y trazo únicos', () => {
  assert.equal(RUNE_GLYPHS.length, 28);
  assert.equal(new Set(RUNE_GLYPHS.map(g => g.name)).size, 28);
  assert.equal(new Set(RUNE_GLYPHS.map(g => g.d)).size, 28);
  assert.equal(runeGlyph(30), RUNE_GLYPHS[2]);
});
test('reglas de dibujo: rejilla 10×14, ≤ 4 trazos, solo M/L y como mucho un arco', () => {
  for (const { name, d } of RUNE_GLYPHS) {
    assert.match(d, /^[MLAQ0-9 .,-]+$/, name);
    assert.ok((d.match(/M/g) || []).length <= 4, `${name}: más de 4 trazos`);
    assert.ok((d.match(/[AQ]/g) || []).length <= 1, `${name}: más de un arco`);
    const nums = d.replace(/A[^MLQ]*/g, (a) => a.split(/[ ,]+/).slice(-2).join(' ')).match(/-?\d+(\.\d+)?/g).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      assert.ok(nums[i] >= 0 && nums[i] <= 10 && nums[i + 1] >= 0 && nums[i + 1] <= 14, `${name}: fuera de la rejilla`);
    }
  }
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `node --test runes.test.js`.

- [ ] **Step 3: Draw the 28 runes** in `runes.js`, as a frozen array of `{ name, d }`, with a header comment that states the drawing rules.

- [ ] **Step 4: Run it, expect PASS.** Run: `node --test runes.test.js`.

- [ ] **Step 5: Specimen sheet.** `dev/rune-sheet.mjs` serves a tiny page from Node with the right MIME types, or uses `page.setContent` with markup built in the script; that is fine in a dev tool because it never ships. It writes two PNGs:
  - `.impeccable/review/runas-muestra.png`:
    - A 7 × 4 grid of the 28 runes at 64 px, with their names.
    - A row of all 28 at real ring size (8 px tall).
    - The same sheet in Luz (`#2F3B55` background, `#E3A853` lit, `rgba(244,231,200,.28)` unlit) and in Sombra (read the Sombra tokens from `index.html`).
  - `.impeccable/review/runas-anillo.png`: one 104 px orb ring with these runes at 30% lit, in both themes. Draw the SVG ring with the glyphs centred on `runePoint(i, 46, 52)` and rotated so each rune's top points away from the centre.

  Look at the PNGs yourself. Redraw any rune that is illegible at 8 px or that breaks a rule.

- [ ] **Step 6: Commit and STOP**

```bash
git add runes.js runes.test.js dev/rune-sheet.mjs .impeccable/review/runas-muestra.png .impeccable/review/runas-anillo.png
git commit -m "feat(runas): alfabeto propio de Atreia (28 runas) y hoja de muestra"
```

**Gate:** the controller shows both PNGs to the user and waits for approval. If the user asks for changes, redraw, re-render and ask again. Task 6 starts only after a yes.

---

### Task 6: Runes in the SVG orb and the 3D orb

**Files:**
- Modify: `starorb.js` (stars → rune paths; mini size → short radial ticks)
- Modify: `orb3d.js` (star sprites → rune atlas texture)
- Modify: `index.html` CSS for the rune classes (rename `.so-star` styles to `.so-rune`, keeping the lit, new, beat and calm behaviour)
- Modify: `dev/preview.mjs`, `dev/e2e-web.mjs`, `starorb.test.js` and `orb3d.test.js`, wherever they count `.so-star`. Rename them to `.so-rune` and keep the count of 56.
- Test: `starorb.test.js`, `orb3d.test.js`

**Interfaces:**
- Consumes: `RUNE_GLYPHS`, `runeGlyph(i)`, `runePoint` and `litRunes(energy, max)`.
- Produces:
  - SVG: 56 `path.so-rune` nodes, each `d = runeGlyph(i).d`, placed with `transform="translate(x y) rotate(deg) scale(s) translate(-5 -7)"` so the rune is centred on its ring point with its top pointing outward. Use `s = 0.75` at 104 px, so a rune is about 10 px tall.
  - The classes `lit`, `new`, `full` and `near` keep their current meaning.
  - When `size <= 60`, the SVG draws `path.so-rune.tick` instead: a short radial line, 3 px long.
  - 3D: `buildRuneAtlas(doc) → HTMLCanvasElement` is exported. It is a 7 × 4 grid of 64 px cells with each glyph stroked in white with `new Path2D(d)`, line width 1.6 grid units and square caps.
  - The instanced rune quads in `orb3d.js` sample cell `i % 28` and are tinted lit, unlit or crimson in the shader, as the stars are now.
  - Quads are billboards (they always face the camera, upright), so every rune reads. The far half stays dimmer.

- [ ] **Step 1: Failing tests**

`starorb.test.js`:
```js
test('el anillo tiene 56 runas de Atreia con su trazo', () => {
  const svg = buildStarOrb(doc, { energy: 420, max: 840 });
  const runes = [...svg.querySelectorAll('.so-rune')];
  assert.equal(runes.length, 56);
  assert.equal(runes[0].getAttribute('d'), RUNE_GLYPHS[0].d);
  assert.equal(runes[29].getAttribute('d'), RUNE_GLYPHS[1].d);
  assert.equal(svg.getAttribute('data-lit'), '28');
});
test('mini orbe (44 px): marcas cortas en vez de runas', () => {
  const svg = buildStarOrb(doc, { energy: 0, size: 44 });
  assert.equal(svg.querySelectorAll('.so-rune.tick').length, 56);
});
```
(Use the fake DOM that `starorb.test.js` already uses. If it does not support `querySelectorAll`, use the helper it already has for counting stars.)

`orb3d.test.js`: test the pure part. Export `atlasCell(i) → { col, row }` with `col = (i % 28) % 7` and `row = floor((i % 28) / 7)`, and check `atlasCell(0)`, `atlasCell(7)`, `atlasCell(27)` and `atlasCell(28)`.

- [ ] **Step 2: Run them, expect FAIL.** Run: `node --test starorb.test.js orb3d.test.js`.

- [ ] **Step 3: Implement** in `starorb.js` and `orb3d.js` as described under Interfaces. Remove `starPath` if nothing uses it. Keep `syncOrbMotion`, `markGain`, the ripple and the beat untouched.

- [ ] **Step 4: Run every check**

Run, in order:
- `node --test *.test.js web/*.test.js`
- `npm run build:web`
- `cd server && node --test --test-concurrency=1`
- `node dev/e2e-web.mjs`
- `node dev/preview.mjs`

Expected: everything passes, except the known server failures and the 6 known preview failures.

- [ ] **Step 5: Screenshots.** Take the Energía screen at 1280 px and 390 px, in Luz and Sombra, and save it to `.impeccable/review/runas-orbe-*.png`. Use the same seeding as the orb3d screenshots, with one Normal and one Premium character. Look at them yourself: the runes must be readable on the 3D ring and on the SVG fallback (launch with `--disable-webgl` for that one), and nothing may be clipped.

- [ ] **Step 6: Commit**

```bash
git add starorb.js starorb.test.js orb3d.js orb3d.test.js index.html dev/preview.mjs dev/e2e-web.mjs .impeccable/review/runas-orbe-*.png
git commit -m "feat(runas): el anillo del orbe (SVG y 3D) usa las runas de Atreia"
```

---

### Task 7: E2E for accounts and DESIGN.md

**Files:**
- Modify: `dev/e2e-web.mjs`
- Modify: `DESIGN.md`

- [ ] **Step 1: Add e2e checks**, in the same `check(...)` style as the file:
  - Add a character with the default selection: the row shows `/ 560`, there is no `.acct-mark`, and the header shows `tope 560` and `+15 OD`.
  - Add a second one choosing Premium: the row shows `/ 840` and has `.acct-mark` with the text Premium, and the header shows «Recarga en» with no `tope`.
  - Edit the Premium character to Normal without changing the energy field: the energy number stays the same, `/ 560` is shown, and the mark disappears.
  - Server side: a `fetch` PATCH of a character with `account: 'gold'` gets the validation error status.
  - The existing console and CSP checks still pass.

- [ ] **Step 2: Run it.** Run: `node dev/e2e-web.mjs`. Expected: all checks pass.

- [ ] **Step 3: DESIGN.md.**
  - Add the Premium mark to the components section.
  - Describe the Atreia runes in the orb section: 28 original glyphs, the drawing rules, lit, unlit and beat states, and ticks on mini orbs.
  - Replace any "56 stars" wording with "56 runes".
  - Add a **Don't** line: never copy the official Aion 2 script or Futhark runes into the ring.

- [ ] **Step 4: Commit**

```bash
git add dev/e2e-web.mjs DESIGN.md
git commit -m "test(e2e): cuentas normal y premium; DESIGN.md con la marca Premium y las runas de Atreia"
```
