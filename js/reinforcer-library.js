const META_KEY = 'tokenboard/reinforcerLibrary';
const DB_NAME = 'tokenboard-reinforcer-images';
const STORE_NAME = 'images';

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) {
      return { items: [], selectedId: null };
    }
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      selectedId: parsed.selectedId ?? null,
    };
  } catch {
    return { items: [], selectedId: null };
  }
}

function writeMeta(state) {
  localStorage.setItem(META_KEY, JSON.stringify(state));
}

async function getBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function putBlob(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const objectUrlCache = new Map();

export function getReinforcerObjectUrl(id) {
  if (!id) {
    return null;
  }

  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id);
  }

  return null;
}

export async function hydrateReinforcerUrl(id) {
  if (!id) {
    return null;
  }

  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id);
  }

  const blob = await getBlob(id);
  if (!blob) {
    return null;
  }

  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  return url;
}

export async function loadReinforcerLibrary() {
  const meta = readMeta();
  const items = [];

  for (const item of meta.items) {
    const blob = await getBlob(item.id);
    if (blob) {
      items.push(item);
      if (!objectUrlCache.has(item.id)) {
        objectUrlCache.set(item.id, URL.createObjectURL(blob));
      }
    }
  }

  const selectedId = items.some((item) => item.id === meta.selectedId)
    ? meta.selectedId
    : items[0]?.id ?? null;

  const state = { items, selectedId };
  writeMeta(state);
  return state;
}

export async function addReinforcerFromFile(file) {
  const id = createId();
  const blob = file instanceof Blob ? file : await file;
  await putBlob(id, blob);

  const state = await loadReinforcerLibrary();
  const item = { id, createdAt: Date.now() };
  const nextState = {
    items: [item, ...state.items.filter((entry) => entry.id !== id)],
    selectedId: id,
  };

  if (!objectUrlCache.has(id)) {
    objectUrlCache.set(id, URL.createObjectURL(blob));
  }

  writeMeta(nextState);
  return {
    state: nextState,
    url: objectUrlCache.get(id),
  };
}

export async function selectReinforcer(id) {
  const state = await loadReinforcerLibrary();
  if (!state.items.some((item) => item.id === id)) {
    return state;
  }

  const nextState = { ...state, selectedId: id };
  writeMeta(nextState);
  return nextState;
}

export async function removeReinforcer(id) {
  const state = await loadReinforcerLibrary();
  const nextItems = state.items.filter((item) => item.id !== id);

  await deleteBlob(id);

  if (objectUrlCache.has(id)) {
    URL.revokeObjectURL(objectUrlCache.get(id));
    objectUrlCache.delete(id);
  }

  const nextState = {
    items: nextItems,
    selectedId:
      state.selectedId === id
        ? nextItems[0]?.id ?? null
        : state.selectedId,
  };

  writeMeta(nextState);
  return nextState;
}
