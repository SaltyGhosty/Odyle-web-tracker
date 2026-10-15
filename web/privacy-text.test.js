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
test('forma {h, p[]} con textos no vacíos y el mismo número de párrafos por sección en cada idioma', () => {
  for (const [l, secs] of Object.entries(T)) {
    secs.forEach((s, i) => {
      assert.ok(typeof s.h === 'string' && s.h.trim(), `${l}[${i}].h`);
      assert.ok(Array.isArray(s.p) && s.p.length > 0, `${l}[${i}].p`);
      for (const p of s.p) assert.ok(typeof p === 'string' && p.trim(), `${l}[${i}] párrafo vacío`);
      assert.equal(s.p.length, T.es[i].p.length, `${l}[${i}] párrafos`);
    });
  }
});
test('la fecha es el primer párrafo de la primera sección', () => {
  assert.equal(T.es[0].p[0], 'Última actualización: 15 de octubre de 2026');
  for (const l of ['en', 'it', 'pt']) assert.match(T[l][0].p[0], /15.*2026|2026.*15/, l);
});
test('la contraseña se describe como hash argon2 en cada idioma', () => {
  for (const [l, secs] of Object.entries(T)) assert.ok(secs[1].p[0].includes('argon2'), l);
});
