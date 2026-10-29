// Persistence, all on this device: the project JSON in localStorage, the
// screenshots as blobs in IndexedDB. Nothing is uploaded anywhere.

import { type Project, parseProject, usedImages } from './project';
import { unzip, zip } from './zip';

const PROJECT_KEY = 'shotsmith.project.v1';
const DB = 'shotsmith';
const STORE = 'images';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

export const images = {
  put: (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)),
  get: (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id)),
  remove: (id: string) => tx('readwrite', (s) => s.delete(id)),
  keys: () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),
};

export function saveProject(p: Project) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(p));
  } catch {
    // private mode or full storage: the editor still works, it just won't remember
  }
}

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    return raw ? parseProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Drops stored images the project doesn't use any more. */
export async function collectGarbage(p: Project) {
  const used = usedImages(p);
  for (const key of await images.keys()) {
    if (!used.has(String(key))) await images.remove(String(key));
  }
}

// A project file is a zip: project.json plus the screenshots it uses.

export async function packProject(p: Project, getBlob: (id: string) => Promise<Blob | undefined>): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const entries = [{ name: 'project.json', data: enc.encode(JSON.stringify(p, null, 2)) }];
  const ids = usedImages(p);
  for (const id of ids) {
    const blob = await getBlob(id);
    if (blob) entries.push({ name: `images/${id}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return zip(entries);
}

export function unpackProject(data: Uint8Array): { project: Project; blobs: Map<string, Blob> } {
  const entries = unzip(data);
  const json = entries.find((e) => e.name === 'project.json');
  if (!json) throw new Error('not a shotsmith project file');
  const project = parseProject(JSON.parse(new TextDecoder().decode(json.data)));
  const blobs = new Map<string, Blob>();
  for (const e of entries) {
    if (e.name.startsWith('images/')) blobs.set(e.name.slice(7), new Blob([e.data as BlobPart], { type: 'image/png' }));
  }
  return { project, blobs };
}
