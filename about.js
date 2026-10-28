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
