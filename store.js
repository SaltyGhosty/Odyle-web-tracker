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
    cp: member + '/cp', // one doc per character: {points:[{at, cp}]}
    tasks: member + '/settings/tasks',
    progress: member + '/progress', // one doc per character
    stats: member + '/settings/stats',
  };
}

// Old shared 'characters' docs that still need copying into the owner's own collection.
export function planMigration(oldDocs, newIds) {
  return oldDocs.filter(d => !newIds.has(d.id));
}
