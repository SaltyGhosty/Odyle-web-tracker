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
