# Project agent memory

- Read `README.md` for the local-data boundary, supported CLI schema, acquisition limits, and development commands.
- Development must not poll real providers or read real credentials. Use `npm run test:demo` for browser work and the synthetic fixtures under `test/`; `npm start` uses the real installed CLI.
- Keep executable overrides confined to in-process tests. Never expose command selection, credential management, or a non-loopback bind through the production UI, CLI, or environment.
- See `docs/validation.md` for actual-browser checks. Do not commit real quota/account data or screenshots.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
