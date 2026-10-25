import { getToken, signOut } from '../lib/auth';

const status = document.getElementById('status')!;
const signinBtn = document.getElementById('signin') as HTMLButtonElement;
const signoutBtn = document.getElementById('signout') as HTMLButtonElement;
const openBtn = document.getElementById('open') as HTMLButtonElement;
const errorBox = document.getElementById('error')!;

async function refresh(): Promise<void> {
  const token = await getToken(false);
  status.textContent = token ? 'Bei Google angemeldet.' : 'Nicht angemeldet.';
  signinBtn.hidden = Boolean(token);
  signoutBtn.hidden = !token;
}

function showError(err: unknown): void {
  errorBox.hidden = false;
  errorBox.textContent = err instanceof Error ? err.message : String(err);
}

signinBtn.addEventListener('click', () => {
  getToken(true).then(refresh, showError);
});

signoutBtn.addEventListener('click', () => {
  signOut().then(refresh, showError);
});

openBtn.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('editor/index.html') });
  window.close();
});

void refresh();
