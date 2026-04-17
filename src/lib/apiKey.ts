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
 * Call Claude API.
 *
 * Strategy:
 * 1. If user has a stored API key (BYOK), call Anthropic directly from the browser
 * 2. Otherwise, try the server proxy at /api/claude
 *
 * Direct browser calls avoid the Vercel serverless function routing issues.
 * CORS is handled by Anthropic's API for browser requests with the right headers.
 */
export async function callClaudeApi(body: object): Promise<Response> {
  const storedKey = getStoredApiKey();

  if (storedKey) {
    // Direct call to Anthropic API (bypasses server proxy entirely)
    // Try requested model first, then fallback to older model IDs
    const requestedModel = (body as any).model;
    const modelsToTry = [
      requestedModel,
      // Fallbacks for accounts without latest model access
      ...(requestedModel?.includes('sonnet-4-6') ? ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514'] : []),
      ...(requestedModel?.includes('sonnet-4-5') ? ['claude-sonnet-4-20250514'] : []),
    ].filter(Boolean);

    for (const model of modelsToTry) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': storedKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ ...body, model }),
        });
        if (res.status === 404 && model !== modelsToTry[modelsToTry.length - 1]) {
          continue; // Try next model
        }
        return res;
      } catch {
        // Network error — fall through to proxy
        break;
      }
    }
  }

  // Fallback: server proxy
  return fetch('/api/claude', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(storedKey ? { 'x-user-api-key': storedKey } : {}),
    },
    body: JSON.stringify(body),
  });
}
