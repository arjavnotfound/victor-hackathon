# CLAUDE.md — rules for working on VICTOR HACKATHON

## Stack
- Vite + plain JavaScript (ES modules). No React, no TypeScript, no backend server.
- Everything runs in the browser. Served locally with `npm run dev` (HTTPS via `@vitejs/plugin-basic-ssl`, `--host` so a phone on the same Wi-Fi can open `https://<mac-ip>:5173`).
- Heavy analysis runs in a Web Worker (`src/worker.js`).
- Tests: vitest (`npm test`). Must stay green before every push.

## Code
- Keep it simple and readable. Small files, plain functions.
- Comment the physics and the maths: why a step exists, not what a line does.
- Pure maths lives in modules with no DOM access (`src/lens.js`, `src/analysis.js`, `src/pcap.js`) so it can be tested in node.

## Git
- Commit after every working step, then push to the public repo `victor-hackathon`.
- Never commit `node_modules`, `*.pcap`, `*.pcapng`, `dist`, `.DS_Store`, `.venv`.
- Keep `PROGRESS.md` updated with what works and what is next.

## Writing (UI text and docs)
- Plain, normal language. Write for a hostel student, not an engineer.
- No buzzwords. No "it's not X, it's Y" sentences.
- Minimal emojis (ideally none).
- Never mention prior research papers or existing products by name anywhere in the repo.

## Team
Team VICTOR: Arjav Badjatya (Team Leader), Anurag Mahore, Mridini Kudaliya.
