// server/test/stream.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

const AT = '__Host-odyle_at';

// Abre el stream contra el servidor real (inject no sirve para respuestas que no terminan).
async function open(base, token) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream`, { headers: { cookie: `${AT}=${token}` }, signal: ctrl.signal });
  const events = [];
  let buf = ''; let ended = false;
  if (res.status === 200) {
    (async () => {
      const dec = new TextDecoder();
      try {
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const type = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (type) events.push({ type, data: JSON.parse(data) });
          }
        }
      } catch { /* abortado */ }
      ended = true;
    })();
  }
  const next = async (type, ms = 1000) => {
    for (let t = 0; t < ms; t += 10) {
      const k = events.findIndex((e) => e.type === type);
      if (k >= 0) return events.splice(k, 1)[0].data;
      await new Promise((r) => setTimeout(r, 10));
    }
    return null;
  };
  return { res, events, next, close: () => ctrl.abort(), get ended() { return ended; } };
}

async function live(n = 2, extra) {
  const s = await socialSetup(n, extra);
  await s.app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${s.app.server.address().port}`;
  return { ...s, base };
}

test('sin sesión → 401; con sesión → hello y cabeceras correctas', async (t) => {
  const s = await live(); t.after(() => s.app.close());
  assert.equal((await fetch(`${s.base}/api/stream`)).status, 401);
  const a = await open(s.base, s.tokens.A);
  assert.equal(a.res.status, 200);
  assert.match(a.res.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(a.res.headers.get('cache-control'), 'no-store');
  assert.ok(a.res.headers.get('content-security-policy'));
  assert.equal(a.res.headers.get('x-frame-options'), 'DENY');
  assert.equal(a.res.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.deepEqual(await a.next('hello'), { uid: s.ids.A });
  a.close();
});

test('presencia: solo a amigos; sigue en línea con dos pestañas hasta cerrar la última', async (t) => {
  const s = await live(3); t.after(() => s.app.close());
  await s.befriend('A', 'B');
  const b = await open(s.base, s.tokens.B); await b.next('hello');
  const c = await open(s.base, s.tokens.C); await c.next('hello');
  const a1 = await open(s.base, s.tokens.A); await a1.next('hello');
  assert.deepEqual(await b.next('presence'), { uid: s.ids.A, online: true });
  assert.equal(await c.next('presence', 200), null);
  const a2 = await open(s.base, s.tokens.A); await a2.next('hello');
  a1.close();
  assert.equal(await b.next('presence', 300), null);
  assert.equal((await s.call('GET', '/api/friends', 'B')).json().friends[0].online, true);
  a2.close();
  assert.deepEqual(await b.next('presence'), { uid: s.ids.A, online: false });
  b.close(); c.close();
});

test('cuarta conexión del mismo usuario: cierra la más antigua y acepta la nueva', async (t) => {
  const s = await live(); t.after(() => s.app.close());
  const open3 = [];
  for (let i = 0; i < 3; i++) { const x = await open(s.base, s.tokens.A); await x.next('hello'); open3.push(x); }
  const d = await open(s.base, s.tokens.A);
  assert.equal(d.res.status, 200);
  assert.deepEqual(await d.next('hello'), { uid: s.ids.A });
  assert.equal(await until(() => open3[0].ended), true);
  assert.equal(open3[1].ended, false);
  assert.equal(s.app.presence.count(s.ids.A), 3);
  open3.forEach((x) => x.close()); d.close();
});

test('el stream se cierra al caducar el token (Review Focus 1)', async (t) => {
  const s = await live(2, { streamTtlScale: 1 / 15000 }); t.after(() => s.app.close()); // 15 min → 60 ms
  const a = await open(s.base, s.tokens.A); await a.next('hello');
  for (let i = 0; i < 100 && !a.ended; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.ended, true);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 1500) { for (let t = 0; t < ms; t += 10) { if (fn()) return true; await sleep(10); } return fn(); }

test('abortar durante el aviso de presencia no deja presencia ni suscripción', async (t) => {
  const s = await live(2); t.after(() => s.app.close());
  await s.befriend('A', 'B');
  const orig = s.app.bus.publish.bind(s.app.bus);
  s.app.bus.publish = async (...args) => { await sleep(150); return orig(...args); };
  const a = await open(s.base, s.tokens.A);
  a.close();
  assert.equal(await until(() => s.app.presence.count(s.ids.A) === 0), true);
  await sleep(400);
  assert.equal(s.app.presence.count(s.ids.A), 0);
  assert.equal((await s.call('GET', '/api/friends', 'B')).json().friends[0].online, false);
});

test('bus.publish que falla no impide abrir el stream y la presencia vuelve a 0', async (t) => {
  const s = await live(2); t.after(() => s.app.close());
  await s.befriend('A', 'B');
  s.app.bus.publish = async () => { throw new Error('boom'); };
  const a = await open(s.base, s.tokens.A);
  assert.equal(a.res.status, 200);
  assert.deepEqual(await a.next('hello'), { uid: s.ids.A });
  assert.equal(s.app.presence.count(s.ids.A), 1);
  a.close();
  assert.equal(await until(() => s.app.presence.count(s.ids.A) === 0), true);
});

test('app.close() con un stream abierto termina pronto y el cliente ve el fin', async (t) => {
  const s = await live(2);
  const a = await open(s.base, s.tokens.A); await a.next('hello');
  const t0 = Date.now();
  await s.app.close();
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(await until(() => a.ended), true);
});
