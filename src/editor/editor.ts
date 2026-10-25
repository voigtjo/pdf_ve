import { getToken, signOut } from '../lib/auth';
import {
  downloadFile,
  ensureFolders,
  folderUrl,
  listPdfs,
  NotSignedInError,
  trashFile,
  uploadPdf,
  type DriveFile,
  type Folders,
} from '../lib/drive';
import { outputName } from '../lib/naming';
import { deletePage, insertBlankPage, insertPdf, movePage, rotatePage } from '../lib/pages';
import { PdfView } from '../lib/viewer';

type FolderKey = 'in' | 'out';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const signinView = $('signin-view');
const mainView = $('main-view');
const account = $('account');
const tabIn = $<HTMLButtonElement>('tab-in');
const tabOut = $<HTMLButtonElement>('tab-out');
const uploadLabel = $('upload-label');
const fileList = $<HTMLUListElement>('files');
const filesEmpty = $('files-empty');
const pagesPane = $('pages-pane');
const thumbs = $<HTMLOListElement>('thumbs');
const undoBtn = $<HTMLButtonElement>('undo');
const placeholder = $('placeholder');
const formHint = $('form-hint');
const docBar = $('doc-bar');
const docName = $('doc-name');
const docPages = $('doc-pages');
const docDirty = $('doc-dirty');
const saveBtn = $<HTMLButtonElement>('save');
const linkIn = $<HTMLAnchorElement>('link-in');
const linkOut = $<HTMLAnchorElement>('link-out');
const signoutBtn = $<HTMLButtonElement>('signout');
const insertDialog = $<HTMLDialogElement>('insert-dialog');
const insertFiles = $<HTMLUListElement>('insert-files');
const insertAfterLabel = $('insert-after');
const toast = $('toast');

const view = new PdfView($<HTMLDivElement>('viewer-container'));
view.onFormChange = () => updateDirty();

interface OpenDoc {
  file: DriveFile;
  /** Aktueller Stand des PDFs (ohne noch nicht übernommene Formulareingaben). */
  bytes: Uint8Array;
  /** Frühere Stände für Rückgängig. */
  history: Uint8Array[];
  hasForm: boolean;
  /** Markierte Seite (0-basiert); Einfügen geschieht dahinter. */
  selected: number;
}

let folders: Folders | null = null;
let shownFolder: FolderKey = 'in';
let current: OpenDoc | null = null;
let busy = false;
let toastTimer: number | undefined;

function notify(message: string, isError = false): void {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), isError ? 8000 : 3500);
}

function handleError(err: unknown): void {
  if (err instanceof NotSignedInError) {
    showSignIn();
    return;
  }
  console.error(err);
  notify(err instanceof Error ? err.message : String(err), true);
}

function isDirty(): boolean {
  return Boolean(current && (current.history.length > 0 || view.modified));
}

function confirmDiscard(): boolean {
  return !isDirty() || confirm('Ungespeicherte Änderungen verwerfen?');
}

function showSignIn(): void {
  signinView.hidden = false;
  mainView.hidden = true;
  signoutBtn.hidden = true;
  linkIn.hidden = linkOut.hidden = true;
  account.textContent = '';
}

function closeDocument(): void {
  current = null;
  void view.close();
  docBar.hidden = formHint.hidden = pagesPane.hidden = true;
  thumbs.replaceChildren();
  placeholder.hidden = false;
  placeholder.textContent = 'Wähle links eine Datei aus.';
}

async function start(): Promise<void> {
  const token = await getToken(false);
  if (!token) {
    showSignIn();
    return;
  }
  signinView.hidden = true;
  signoutBtn.hidden = false;
  account.textContent = 'Ordner werden geprüft …';
  folders = await ensureFolders();
  // Erst jetzt anzeigen, damit nichts hochgeladen wird, bevor In und Out feststehen.
  mainView.hidden = false;
  account.textContent = 'Angemeldet · Drive: pdf_ve';
  linkIn.href = folderUrl(folders.in);
  linkOut.href = folderUrl(folders.out);
  linkIn.hidden = linkOut.hidden = false;
  await refreshList();
}

// ---------- Dateiliste (In / Out) ----------

function showFolder(key: FolderKey): void {
  shownFolder = key;
  tabIn.classList.toggle('active', key === 'in');
  tabOut.classList.toggle('active', key === 'out');
  uploadLabel.hidden = key !== 'in';
  refreshList().catch(handleError);
}

async function refreshList(): Promise<void> {
  if (!folders) return;
  const key = shownFolder;
  const files = await listPdfs(folders[key]);
  if (key !== shownFolder) return;
  filesEmpty.hidden = files.length > 0;
  filesEmpty.textContent = key === 'in' ? 'Noch keine PDFs in In.' : 'Noch keine Ergebnisse in Out.';
  fileList.replaceChildren(...files.map(fileRow));
}

