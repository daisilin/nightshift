# nightshift — agent interns that work while you sleep

A flow-first research workspace where you dispatch AI agent interns to explore a question from multiple angles, then wake up to a synthesized morning briefing with feedback loops.

## Why not just use Claude?

Because nightshift manages things a single chat can't:
- **Parallel research** — 3 interns explore different angles simultaneously
- **Structured synthesis** — where they agree, disagree, and what's uncertain
- **Per-finding feedback** — mark what's useful, shallow, or wrong
- **State across sessions** — research history persists and compounds
- **Manager-quality reports** — not chat logs, but visual briefings

## The 3 Interns

| Intern | Role | Approach |
|--------|------|----------|
| Scout | Broad sweep | Maps the landscape, finds patterns and key players |
| Analyst | Deep dive | Picks the strongest angle and goes deep |
| Contrarian | Devil's advocate | Finds risks, blind spots, and opposing views |

## The Daily Loop

1. **Brief** — Give a messy research question
2. **Dispatch** — 3 interns research in parallel
3. **Morning Report** — Synthesized briefing with confidence levels
4. **Review** — Give feedback on each finding
5. **Iterate** — Next round is shaped by your feedback

## Deploy to Vercel

1. Push to GitHub (done)
2. Go to [vercel.com](https://vercel.com), import this repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Deploy

## Local Development

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run dev
```

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Framer Motion
- Claude API (Sonnet)
- Vitest (17 tests)

## Author

[Daisy Lin](https://daisilin.github.io) — exploring agent interfaces that help people do research without becoming operators.
