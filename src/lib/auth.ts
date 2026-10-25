// Google-Anmeldung über chrome.identity. Chrome verwaltet das Token selbst
// und erneuert es; wir holen es bei Bedarf ab.

export async function getToken(interactive: boolean): Promise<string | null> {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    return result.token ?? null;
  } catch (err) {
    if (interactive) throw err;
    return null;
  }
}

/** Verwirft ein abgelaufenes oder widerrufenes Token, damit Chrome ein neues holt. */
export async function dropToken(token: string): Promise<void> {
  await chrome.identity.removeCachedAuthToken({ token });
}

export async function signOut(): Promise<void> {
  const token = await getToken(false);
  if (token) {
    // Widerruft den Zugriff bei Google, nicht nur lokal.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }).catch(() => undefined);
    await dropToken(token);
  }
  await chrome.identity.clearAllCachedAuthTokens();
}
