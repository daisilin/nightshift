const KEY_STORAGE = 'nightshift_api_key';

export function getStoredApiKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}

export function setStoredApiKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch {}
}

export function clearStoredApiKey(): void {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}

export function hasApiKey(): boolean {
  return !!getStoredApiKey();
}

/**
 * Drop-in replacement for fetch('/api/claude', ...).
 * Automatically attaches the stored user API key as a header when present.
 */
export async function callClaudeApi(body: object): Promise<Response> {
  const storedKey = getStoredApiKey();
  return fetch('/api/claude', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(storedKey ? { 'x-user-api-key': storedKey } : {}),
    },
    body: JSON.stringify(body),
  });
}