function fileRow(file: DriveFile): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.id = file.id;
  li.classList.toggle('active', file.id === current?.file.id);

  const open = document.createElement('button');
  open.className = 'open';
  const name = document.createElement('span');
  name.textContent = file.name;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = describe(file);
  open.append(name, meta);
  open.addEventListener('click', () => openFile(file).catch(handleError));

  const del = document.createElement('button');
  del.className = 'delete';
  del.title = 'Löschen (in den Papierkorb von Google Drive)';
  del.setAttribute('aria-label', `${file.name} löschen`);
  del.textContent = '🗑';
  del.addEventListener('click', () => removeFile(file).catch(handleError));

  li.append(open, del);
  return li;
}

function describe(file: DriveFile): string {
  const parts: string[] = [];
  if (file.size) parts.push(`${Math.max(1, Math.round(Number(file.size) / 1024))} KB`);
  if (file.modifiedTime) parts.push(new Date(file.modifiedTime).toLocaleString('de-DE'));
  return parts.join(' · ');
}

async function removeFile(file: DriveFile): Promise<void> {
  if (!confirm(`„${file.name}“ in den Papierkorb von Google Drive verschieben?`)) return;
  if (current?.file.id === file.id) closeDocument();
  await trashFile(file.id);
  notify(`Gelöscht: ${file.name} (im Drive-Papierkorb wiederherstellbar)`);
  await refreshList();
}

async function uploadFiles(files: FileList): Promise<void> {
  if (!folders) return;
  for (const file of Array.from(files)) {
    notify(`Lade ${file.name} hoch …`);
    await uploadPdf(folders.in, file.name, file);
  }
  notify(files.length === 1 ? 'Datei hochgeladen.' : `${files.length} Dateien hochgeladen.`);
  if (shownFolder === 'in') await refreshList();
}

// ---------- Dokument öffnen, anzeigen, speichern ----------

async function openFile(file: DriveFile): Promise<void> {
  if (!confirmDiscard()) return;
  for (const li of fileList.querySelectorAll('li')) li.classList.toggle('active', li.dataset.id === file.id);
  closeDocument();
  placeholder.textContent = 'Lade …';
  const bytes = await downloadFile(file.id);
  current = { file, bytes, history: [], hasForm: false, selected: 0 };
  docName.textContent = file.name;
  await show(bytes, 1);
}

/** Zeigt `bytes` an und baut die Seitenleiste neu auf. */
async function show(bytes: Uint8Array, page: number): Promise<void> {
  if (!current) return;
  const opened = await view.open(bytes);
  current.hasForm = opened.hasForm;
  current.selected = Math.min(current.selected, opened.pages - 1);
  view.currentPage = page;
  placeholder.hidden = true;
  docPages.textContent = opened.pages === 1 ? '1 Seite' : `${opened.pages} Seiten`;
  docBar.hidden = false;
  pagesPane.hidden = false;
  formHint.hidden = !opened.hasForm;
  updateDirty();
  await renderThumbs();
}

function updateDirty(): void {
  docDirty.hidden = !isDirty();
  undoBtn.disabled = !current || current.history.length === 0;
}

async function save(): Promise<void> {
  if (!current || !folders) return;
  saveBtn.disabled = true;
  try {
    const filled = current.hasForm && view.modified;
    const bytes = view.modified ? await view.save() : current.bytes;
    const name = outputName(current.file.name, filled ? 'ausgefuellt' : 'bearbeitet');
    await uploadPdf(folders.out, name, bytes);
    // Gespeicherter Stand gilt als neuer Ausgangspunkt.
    current.bytes = bytes;
    current.history = [];
    await show(bytes, view.currentPage);
    notify(`Gespeichert in Out: ${name}`);
    if (shownFolder === 'out') await refreshList();
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- Seiten bearbeiten ----------

/** Führt eine Seitenoperation aus; Formulareingaben werden vorher übernommen. */
async function applyPageEdit(
  change: (bytes: Uint8Array) => Promise<Uint8Array>,
  pageAfter: (pages: number) => number,
  selectAfter?: number,
): Promise<void> {
  if (!current || busy) return;
  busy = true;
  try {
    const base = view.modified ? await view.save() : current.bytes;
    const next = await change(base);
    current.history.push(current.bytes);
    current.bytes = next;
    if (selectAfter !== undefined) current.selected = selectAfter;
    await show(next, 1);
    view.currentPage = pageAfter(view.pageCount);
  } finally {
    busy = false;
  }
}

async function undo(): Promise<void> {
  if (!current || busy || current.history.length === 0) return;
  const page = view.currentPage;
  current.bytes = current.history.pop()!;
  await show(current.bytes, page);
}

async function renderThumbs(): Promise<void> {
  if (!current) return;
  const count = view.pageCount;
  const items: HTMLLIElement[] = [];
  for (let i = 0; i < count; i++) items.push(thumbItem(i));
  thumbs.replaceChildren(...items);
  for (let i = 0; i < count; i++) {
    const canvas = items[i].querySelector('canvas')!;
    await view.renderThumbnail(i + 1, canvas, 120);
  }
}

function thumbItem(index: number): HTMLLIElement {
  const li = document.createElement('li');
  li.draggable = true;
  li.dataset.index = String(index);
  li.classList.toggle('selected', index === current?.selected);
  li.title = `Seite ${index + 1}`;

  const canvas = document.createElement('canvas');
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = String(index + 1);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const rotate = document.createElement('button');
  rotate.textContent = '↻';
  rotate.title = 'Seite drehen';
  rotate.addEventListener('click', (e) => {
    e.stopPropagation();
    applyPageEdit((b) => rotatePage(b, index), () => index + 1, index).catch(handleError);
  });
  const del = document.createElement('button');
  del.textContent = '✕';
  del.title = 'Seite löschen';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    applyPageEdit((b) => deletePage(b, index), (n) => Math.min(index + 1, n), Math.max(0, index - 1)).catch(
      handleError,
    );
  });
  actions.append(rotate, del);

  li.append(canvas, num, actions);
  li.addEventListener('click', () => selectPage(index));

  li.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/plain', String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    const after = isLowerHalf(li, e);
    li.classList.toggle('drop-before', !after);
    li.classList.toggle('drop-after', after);
  });
  li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drop-before', 'drop-after');
    const from = Number(e.dataTransfer?.getData('text/plain'));
    if (Number.isNaN(from)) return;
    // Zielposition im Ergebnis: vor oder hinter dieser Seite, nachdem `from` entfernt wurde.
    let to = isLowerHalf(li, e) ? index + 1 : index;
    if (from < to) to -= 1;
    if (to === from) return;
    applyPageEdit((b) => movePage(b, from, to), () => to + 1, to).catch(handleError);
  });
  return li;
}

