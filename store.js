// Where each member's data lives in the artifact db. Everyone reads every member;
// each member writes only under members/<their id> (see the db rules in index.html).
export function paths(uid) {
  const member = 'members/' + uid;
  return {
    member,
    characters: member + '/characters',
    presets: member + '/settings/presets',
    prefs: member + '/settings/prefs',
    events: member + '/events',
  };
}

// Old shared 'characters' docs that still need copying into the owner's own collection.
export function planMigration(oldDocs, newIds) {
  return oldDocs.filter(d => !newIds.has(d.id));
}
