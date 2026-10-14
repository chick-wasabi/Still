export const STORAGE_KEY = 'still-workspace-v2';
const ITERATIONS = 600000;
const encode = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export async function deriveKey(pin, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createCredentials(pin) {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Use a PIN with 6–12 digits.');
  if (!crypto.subtle) throw new Error('PIN protection requires HTTPS or localhost.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt, key: await deriveKey(pin, salt) };
}

export async function seal(data, credentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    credentials.key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return {
    version: 2,
    encrypted: true,
    iterations: ITERATIONS,
    salt: encode(credentials.salt),
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  };
}

export async function openVault(envelope, pin) {
  if (envelope.version !== 2 || envelope.iterations !== ITERATIONS)
    throw new Error('Unsupported vault format.');
  const salt = decode(envelope.salt);
  const key = await deriveKey(pin, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv) },
    key,
    decode(envelope.ciphertext),
  );
  return { data: JSON.parse(new TextDecoder().decode(plaintext)), credentials: { key, salt } };
}

export function validateWorkspace(data) {
  const invalid = () => {
    throw new Error('Workspace data could not be read. Your stored data has not been changed.');
  };
  const string = (value) => typeof value === 'string';
  const date = (value) =>
    string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  if (!data?.profile || !string(data.profile.name) || !string(data.profile.avatar)) invalid();
  for (const type of ['notes', 'folders', 'tasks', 'habits']) {
    if (!Array.isArray(data[type])) invalid();
    const ids = new Set();
    for (const item of data[type]) {
      if (!item || !string(item.id) || !item.id || ids.has(item.id)) invalid();
      ids.add(item.id);
      if (
        type === 'notes' &&
        (![item.title, item.body, item.emoji, item.mood].every(string) ||
          !(item.date === null || date(item.date)) ||
          !(item.folder === null || string(item.folder)))
      )
        invalid();
      if (
        type === 'tasks' &&
        (![item.title, item.description].every(string) ||
          !['High', 'Medium', 'Low'].includes(item.priority) ||
          !['To Do', 'In Progress', 'Done'].includes(item.status) ||
          !(item.due === '' || date(item.due)))
      )
        invalid();
      if (
        type === 'habits' &&
        (![item.name, item.emoji].every(string) ||
          !Array.isArray(item.days) ||
          !item.days.every(date))
      )
        invalid();
      if (
        type === 'folders' &&
        (![item.name, item.emoji].every(string) || !(item.parent === null || string(item.parent)))
      )
        invalid();
    }
  }
  const folderMap = new Map(data.folders.map((folder) => [folder.id, folder]));
  for (const folder of data.folders) {
    const visited = new Set([folder.id]);
    let parent = folder.parent;
    while (parent) {
      if (visited.has(parent) || !folderMap.has(parent)) invalid();
      visited.add(parent);
      parent = folderMap.get(parent).parent;
    }
  }
  return data;
}