function isLowerHalf(el: HTMLElement, e: DragEvent): boolean {
  const rect = el.getBoundingClientRect();
  return e.clientY > rect.top + rect.height / 2;
}

function selectPage(index: number): void {
  if (!current) return;
  current.selected = index;
  for (const li of thumbs.querySelectorAll('li')) {
    li.classList.toggle('selected', li.dataset.index === String(index));
  }
  view.currentPage = index + 1;
}

function insertBlank(): void {
  if (!current) return;
  const after = current.selected;
  applyPageEdit((b) => insertBlankPage(b, after), () => after + 2, after + 1).catch(handleError);
}

async function openInsertDialog(): Promise<void> {
  if (!current || !folders) return;
  insertAfterLabel.textContent = String(current.selected + 1);
  insertFiles.replaceChildren();
  insertDialog.showModal();
  const [inFiles, outFiles] = await Promise.all([listPdfs(folders.in), listPdfs(folders.out)]);
  const rows = [
    ...inFiles.map((f) => [f, 'In'] as const),
    ...outFiles.map((f) => [f, 'Out'] as const),
  ].map(([file, folder]) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = file.name;
    const tag = document.createElement('span');
    tag.className = 'folder';
    tag.textContent = folder;
    btn.append(tag);
    btn.addEventListener('click', () => {
      insertDialog.close();
      downloadFile(file.id)
        .then((other) => insertOther(other))
        .catch(handleError);
    });
    li.append(btn);
    return li;
  });
  insertFiles.replaceChildren(...rows);
}

async function insertOther(other: Uint8Array): Promise<void> {
  if (!current) return;
  const after = current.selected;
  await applyPageEdit((b) => insertPdf(b, after, other), () => after + 2, after + 1);
}

// ---------- Ereignisse ----------

$('signin').addEventListener('click', () => {
  getToken(true).then(start).catch(handleError);
});
signoutBtn.addEventListener('click', () => {
  if (!confirmDiscard()) return;
  closeDocument();
  folders = null;
  signOut().then(showSignIn).catch(handleError);
});
tabIn.addEventListener('click', () => showFolder('in'));
tabOut.addEventListener('click', () => showFolder('out'));
$('refresh').addEventListener('click', () => refreshList().catch(handleError));
saveBtn.addEventListener('click', () => save().catch(handleError));
undoBtn.addEventListener('click', () => undo().catch(handleError));
$('insert-blank').addEventListener('click', insertBlank);
$('insert-pdf').addEventListener('click', () => openInsertDialog().catch(handleError));
$('insert-cancel').addEventListener('click', () => insertDialog.close());
$<HTMLInputElement>('insert-local').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  insertDialog.close();
  if (file) {
    file
      .arrayBuffer()
      .then((buf) => insertOther(new Uint8Array(buf)))
      .catch(handleError)
      .finally(() => (input.value = ''));
  }
});
$<HTMLInputElement>('upload').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) uploadFiles(input.files).catch(handleError).finally(() => (input.value = ''));
});
window.addEventListener('beforeunload', (e) => {
  if (isDirty()) e.preventDefault();
});

$('version').textContent = `v${chrome.runtime.getManifest().version}`;

start().catch(handleError);
