// social.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortFriends, mergeMessages, otherOf, applyIncoming, totalUnread, markRead, serversOf, filterResults,
  parseMessageText, parseInvite, makeClientId, actionsFor, friendEnergy, shareText,
} from './social.js';

const ME = 'u_me';
const msg = (id, from, to, at, extra = {}) => ({ id, from, to, kind: 'text', body: { text: id }, at, readAt: null, ...extra });
const conv = (uid, last, unread = 0) => ({ profile: { uid, nick: uid }, last, unread, friend: true });

test('sortFriends: en línea primero, luego por nombre sin distinguir mayúsculas', () => {
  const out = sortFriends([{ nick: 'zeta', online: true }, { nick: 'Beta' }, { nick: 'alfa' }, { nick: 'Ómicron', online: true }]);
  assert.deepEqual(out.map((f) => f.nick), ['Ómicron', 'zeta', 'alfa', 'Beta']);
});

test('mergeMessages: el mismo mensaje por POST y por el canal en vivo aparece una vez', () => {
  const a = msg('a', ME, 'x', 1), b = msg('b', 'x', ME, 2);
  const out = mergeMessages([a], [b, { ...a }, b]);
  assert.deepEqual(out.map((m) => m.id), ['a', 'b']);
});
test('mergeMessages: ordena por hora y, a igual hora, por id; la versión nueva sustituye (leído)', () => {
  const out = mergeMessages([msg('c', ME, 'x', 5), msg('b', ME, 'x', 5)], [msg('a', ME, 'x', 1), { ...msg('c', ME, 'x', 5), readAt: 9 }]);
  assert.deepEqual(out.map((m) => m.id), ['a', 'b', 'c']);
  assert.equal(out[2].readAt, 9);
});

test('otherOf', () => {
  assert.equal(otherOf(msg('a', ME, 'x', 1), ME), 'x');
  assert.equal(otherOf(msg('a', 'x', ME, 1), ME), 'x');
});

test('applyIncoming: mensaje de alguien sin conversación → arriba con 1 sin leer', () => {
  const convs = [conv('y', msg('old', 'y', ME, 10))];
  const out = applyIncoming(convs, msg('n', 'x', ME, 20), ME, { profile: { uid: 'x', nick: 'Xena' } });
  assert.equal(out[0].profile.nick, 'Xena');
  assert.equal(out[0].unread, 1);
  assert.equal(out[1].profile.uid, 'y');
});
test('applyIncoming: si la conversación está abierta o el mensaje es mío, no cuenta como no leído', () => {
  const convs = [conv('x', msg('o', 'x', ME, 1), 2)];
  assert.equal(applyIncoming(convs, msg('n', 'x', ME, 5), ME, { openUid: 'x' })[0].unread, 2);
  assert.equal(applyIncoming(convs, msg('m', ME, 'x', 5), ME)[0].unread, 2);
});
test('applyIncoming: el eco del mismo mensaje no cambia nada; uno más viejo no sustituye al último', () => {
  const last = msg('n', 'x', ME, 5);
  const convs = [conv('x', last, 1)];
  assert.equal(applyIncoming(convs, { ...last }, ME), convs);
  const out = applyIncoming(convs, msg('older', 'x', ME, 3), ME);
  assert.equal(out[0].last.id, 'n');
  assert.equal(out[0].unread, 2);
});
test('applyIncoming: sin perfil conocido crea uno mínimo con el uid', () => {
  const out = applyIncoming([], msg('n', 'x', ME, 5), ME);
  assert.deepEqual(out[0].profile, { uid: 'x', nick: '' });
});

test('totalUnread y markRead', () => {
  const convs = [conv('x', null, 2), conv('y', null, 3)];
  assert.equal(totalUnread(convs), 5);
  const out = markRead(convs, 'x');
  assert.equal(out[0].unread, 0);
  assert.equal(out[1], convs[1]);
});

