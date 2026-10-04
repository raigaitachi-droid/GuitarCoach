import type { ImportedSong } from '../types';

export interface SavedTab {
  id: string;
  title: string;
  fileName: string;
  savedAt: number;
  tempo: number;
  measures: number;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('guitarcoach-my-tabs', 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tabs', { keyPath: 'id' });
      request.result.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Tab storage is blocked.')); };
  });
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Tab storage failed.'));
  });
}

export async function saveTab(file: File, song: ImportedSong): Promise<void> {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const db = await database();
  try {
    const transaction = db.transaction(['tabs', 'files'], 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('tabs').put({ id, title: song.title, fileName: file.name, savedAt: Date.now(),
      tempo: song.tempo, measures: song.measures } satisfies SavedTab);
    transaction.objectStore('files').put({ id, bytes });
    await done;
  } finally { db.close(); }
}

export async function listTabs(): Promise<SavedTab[]> {
  const db = await database();
  try {
    const tabs = await read<SavedTab[]>(db.transaction('tabs').objectStore('tabs').getAll());
    return tabs.sort((a, b) => b.savedAt - a.savedAt);
  } finally { db.close(); }
}

export async function openTab(tab: SavedTab): Promise<File> {
  const db = await database();
  try {
    const stored = await read<{ id: string; bytes: ArrayBuffer } | undefined>(db.transaction('files').objectStore('files').get(tab.id));
    if (!stored) throw new Error('This saved tab is unavailable. Import it again.');
    return new File([stored.bytes], tab.fileName, { type: 'application/octet-stream' });
  } finally { db.close(); }
}

export async function removeTab(id: string): Promise<void> {
  const db = await database();
  try {
    const transaction = db.transaction(['tabs', 'files'], 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('tabs').delete(id);
    transaction.objectStore('files').delete(id);
    await done;
  } finally { db.close(); }
}
