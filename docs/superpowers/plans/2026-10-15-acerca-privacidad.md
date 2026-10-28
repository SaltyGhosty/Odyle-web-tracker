# «Acerca de», donaciones, privacidad y borrar cuenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an «Acerca de» section with a PayPal donation link, a `/privacidad` privacy-policy page, and a «Borrar mi cuenta» flow that erases all of a user's data and hands their legion to the oldest member.

**Architecture:**
- One tiny constants module, `about.js`, feeds both the in-app section and the privacy page.
- `/privacidad` is a static page like `/login`: same neutral `auth.css`, same i18n script, and its content built with DOM APIs from a texts module.
- Account deletion is one server transaction in a new `server/src/lib/account-delete.js`, called from a new auth route. The client gets a confirm dialog in the profile modal.

**Tech Stack:** Vanilla ES modules and classic scripts, Fastify 5 + Postgres, `node --test`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-15-acerca-privacidad-design.md`

## Global Constraints

- PayPal link exactly `https://www.paypal.com/donate/?hosted_button_id=TDCGD3C8KHRAS`. It is opened with `target="_blank" rel="noopener noreferrer"`, and no PayPal script is ever loaded.
- Controller: «Luciano Labbozzetta»; contact `odyletracker@gmail.com`.
- Fan notice: «Sitio de fans no oficial, no afiliado a NCSOFT. Aion 2 es una marca de NCSOFT.»
- Donation note: «Las donaciones ayudan a pagar el servidor. No dan ventajas ni funciones extra.»
- Strict CSP and Trusted Types:
  - no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function`;
  - `setTimeout` only with an arrow function;
  - `import()` only with a string literal;
  - no inline `<script>` or `<style>` in served HTML.
- Every new UI literal is in Spanish in the code and translated to en, it and pt: `i18n-strings.js` for the app, `web/auth-i18n.js` for account pages, and the texts module for the policy.
- The user's email is never sent to any new service.
- 44 px touch targets; dialogs have a title, a description, a focus trap and Escape.
- Deleting an account: password-confirmed, CSRF-protected like the other auth POSTs, rate-limited like login. It runs in one transaction, and messages sent and received are deleted.
- Legion of a deleted leader:
  - it passes to the oldest other member, the one with the smallest `members/<uid>.joinedAt`, ties broken by uid;
  - with no other member, the legion, its `legionData` and its code are deleted.
- No Co-Authored-By trailer in commits. Do not push. Implementers never dispatch subagents.
- Ponytail: smallest complete change; no unrequested abstractions; tests for new logic; never cut validation, security or accessibility.
- Verify with:
  - root: `node --test *.test.js web/*.test.js`;
  - `npm run build:web`;
  - `cd server && node --test --test-concurrency=1` (only `app.test.js:166` and the SR-34 pages test may fail; they are known Windows failures);
  - `node dev/e2e-web.mjs` (needs `npm i --no-save playwright`);
  - `node dev/preview.mjs` (6 known failures on main: "rune timer text" ×4, "no schedule: rune timer says so", "seeded: class icon and name shown").

## Review Focus

1. **A leader whose heir already left or was banned** must not get a banned or departed heir. Only members with `legionId`/`legionEpoch` matching the legion and not in `banned` count. Test: Task 3, «heredero: ignora expulsados y ex miembros».
2. **The deleted user's other sessions and open tabs** must stop working right away: refresh fails and `/api/auth/me` gives 401. Test: Task 3, «sesiones: otra sesión del mismo usuario deja de servir».
3. **Wrong password repeated many times** must hit the login-style rate limit and lockout, not allow brute force through the delete endpoint. Test: Task 3, «límite de intentos en delete-account».
4. **`/privacidad` opened directly in another language** (`odyle-lang` = it) must render Italian with no Spanish left. Test: Task 2, the e2e language check.
5. **The artifact build (no server)** must not show the delete button or a `/privacidad` relative link. Test: Task 1 (`aboutModel({ social:false })`) and Task 4 (button only when `window.odyleSocialApi` exists).

---

### Task 1: `about.js` and the «Acerca de» section

**Files:**
- Create: `about.js`, `about.test.js`
- Modify:
  - `layout.js:7-17`: add the section after `novedades`;
  - `icons.js`: add the `acerca` icon;
  - `index.html`:
    - section markup: a new `<section id="tab-acerca">` placed like the other tab sections;
    - `TABS` and `PLACE` near line 1783;
  - `i18n-strings.js`;
  - `scripts/build-web.mjs`: add `about.js` to EXPECTED.
- Test: `about.test.js`, `layout.test.js`, `icons.test.js`

**Interfaces:**
- Produces:
  - `about.js` exports `ABOUT = { paypal, contact, controller, site }` (frozen strings), with `site = 'https://odyle-tracker.onrender.com'`;
  - `about.js` exports `aboutModel({ social }) → { privacyHref, artifactNote }`:
    - when `social` is true: `privacyHref = '/privacidad'`, `artifactNote = null`;
    - otherwise: `privacyHref = ABOUT.site + '/privacidad'`, `artifactNote = 'En esta versión los datos los guarda claude.ai.'`.

- [ ] **Step 1: Failing tests**

```js
// about.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT, aboutModel } from './about.js';

test('constantes del sitio', () => {
  assert.equal(ABOUT.paypal, 'https://www.paypal.com/donate/?hosted_button_id=TDCGD3C8KHRAS');
  assert.equal(new URL(ABOUT.paypal).hostname, 'www.paypal.com');
  assert.equal(ABOUT.contact, 'odyletracker@gmail.com');
  assert.equal(ABOUT.controller, 'Luciano Labbozzetta');
  assert.ok(Object.isFrozen(ABOUT));
});
test('web: privacidad relativa y sin nota; artifact: enlace absoluto y nota', () => {
  assert.deepEqual(aboutModel({ social: true }), { privacyHref: '/privacidad', artifactNote: null });
  const a = aboutModel({ social: false });
  assert.equal(a.privacyHref, 'https://odyle-tracker.onrender.com/privacidad');
  assert.equal(a.artifactNote, 'En esta versión los datos los guarda claude.ai.');
});
```

In `layout.test.js`, add a test that `navModel({ social: true }).rail` and `navModel({ social: false }).rail` both end with `'acerca'`, that `'acerca'` is in `more` for both, and that `resolveTab('acerca', { social: false })` returns `'acerca'`. In `icons.test.js`, extend the existing "every section has an icon" check, if there is one; otherwise add `assert.ok(ICONS.acerca)`.

- [ ] **Step 2: Run them, expect FAIL.** Run: `node --test about.test.js layout.test.js icons.test.js`.

- [ ] **Step 3: Implement**

```js
// about.js
// Site facts shown in «Acerca de» and on /privacidad. One place, so they never drift apart.
export const ABOUT = Object.freeze({
  paypal: 'https://www.paypal.com/donate/?hosted_button_id=TDCGD3C8KHRAS',
  contact: 'odyletracker@gmail.com',
  controller: 'Luciano Labbozzetta',
  site: 'https://odyle-tracker.onrender.com',
});
// The artifact (claude.ai) has no server: its data lives in claude.ai, and the policy is the web one.
export function aboutModel({ social }) {
  return social
    ? { privacyHref: '/privacidad', artifactNote: null }
    : { privacyHref: ABOUT.site + '/privacidad', artifactNote: 'En esta versión los datos los guarda claude.ai.' };
}
```

`layout.js`: append `{ id: 'acerca', label: 'Acerca de', icon: 'acerca', social: false }` to `SECTIONS`.

`icons.js`: add an `acerca` stroke icon in the same style as the others (24×24 viewBox, 1.75 stroke): a circle with an «i», `'M12 3 A9 9 0 1 1 11.99 3 M12 10.5 V17 M12 7 V7.5'`.

`index.html`, a new tab section. Build it with `el()` in the module, like the other sections, and fill it once at startup:
1. `<h2>Acerca de Odyle Tracker</h2>` plus `<p>Odyle Tracker lleva la cuenta de la energía Odyle de tus personajes de Aion 2 y te avisa antes de que se desperdicie. Es gratis y sin anuncios.</p>`.
2. `<p class="fan-note">` with the fan notice, verbatim.
3. A block «Apoyar el proyecto»: `el('a', { class: 'btn primary', href: ABOUT.paypal, target: '_blank', rel: 'noopener noreferrer' }, 'Donar con PayPal')` plus `<p class="hint">` with the donation note, verbatim.
4. A block «Privacidad»:
   - when `artifactNote` is null: a link `privacyHref` «Política de privacidad», plus «Contacto: » and `el('a', { href: 'mailto:' + ABOUT.contact }, ABOUT.contact)` (the address with `translate="no"`);
   - otherwise: the note plus a link to `privacyHref`, with `target="_blank" rel="noopener noreferrer"`.
5. A block «Créditos», as three `<li>`:
   - «Letras Marcellus y Gothic A1 (SIL Open Font License)»;
   - «three.js (licencia MIT)»;
   - «Iconos y runas originales de Odyle Tracker».

`social` is `!!window.odyleSocialApi`, the same flag the page already uses for `navModel`. Wire `acerca` into `PLACE` so the section shows its own node. Style the section with the existing panel classes only; the button is the existing primary button style, with min-height 44 px.

`i18n-strings.js`: add en/it/pt for every new literal above, including 'Acerca de' and the note.

- [ ] **Step 4: Run tests and build.** Run: `node --test *.test.js web/*.test.js`, then `npm run build:web`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add about.js about.test.js layout.js layout.test.js icons.js icons.test.js index.html i18n-strings.js scripts/build-web.mjs
git commit -m "feat(acerca): sección Acerca de con donación por PayPal, aviso de fans, privacidad y créditos"
```

---

### Task 2: The `/privacidad` page

**Files:**
- Create:
  - `web/privacidad.html`;
  - `web/privacy.js`: classic script; builds the page from texts with DOM APIs;
  - `web/privacy-text.js`: classic script; defines `window.odylePrivacyText = { es: [...], en, it, pt }`;
  - `web/privacy-text.test.js`: a node test that loads the file in a `vm` context.
- Modify:
  - `server/src/routes/pages.js:8`: add `/privacidad` with its own HTML file;
  - `scripts/build-web.mjs:56`: copy the 3 new files;
  - `web/auth.js`: register and login footers link to the policy;
  - `web/auth-i18n.js`: the new link texts;
  - `server/test/pages.test.js`.

**Interfaces:**
- Produces:
  - each language in `window.odylePrivacyText[lang]` is an array of sections `{ h: string, p: string[] }`;
  - the controller name and email are written in the texts exactly as `Luciano Labbozzetta` and `odyletracker@gmail.com`;
  - the date line is the first paragraph of the first section: `Última actualización: 15 de octubre de 2026` (and its translations).

- [ ] **Step 1: Failing tests**

```js
// web/privacy-text.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('./privacy-text.js', import.meta.url), 'utf8'), ctx);
const T = ctx.window.odylePrivacyText;

test('cuatro idiomas con las mismas 11 secciones', () => {
  assert.deepEqual(Object.keys(T).sort(), ['en', 'es', 'it', 'pt']);
  for (const l of Object.keys(T)) assert.equal(T[l].length, 11, l);
});
test('cada idioma nombra al responsable, el contacto, Render, Resend, PayPal y el año de los mensajes', () => {
  for (const [l, secs] of Object.entries(T)) {
    const all = secs.map(s => [s.h, ...s.p].join(' ')).join(' ');
    for (const must of ['Luciano Labbozzetta', 'odyletracker@gmail.com', 'Render', 'Resend', 'PayPal', 'Frankfurt']) {
      assert.ok(all.includes(must), `${l}: falta ${must}`);
    }
  }
});
```

In `server/test/pages.test.js`, add a test that copies the existing `auth.html` test (around line 72). `GET /privacidad` must return:
- status 200;
- `referrer-policy: no-referrer`;
- the exact CSP header that the existing test asserts for `/login`;
- a body with no inline `<script>` and no `<style>`, containing `<script src="privacy-text.js"></script>` and `<script src="privacy.js"></script>`.

- [ ] **Step 2: Run them, expect FAIL.** Run: `node --test web/privacy-text.test.js`, then `cd server && node --test --test-concurrency=1 test/pages.test.js`.

- [ ] **Step 3: Implement**

`web/privacidad.html`: the same skeleton as `web/auth.html`:
- the same `<head>` (`fonts.css`, `auth.css`) and the `<title>` «Odyle Tracker · Privacidad»;
- `<header class="auth-top"></header>`, then `<main class="auth privacy">` with the emblem SVG and the meridian rule copied from `auth.html`, `<h1>` «Política de privacidad», and `<article id="policy" translate="no"></article>`, plus a back link to `/` «Volver a Odyle Tracker»;
- scripts in this order: `auth-i18n.js`, `privacy-text.js`, `privacy.js`.

`web/privacy.js`:

```js
// /privacidad: builds the policy in the chosen language with DOM APIs only (no HTML sinks).
(function () {
  'use strict';
  const i18n = window.odyleAuthI18n, T = window.odylePrivacyText;
  const art = document.getElementById('policy');
  function paint() {
    const secs = T[i18n.lang] || T.es;
    const nodes = [];
    for (const s of secs) {
      const h = document.createElement('h2'); h.textContent = s.h; nodes.push(h);
      for (const t of s.p) { const p = document.createElement('p'); p.textContent = t; nodes.push(p); }
    }
    art.replaceChildren(...nodes);
    document.documentElement.lang = T[i18n.lang] ? i18n.lang : 'es';
  }
  document.querySelector('.auth-top').append(i18n.menu());
  i18n.onChange(paint);
  paint();
})();
```

`web/privacy-text.js`: `window.odylePrivacyText = { es: [ … ], en: [ … ], it: [ … ], pt: [ … ] };`. It has the 11 sections of spec §3, in order:
1. Responsable (the date line, then the controller line: «Luciano Labbozzetta. Contacto: odyletracker@gmail.com. Odyle Tracker es un proyecto de fans sin ánimo de lucro.»)
2. Datos que guardamos
3. Para qué
4. Base legal
5. Quién más trata los datos
6. Cuánto tiempo
7. Cookies y almacenamiento
8. Tus derechos
9. Menores
10. Cambios
11. Contacto

Write every fact from spec §3, plain and short, translated faithfully to en, it and pt. Section 8 names «Exportar» in Ajustes and «Borrar mi cuenta» in the profile, using each language's UI label from `i18n-strings.js`.

`server/src/routes/pages.js`:
- read `privacidad.html` alongside `auth.html` (both inside the try, treated as "not built" if missing);
- register `app.get('/privacidad', …)` with the same `html(reply)`, `referrer-policy: no-referrer` and `cache-control: no-cache` (not `no-store`; it is public);
- make `allowedStaticPath` also refuse the raw `privacidad.html`, the way it refuses `auth.html`.

`scripts/build-web.mjs:56`: add `'privacidad.html', 'privacy.js', 'privacy-text.js'` to the copied list.

`web/auth.js`:
- in `registerView`, under the submit button, add `h('p', { class: 'hint' }, t('Al crear la cuenta aceptas la'), ' ', h('a', { href: '/privacidad', text: t('política de privacidad') }))`;
- in `loginView`'s `.links`, add `h('a', { href: '/privacidad', text: t('Privacidad') })`;
- add the three strings to `web/auth-i18n.js` for en, it and pt.

`auth.css`: add `.privacy` rules: `max-width: 720px`, readable line-height, `h2` in the display font. Use tokens only.

- [ ] **Step 4: Run tests and build.** Run:
  - `node --test *.test.js web/*.test.js`;
  - `npm run build:web`;
  - `cd server && node --test --test-concurrency=1` (only the known failures may remain).

- [ ] **Step 5: Commit**

```bash
git add web/privacidad.html web/privacy.js web/privacy-text.js web/privacy-text.test.js web/auth.js web/auth-i18n.js web/auth.css server/src/routes/pages.js server/test/pages.test.js scripts/build-web.mjs
git commit -m "feat(privacidad): página /privacidad en 4 idiomas, enlazada desde el registro y el login"
```

---

### Task 3: Server — delete account, with legion hand-over

**Files:**
- Create:
  - `server/src/lib/account-delete.js`;
  - `server/test/account-delete.test.js`.
- Modify: `server/src/routes/auth.js`: the new route, near `logout-all` (~289).

**Interfaces:**
- Consumes:
  - `generateCode`, `codeHash`, `sealCode` from `server/src/lib/legion-codes.js`;
  - `readDoc` / `writeDoc` patterns from `server/src/routes/legions.js`;
  - `verifyPassword`, `DUMMY_HASH`, `lockout`, `clearSessionCookies`, `invalidateUserCache` and the rate-limit helper `limit` from `auth.js`.
- Produces:
  - `deleteAccount(q, uid, { codeKey, now }) → { heir: string|null, legionDeleted: boolean }`. It runs inside a caller-provided transaction (`q`).
  - Route `POST /api/auth/delete-account`, body `{ password }`:
    - correct password → 200 `{ ok: true }`;
    - wrong password → 401 `{ error: 'Contraseña incorrecta' }`;
    - no session → 401;
    - over the limit → 429.

Legion hand-over, when `legions/<uid>` exists and its `leader === uid`:
1. Candidates: the `members/*` docs with `legionId === uid`, `legionEpoch === legion.epoch`, uid ≠ deleted uid, and not in `legion.banned`. The heir is the one with the smallest `joinedAt`; ties go to the smaller uid.
2. If there is no heir:
   - delete the `legionData/<uid>-<epoch>/wall` and `/calendar` children (copy the `delete from docs where parent in (...)` from `legions.js:220`);
   - delete `legions/<uid>` and the `legion_codes` row.
3. If there is an heir H:
   - write `legions/H = { ...legion, leader: H }`, with the epoch and banned list kept;
   - move the shared data: for every doc whose parent starts with `legionData/<uid>-<epoch>/`, update `path` and `parent`, replacing the prefix `legionData/<uid>-<epoch>` with `legionData/H-<epoch>`;
   - point every member with `legionId === uid` at H: set `legionId = H` and keep `legionEpoch`;
   - delete `legions/<uid>`;
   - remove the old code row and issue a fresh code for H (the same `freshCode`/`putCode` logic, inlined; the old code stops working, as with a rotation).

Then delete the user's data:
- `delete from docs where path = 'members/'||uid or path like 'members/'||uid||'/%' or path = 'feedback/'||uid`;
- the `legionData` docs authored by the user (`data->>'uid' = uid`), as `docs.js:130` already locates them;
- finally `delete from users where id = uid`. The foreign keys cascade to sessions, email tokens, friendships, blocks, messages and reports.

- [ ] **Step 1: Failing tests.** Read `server/test/legions.test.js` and `server/test/helpers.js` for app, user and login setup, then write:
  - «contraseña incorrecta: 401 y no se borra nada» (user row and characters still there);
  - «sin sesión: 401»;
  - «sin la cabecera CSRF: rechazado»: copy how existing tests send the CSRF header and omit it;
  - «borra todo»: user A with a character, a profile, feedback, a friendship with B, a block, a message to B and one from B, and a report each way. After deletion: `users`, `refresh_tokens`, the `docs members/A…`, `feedback/A`, `friendships`, `blocks`, `messages` and `reports` all have 0 rows mentioning A, and B's own data is intact;
  - «sesiones: otra sesión del mismo usuario deja de servir»: two logins; after deletion through one, `/api/auth/me` and `/api/auth/refresh` with the other give 401;
  - «líder con miembros: la legión pasa al más antiguo»: A creates a legion; C joins, then B (C has the earlier `joinedAt`); A writes a wall post. After deletion:
    - `legions/C` exists with `leader: C` and the same name and epoch, and `legions/A` is gone;
    - B's and C's members docs have `legionId: C`;
    - the wall doc now lives under `legionData/C-<epoch>/wall`;
    - `GET /api/legions/mine/code` as C returns a code, and the old code no longer joins;
  - «heredero: ignora expulsados y ex miembros»: the oldest candidate was kicked (banned) and another left, so the heir is the next valid member;
  - «líder solo: se borra la legión y su código»;
  - «límite de intentos en delete-account»: wrong passwords until 429.

- [ ] **Step 2: Run them, expect FAIL.** Run: `cd server && node --test --test-concurrency=1 test/account-delete.test.js`.

- [ ] **Step 3: Implement** `account-delete.js` as described, and the route:

```js
  const deleteLimits = [limit(30, HOUR, byIp), limit(5, MIN, (req) => `del|${req.user ? req.user.id : req.ip}`)];
  app.post('/api/auth/delete-account', { ...BODY, preHandler: [requireUser, ...deleteLimits] }, async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const password = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
    const lockKey = `del|${req.user.id}`;
    if (lockout.isLocked(lockKey)) return reply.code(429).send({ error: TOO_MANY });
    const user = (await db.query('select password_hash from users where id = $1', [req.user.id])).rows[0];
    const ok = await verifyPassword(user ? user.password_hash : DUMMY_HASH, password, req.arrivedAt);
    if (!user || !ok) { lockout.fail(lockKey); return reply.code(401).send({ error: 'Contraseña incorrecta' }); }
    lockout.reset(lockKey);
    await db.tx((q) => deleteAccount(q, req.user.id, { codeKey: config.codeKey, now: app.now() }));
    invalidateUserCache(req.user.id);
    clearSessionCookies(reply);
    return { ok: true };
  });
```

Adapt the names to the real helpers in `auth.js`; check that `requireUser` and the CSRF hook apply the same way they do to `logout-all`. If the live stream (`server/src/routes/stream.js`) keeps per-user connections, close the deleted user's connections the way `logout-all` or token-version checks already do. If there is no hook for that, rely on the token version: say so in the report and add no new mechanism.

- [ ] **Step 4: Run the server suite.** Run: `cd server && node --test --test-concurrency=1`. Expected: only the known failures remain.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/account-delete.js server/src/routes/auth.js server/test/account-delete.test.js
git commit -m "feat(cuenta): borrar cuenta con contraseña; la legión pasa al miembro más antiguo"
```

---

### Task 4: Client — «Borrar mi cuenta» dialog and the notice on `/login`

**Files:**
- Modify:
  - `index.html`: the profile modal (~1002-1030) and its module code near ~2658-2700;
  - `web/social-api.js`: add `deleteAccount(password)`, if the social API is where auth calls live (otherwise next to the existing logout call);
  - `web/auth.js` and `web/auth-i18n.js`: the `?borrada=1` notice;
  - `i18n-strings.js`.

**Interfaces:**
- Consumes: `POST /api/auth/delete-account` from Task 3.
- Produces: `window.odyleSocialApi.deleteAccount(password) → Promise<{ ok: true } | { error: string, status: number }>`. It uses the same fetch wrapper and CSRF header as the API's other POSTs.

- [ ] **Step 1: Implement the dialog**
- **Danger zone:** at the end of `#profile-form`, render only when `window.odyleSocialApi` exists. It is a separated block with a heading «Borrar mi cuenta», a hint «Se borran tu cuenta, personajes, perfil, amigos, mensajes y sugerencias. No se puede deshacer.», and a `button.danger` «Borrar mi cuenta…».
- **The `<dialog id="delete-dialog">`:**
  - `aria-labelledby` points to its title «¿Borrar tu cuenta para siempre?» and `aria-describedby` to the same explanation;
  - a password field «Tu contraseña» (`autocomplete="current-password"`);
  - an error line (`role="alert"`);
  - buttons «Cancelar» and «Borrar para siempre» (`button.danger`).
  - Open it with `showModal()`. Escape and «Cancelar» close it, and focus returns to the trigger.
- **On submit:**
  - an empty password shows «Escribe tu contraseña»;
  - otherwise disable the buttons and call `deleteAccount`;
  - 401 → «Contraseña incorrecta»; 429 → «Demasiados intentos; espera un poco»; any other failure → «No se pudo borrar ahora; inténtalo más tarde»;
  - on success → `location.assign('/login?borrada=1')`.
- **Danger style:** use the existing `--danger`/crimson tokens, with a 44 px min-height.
- **`web/auth.js`:** when `new URLSearchParams(location.search).get('borrada') === '1'`, the login view shows `h('p', { class: 'ok', role: 'status', text: t('Tu cuenta se ha borrado') })` above the form.
- **Translations:** add en/it/pt for every new literal, in `i18n-strings.js` and in `web/auth-i18n.js`.

- [ ] **Step 2: Run tests and build.** Run: `node --test *.test.js web/*.test.js` and `npm run build:web`. Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add index.html web/social-api.js web/auth.js web/auth-i18n.js i18n-strings.js
git commit -m "feat(cuenta): diálogo Borrar mi cuenta en el perfil y aviso en el login"
```

---

### Task 5: E2E and DESIGN.md

**Files:**
- Modify: `dev/e2e-web.mjs`, `DESIGN.md`

- [ ] **Step 1: Add e2e checks**, in the file's `check(...)` style:
  - **Rail at 1280 px:** clicking «Acerca de» shows the section. The PayPal link has the exact `href`, `target="_blank"` and `rel` containing `noopener` and `noreferrer`. The privacy link goes to `/privacidad`.
  - **Phone at 390 px:** «Más» → «Acerca de» opens the section.
  - **`/privacidad` without a session:**
    - it returns 200 and shows «Luciano Labbozzetta» and `odyletracker@gmail.com`;
    - with `localStorage['odyle-lang'] = 'it'` it shows the Italian heading and no Spanish heading;
    - there are no console or CSP errors.
  - **Registration:** `/registro` has a link to `/privacidad`.
  - **Delete with a wrong password:** register and log in a throw-away user, open the profile, then «Borrar mi cuenta…». A wrong password shows «Contraseña incorrecta» and the account still exists (`/api/auth/me` gives 200).
  - **Delete with the right password:** it lands on `/login?borrada=1` showing «Tu cuenta se ha borrado». Logging in again fails with «Correo o contraseña incorrectos».
  - **Existing checks:** all still pass. Use a fresh user for the deletion, so other checks keep their data.

- [ ] **Step 2: Run them.** Run: `node dev/e2e-web.mjs` (all green) and `node dev/preview.mjs` (only the 6 known failures).

- [ ] **Step 3: DESIGN.md.**
  - Add «Acerca de» to the navigation list.
  - Add the donation link style, the danger zone and the delete dialog to the components section.
  - Note that `/privacidad` uses the account-page (neutral) style.

- [ ] **Step 4: Commit**

```bash
git add dev/e2e-web.mjs DESIGN.md
git commit -m "test(e2e): Acerca de, /privacidad y borrar cuenta; DESIGN.md"
```
