import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Retry with exponential backoff for rate limits (429, 529)
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req.body),
      });

      if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      if (attempt === maxRetries) {
        return res.status(500).json({ error: 'Failed to reach Claude API after retries' });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
