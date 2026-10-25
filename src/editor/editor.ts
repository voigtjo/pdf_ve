import { getToken, signOut } from '../lib/auth';
import {
  downloadFile,
  ensureFolders,
  folderUrl,
  listPdfs,
  NotSignedInError,
  uploadPdf,
  type DriveFile,
  type Folders,
} from '../lib/drive';
import { outputName } from '../lib/naming';
import { PdfView } from '../lib/viewer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const signinView = $('signin-view');
const mainView = $('main-view');
const account = $('account');
const fileList = $<HTMLUListElement>('files');
const filesEmpty = $('files-empty');
const placeholder = $('placeholder');
const formHint = $('form-hint');
const docBar = $('doc-bar');
const docName = $('doc-name');
const docPages = $('doc-pages');
const saveBtn = $<HTMLButtonElement>('save');
const linkIn = $<HTMLAnchorElement>('link-in');
const linkOut = $<HTMLAnchorElement>('link-out');
const signoutBtn = $<HTMLButtonElement>('signout');
const toast = $('toast');

const view = new PdfView($<HTMLDivElement>('viewer-container'));

let folders: Folders | null = null;
let current: { file: DriveFile; hasForm: boolean } | null = null;
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

function showSignIn(): void {
  signinView.hidden = false;
  mainView.hidden = true;
  signoutBtn.hidden = true;
  linkIn.hidden = linkOut.hidden = true;
  account.textContent = '';
}

async function start(): Promise<void> {
  const token = await getToken(false);
  if (!token) {
    showSignIn();
    return;
  }
  signinView.hidden = true;
  mainView.hidden = false;
  signoutBtn.hidden = false;
  account.textContent = 'Ordner werden geprüft …';
  folders = await ensureFolders();
  account.textContent = 'Angemeldet · Drive: pdf_ve';
  linkIn.href = folderUrl(folders.in);
  linkOut.href = folderUrl(folders.out);
  linkIn.hidden = linkOut.hidden = false;
  await refreshList();
}

async function refreshList(): Promise<void> {
  if (!folders) return;
  const files = await listPdfs(folders.in);
  filesEmpty.hidden = files.length > 0;
  fileList.replaceChildren(
    ...files.map((file) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.dataset.id = file.id;
      btn.classList.toggle('active', file.id === current?.file.id);
      const name = document.createElement('span');
      name.textContent = file.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = describe(file);
      btn.append(name, meta);
      btn.addEventListener('click', () => openFile(file).catch(handleError));
      li.append(btn);
      return li;
    }),
  );
}

function describe(file: DriveFile): string {
  const parts: string[] = [];
  if (file.size) parts.push(`${Math.max(1, Math.round(Number(file.size) / 1024))} KB`);
  if (file.modifiedTime) parts.push(new Date(file.modifiedTime).toLocaleString('de-DE'));
  return parts.join(' · ');
}

async function openFile(file: DriveFile): Promise<void> {
  if (current && view.modified && !confirm('Ungespeicherte Eingaben verwerfen?')) return;
  for (const btn of fileList.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.id === file.id);
  }
  current = null;
  docBar.hidden = formHint.hidden = true;
  placeholder.hidden = false;
  placeholder.textContent = 'Lade …';
  const data = await downloadFile(file.id);
  const opened = await view.open(data);
  current = { file, hasForm: opened.hasForm };
  placeholder.hidden = true;
  docName.textContent = file.name;
  docPages.textContent = opened.pages === 1 ? '1 Seite' : `${opened.pages} Seiten`;
  docBar.hidden = false;
  formHint.hidden = !opened.hasForm;
}

async function save(): Promise<void> {
  if (!current || !folders) return;
  saveBtn.disabled = true;
  try {
    const filled = current.hasForm && view.modified;
    const bytes = await view.save();
    const name = outputName(current.file.name, filled ? 'ausgefuellt' : 'bearbeitet');
    await uploadPdf(folders.out, name, bytes);
    notify(`Gespeichert in Out: ${name}`);
  } finally {
    saveBtn.disabled = false;
  }
}

async function uploadFiles(files: FileList): Promise<void> {
  if (!folders) return;
  for (const file of Array.from(files)) {
    notify(`Lade ${file.name} hoch …`);
    await uploadPdf(folders.in, file.name, file);
  }
  notify(files.length === 1 ? 'Datei hochgeladen.' : `${files.length} Dateien hochgeladen.`);
  await refreshList();
}

$('signin').addEventListener('click', () => {
  getToken(true).then(start).catch(handleError);
});
signoutBtn.addEventListener('click', () => {
  current = null;
  folders = null;
  void view.close();
  docBar.hidden = formHint.hidden = true;
  placeholder.hidden = false;
  placeholder.textContent = 'Wähle links eine Datei aus.';
  signOut().then(showSignIn).catch(handleError);
});
$('refresh').addEventListener('click', () => refreshList().catch(handleError));
saveBtn.addEventListener('click', () => save().catch(handleError));
$<HTMLInputElement>('upload').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) uploadFiles(input.files).catch(handleError).finally(() => (input.value = ''));
});

start().catch(handleError);
