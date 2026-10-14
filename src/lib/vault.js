export const STORAGE_KEY = 'still-workspace-v2';
const ITERATIONS = 600000;
export const encode = (bytes) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
export const decode = (value) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

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
  const recovery = data.recovery
    ? {
        question: data.recovery.question,
        hint: data.recovery.hint,
        wrappedKey: data.recovery.wrappedKey,
        ...(await encryptRecovery(data, data.recovery.key)),
      }
    : undefined;
  return {
    recovery,
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
  if (data?.spaces) {
    if (
      !Array.isArray(data.spaces) ||
      data.spaces.length < 1 ||
      !data.spaces.some((space) => space.id === data.activeSpaceId)
    )
      invalid();
    const ids = new Set();
    for (const space of data.spaces) {
      if (
        !space ||
        !string(space.id) ||
        ids.has(space.id) ||
        !string(space.name) ||
        !string(space.emoji)
      )
        invalid();
      ids.add(space.id);
      validateWorkspace({ ...space, profile: data.profile });
    }
    if (
      data.recovery &&
      (!string(data.recovery.key) ||
        !string(data.recovery.question) ||
        !string(data.recovery.hint) ||
        !data.recovery.wrappedKey ||
        decode(data.recovery.key).length !== 32)
    )
      invalid();
    return data;
  }
  if (!data?.profile || !string(data.profile.name) || !string(data.profile.avatar)) invalid();
  for (const type of [
    'notes',
    'folders',
    'tasks',
    'habits',
    ...(data.drafts !== undefined ? ['drafts'] : []),
  ]) {
    if (!Array.isArray(data[type])) invalid();
    const ids = new Set();
    for (const item of data[type]) {
      if (!item || !string(item.id) || !item.id || ids.has(item.id)) invalid();
      ids.add(item.id);
      if (
        (type === 'notes' || type === 'drafts') &&
        (![item.title, item.body, item.emoji, item.mood].every(string) ||
          !(item.date === null || date(item.date)) ||
          !(item.folder === null || string(item.folder)))
      )
        invalid();
      if (
        type === 'tasks' &&
        (![item.title, item.description].every(string) ||
          !['', 'High', 'Medium', 'Low'].includes(item.priority || '') ||
          !['To Do', 'In Progress', 'Done'].includes(item.status) ||
          !(item.due === '' || date(item.due)) ||
          (item.repeat !== undefined && typeof item.repeat !== 'boolean') ||
          (item.completedDates !== undefined &&
            (!Array.isArray(item.completedDates) || !item.completedDates.every(date))))
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

async function recoveryKey(raw) {
  return crypto.subtle.importKey('raw', decode(raw), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function encryptRecovery(data, rawKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await recoveryKey(rawKey),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}
export async function decryptRecovery(envelope, rawKey) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv) },
    await recoveryKey(rawKey),
    decode(envelope.ciphertext),
  );
  return validateWorkspace(JSON.parse(new TextDecoder().decode(plaintext)));
}

export async function createLocalRecovery(question, answer, hint = '') {
  const normalized = answer.normalize('NFKC').trim();
  if (!question.trim()) throw new Error('Add a recovery question or prompt.');
  if (normalized.length < 12)
    throw new Error('Use a private recovery answer or phrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const answerKey = await deriveKey(normalized, salt);
  const key = encode(crypto.getRandomValues(new Uint8Array(32)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, answerKey, decode(key));
  return {
    question: question.trim(),
    hint: hint.trim(),
    key,
    wrappedKey: {
      salt: encode(salt),
      iv: encode(iv),
      ciphertext: encode(new Uint8Array(wrappedKey)),
      iterations: ITERATIONS,
    },
  };
}
export async function unlockRecovery(recovery, answer) {
  const wrapped = recovery.wrappedKey;
  if (wrapped.iterations !== ITERATIONS) throw new Error('Unsupported recovery format.');
  const answerKey = await deriveKey(answer.normalize('NFKC').trim(), decode(wrapped.salt));
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(wrapped.iv) },
    answerKey,
    decode(wrapped.ciphertext),
  );
  return decryptRecovery(recovery, encode(new Uint8Array(raw)));
}