const R = [
  { uid: '1', nick: 'Ana', server: 'Israphel', faction: 'elyos', mainClass: 'templario' },
  { uid: '2', nick: 'Anabel', server: ' Nezakan ', faction: 'asmodian', mainClass: 'cantor' },
  { uid: '3', nick: 'Anatol', server: '', faction: 'elyos', mainClass: null },
];
test('serversOf: únicos, sin vacíos, ordenados', () => {
  assert.deepEqual(serversOf(R), ['Israphel', 'Nezakan']);
});
test('filterResults: por servidor, facción y clase', () => {
  assert.deepEqual(filterResults(R, {}).map((r) => r.uid), ['1', '2', '3']);
  assert.deepEqual(filterResults(R, { server: 'Nezakan' }).map((r) => r.uid), ['2']);
  assert.deepEqual(filterResults(R, { faction: 'elyos' }).map((r) => r.uid), ['1', '3']);
  assert.deepEqual(filterResults(R, { faction: 'elyos', classId: 'templario' }).map((r) => r.uid), ['1']);
});

test('parseMessageText: 1 a 1000 caracteres, sin controles ni bidi, saltos de línea conservados', () => {
  assert.deepEqual(parseMessageText('  hola\nque tal  '), { ok: true, value: 'hola\nque tal' });
  assert.equal(parseMessageText('   ').ok, false);
  assert.equal(parseMessageText('a'.repeat(1001)).ok, false);
  assert.equal(parseMessageText('a'.repeat(1000)).ok, true);
  assert.equal(parseMessageText('x\u202Ey\u0007').value, 'xy');
});

test('parseInvite: título 1–60, fecha en el próximo año, plazas 1–12, coste 0–840', () => {
  const now = 1_000_000_000_000;
  const ok = parseInvite({ title: '  Mazmorra   de  fuego ', at: now + 3_600_000, slots: '6', cost: '40' }, now);
  assert.deepEqual(ok, { ok: true, value: { kind: 'invite', title: 'Mazmorra de fuego', at: now + 3_600_000, slots: 6, cost: 40 } });
  assert.equal(parseInvite({ title: '', at: now + 1, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x'.repeat(61), at: now + 1, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now - 3_600_000, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 400 * 86_400_000, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: NaN, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 1, slots: 13, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 1, slots: 2.5, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 1, slots: 2, cost: 841 }, now).ok, false);
});

test('makeClientId: 20 caracteres válidos para el servidor', () => {
  const id = makeClientId();
  assert.match(id, /^[A-Za-z0-9_-]{20}$/);
  assert.notEqual(makeClientId(), id);
  assert.equal(makeClientId(() => 0), 'A'.repeat(20));
});

test('actionsFor según la relación', () => {
  assert.deepEqual(actionsFor('none'), ['add']);
  assert.deepEqual(actionsFor('pending-out'), ['cancel']);
  assert.deepEqual(actionsFor('pending-in'), ['accept', 'reject']);
  assert.deepEqual(actionsFor('friends'), ['message', 'remove']);
  assert.deepEqual(actionsFor('self'), []);
  assert.deepEqual(actionsFor('blocked'), []);
});

test('friendEnergy: proyecta con la hora de recarga de quien mira y ordena por energía', () => {
  const TICK = 10_800_000, anchor = 0, now = 2 * TICK + 5;
  const out = friendEnergy([
    { name: 'Bea', classId: 'cantor', energy: 100, recordedAt: 1 },
    { name: 'Ana', classId: 'nope', energy: 830, recordedAt: 1 },
    { name: 'Rota', energy: 'x', recordedAt: 1 },
  ], anchor, now);
  assert.deepEqual(out.map((r) => [r.name, r.energy, r.isFull, r.classId]), [['Ana', 840, true, null], ['Bea', 130, false, 'cantor']]);
  assert.equal(out[1].percent, 15);
});
test('friendEnergy: sin hora de recarga muestra lo guardado; sin personajes, lista vacía', () => {
  assert.equal(friendEnergy([{ name: 'A', energy: 300, recordedAt: 0 }], null, 10)[0].energy, 300);
  assert.deepEqual(friendEnergy(null, 0, 0), []);
});

test('shareText', () => {
  assert.equal(shareText([]), null);
  assert.equal(shareText([{ name: 'Ana', energy: 840, isFull: true }, { name: 'Bea', energy: 300, isFull: false }]),
    'Mi energía: Ana 840/840 (lleno) · Bea 300/840');
});
