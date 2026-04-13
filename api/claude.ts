import type { VercelRequest, VercelResponse } from '@vercel/node';

const FALLBACK_MODELS = [
  null, // use requested model first
  'claude-haiku-4-5-20251001', // fast fallback
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Try requested model, then fallback to Haiku if overloaded
  for (const fallbackModel of FALLBACK_MODELS) {
    const body = { ...req.body };
    if (fallbackModel) body.model = fallbackModel;

    // Retry with backoff per model
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });

        if ((response.status === 429 || response.status === 529) && attempt < 2) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000 + Math.random() * 500));
          continue;
        }

        if (response.status === 529 && fallbackModel === null) {
          break; // try fallback model
        }

        const data = await response.json();
        return res.status(response.status).json(data);
      } catch {
        if (attempt === 2) break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  return res.status(529).json({ error: 'API overloaded — all models and retries exhausted. Try again in a few minutes.' });
}
