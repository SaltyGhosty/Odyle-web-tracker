// Ataque: arrancar con secretos débiles o por defecto; secretos en el repositorio (SR-7, SR-37).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';
import { testEnv } from '../helpers.js';
import { ROOT } from './_lib.js';

test('secretos cortos, por defecto o mal codificados => el servidor no arranca', () => {
  const weak = ['changeme', 'secret', 'a'.repeat(31), Buffer.alloc(16).toString('base64'), Buffer.alloc(31, 1).toString('base64'),
    'contraseña-con-ñ-y-espacios muy larga de verdad 1234567890', ' ', ''];
  for (const name of ['JWT_SECRET', 'CODE_KEY']) {
    for (const v of weak) assert.throws(() => loadConfig(testEnv({ [name]: v })), undefined, `${name}=${JSON.stringify(v)} aceptado`);
  }
  // 32 bytes decodificados sí.
  assert.doesNotThrow(() => loadConfig(testEnv({ JWT_SECRET: Buffer.alloc(32, 7).toString('base64') })));
});

test('variable ausente o EMAIL_MODE inválido / sin valor => no arranca', () => {
  for (const name of ['APP_ORIGIN', 'JWT_SECRET', 'CODE_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'EMAIL_MODE', 'DATABASE_URL']) {
    const env = testEnv();
    delete env[name];
    assert.throws(() => loadConfig(env), undefined, `sin ${name} arrancó`);
  }
  for (const m of ['', 'FULL', 'owner', 'none', 'full ,owner-only']) {
    assert.throws(() => loadConfig(testEnv({ EMAIL_MODE: m })), undefined, `EMAIL_MODE=${m}`);
  }
});

test('JWT_SECRET y CODE_KEY iguales no comparten material de clave en la configuración', () => {
  const k = Buffer.alloc(32, 9).toString('base64');
  const c = loadConfig(testEnv({ JWT_SECRET: k, CODE_KEY: Buffer.alloc(32, 3).toString('base64') }));
  assert.notDeepEqual(Buffer.from(c.jwtSecret), Buffer.from(c.codeKey));
});

test('ningún archivo versionado contiene secretos ni .env; render.yaml (si existe) usa sync:false', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(!files.some((f) => /(^|\/)\.env(\.|$)/.test(f)), '.env versionado');
  const SECRET_RE = /(JWT_SECRET|CODE_KEY|RESEND_API_KEY|DATABASE_URL)\s*[:=]\s*['"]?(?!\s|['"]?\$|['"]?process|['"]?<|['"]?\.\.\.)[A-Za-z0-9+/=_-]{20,}/;
  const RESEND_RE = /\bre_[A-Za-z0-9]{20,}\b/;
  const PG_RE = /postgres(ql)?:\/\/[^\s'"@]+:[^\s'"@]+@(?!127\.0\.0\.1|localhost)/;
  for (const f of files) {
    if (/node_modules|package-lock\.json|\.(png|jpg|woff2?|ico)$/.test(f)) continue;
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    assert.ok(!SECRET_RE.test(src), `${f}: posible secreto en claro`);
    assert.ok(!RESEND_RE.test(src), `${f}: clave de Resend`);
    assert.ok(!PG_RE.test(src), `${f}: URL de Postgres con credenciales`);
  }
  const ry = path.join(ROOT, 'render.yaml');
  if (existsSync(ry)) {
    const y = readFileSync(ry, 'utf8');
    for (const k of ['JWT_SECRET', 'CODE_KEY', 'RESEND_API_KEY']) {
      const block = y.split(new RegExp(`key:\\s*${k}\\b`))[1];
      if (block) assert.match(block.split(/- key:/)[0], /sync:\s*false|generateValue:\s*true|fromDatabase/, `${k} en render.yaml sin sync:false`);
    }
  }
});
