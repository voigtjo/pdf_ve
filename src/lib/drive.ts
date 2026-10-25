// Zugriff auf Google Drive (REST API v3) für die Ordner pdf_ve/In und pdf_ve/Out.

import { dropToken, getToken } from './auth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const STORAGE_KEY = 'pdfveFolders';

export const ROOT_FOLDER_NAME = 'pdf_ve';

export interface Folders {
  root: string;
  in: string;
  out: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export class NotSignedInError extends Error {
  constructor() {
    super('Nicht bei Google angemeldet');
  }
}

/** fetch mit Google-Token; bei 401 wird das Token einmal erneuert. */
async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(false);
    if (!token) throw new NotSignedInError();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 && attempt === 0) {
      await dropToken(token);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Drive-Fehler ${res.status}: ${body}`);
    }
    return res;
  }
  throw new NotSignedInError();
}

/** Escaped einen Wert für Drive-Suchanfragen (q-Parameter). */
function q(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function findFolder(name: string, parent: string): Promise<string | null> {
  const query = [
    `name = ${q(name)}`,
    `mimeType = ${q(FOLDER_MIME)}`,
    `${q(parent)} in parents`,
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1' });
  const res = await driveFetch(`${API}/files?${params}`);
  const data = (await res.json()) as { files: { id: string }[] };
  return data.files[0]?.id ?? null;
}

async function createFolder(name: string, parent: string): Promise<string> {
  const res = await driveFetch(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  return ((await res.json()) as { id: string }).id;
}

async function ensureFolder(name: string, parent: string): Promise<string> {
  return (await findFolder(name, parent)) ?? createFolder(name, parent);
}

async function isLiveFolder(id: string): Promise<boolean> {
  try {
    const res = await driveFetch(`${API}/files/${id}?fields=trashed,mimeType`);
    const meta = (await res.json()) as { trashed: boolean; mimeType: string };
    return !meta.trashed && meta.mimeType === FOLDER_MIME;
  } catch (err) {
    if (err instanceof NotSignedInError) throw err;
    return false;
  }
}

/**
 * Liefert die IDs von pdf_ve, In und Out und legt fehlende Ordner an.
 * Die IDs werden gemerkt, damit ein Umbenennen in Drive nichts kaputt macht.
 */
export async function ensureFolders(): Promise<Folders> {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Folders | undefined;
  if (stored) {
    const live = await Promise.all([stored.root, stored.in, stored.out].map(isLiveFolder));
    if (live.every(Boolean)) return stored;
  }
  const root = await ensureFolder(ROOT_FOLDER_NAME, 'root');
  const [inId, outId] = await Promise.all([ensureFolder('In', root), ensureFolder('Out', root)]);
  const folders: Folders = { root, in: inId, out: outId };
  await chrome.storage.local.set({ [STORAGE_KEY]: folders });
  return folders;
}

export async function listPdfs(folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `${q(folderId)} in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(`${API}/files?${params}`);
    const data = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const res = await driveFetch(`${API}/files/${fileId}?alt=media`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Lädt eine PDF-Datei in den angegebenen Ordner hoch (multipart upload). */
export async function uploadPdf(folderId: string, name: string, data: Uint8Array | Blob): Promise<DriveFile> {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf' })], {
      type: 'application/json',
    }),
  );
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'application/pdf' });
  form.append('file', blob);
  const res = await driveFetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`,
    { method: 'POST', body: form },
  );
  return (await res.json()) as DriveFile;
}

export function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
