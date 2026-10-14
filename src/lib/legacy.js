// Fingerprints identify untouched v1 examples without bundling demo content.
const FIELDS = {
  notes: ['title', 'body', 'emoji', 'mood', 'folder', 'color'],
  tasks: ['title', 'description', 'priority', 'status', 'due'],
  habits: ['name', 'emoji', 'days'],
  folders: ['name', 'emoji', 'parent'],
};
const DEMO_HASHES = {
  notes: { n1: 3269618672, n2: 1070900988, n3: 178823733, n4: 1749489388 },
  tasks: { t1: 371910556, t2: 2199387384, t3: 1833215593, t4: 3325262127 },
  habits: { h1: 1279513773, h2: 1897903929, h3: 814561004, h4: 3756581109 },
  folders: { personal: 1626963638, reflections: 3082300617, work: 1554663438, ideas: 3041182879 },
};
export function isLegacyExample(item, type) {
  const text = JSON.stringify(
    FIELDS[type].map((field) => (field === 'due' ? (item[field] ? 'dated' : '') : item[field])),
  );
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return DEMO_HASHES[type][item.id] === hash >>> 0;
}
