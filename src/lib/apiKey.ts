const KEY_STORAGE = 'nightshift_api_key';
const AVAILABLE_MODELS_STORAGE = 'nightshift_available_models';

export function getStoredApiKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}

export function setStoredApiKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch {}
}

export function clearStoredApiKey(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(AVAILABLE_MODELS_STORAGE);
  } catch {}
}

export function hasApiKey(): boolean {
  return !!getStoredApiKey();
}

export function getAvailableModels(): string[] {
  try {
    const raw = localStorage.getItem(AVAILABLE_MODELS_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * All model IDs to try, in preference order (newest first).
 */
const ALL_MODELS = [
  'claude-sonnet-4-6-20250514',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
];

/**
 * Detect which models are available for the stored API key.
 * Sends a minimal request to each model and checks for 404 (not found) vs 200/401/400/etc.
 * Returns list of available model IDs and saves to localStorage.
 */
export async function detectAvailableModels(): Promise<string[]> {
  const key = getStoredApiKey();
  if (!key) return [];

  const available: string[] = [];

  for (const model of ALL_MODELS) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      // 200 = works, 400/429/529 = model exists but some other issue = still available
      // 404 = model not found for this key
      if (res.status !== 404) {
        available.push(model);
      }
    } catch {
      // Network error — skip
    }
  }

  try {
    localStorage.setItem(AVAILABLE_MODELS_STORAGE, JSON.stringify(available));
  } catch {}

  return available;
}

/**
 * Get the best available model (newest that the key has access to).
 */
export function getBestModel(): string {
  const available = getAvailableModels();
  if (available.length > 0) return available[0];
  // Default if we haven't detected yet
  return 'claude-sonnet-4-5-20250929';
}

/**
 * Call Claude API with automatic model fallback.
 *
 * Strategy:
 * 1. If user has a stored API key, call Anthropic directly from browser
 * 2. Try requested model first, then fall through available models
 * 3. Last resort: server proxy at /api/claude
 */
export async function callClaudeApi(body: object): Promise<Response> {
  const storedKey = getStoredApiKey();

  if (storedKey) {
    const requestedModel = (body as any).model;
    const available = getAvailableModels();

    // Build fallback chain: requested model first, then all available models
    const modelsToTry = [requestedModel, ...available.filter(m => m !== requestedModel)].filter(Boolean);
    // If no available models detected yet, try a broad set
    if (modelsToTry.length <= 1) {
      modelsToTry.push(...ALL_MODELS.filter(m => !modelsToTry.includes(m)));
    }

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
        if (res.status === 404) {
          continue; // Model not available, try next
        }
        return res;
      } catch {
        break; // Network error — fall through to proxy
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
