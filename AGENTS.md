# Repository Guidelines

## Project Structure & Module Organization
Vite + React + TypeScript code lives in `src/`. `main.tsx` boots the app; `App.tsx` renders the board, local logic, and the online control panel. Pure rule helpers now live in `shared/othello.ts` so they can be imported by both the client (`src/lib/othello.ts` just re-exports) and the WebSocket server inside `server/`. Styles stay beside components (`App.css`, `index.css`); bundlable images go in `src/assets`; immutable static files live in `public/`. Generated artifacts (`dist/`, `server-dist/`) are disposable.

## Build, Test, and Development Commands
- `npm run dev` – Vite dev server with HMR; add `--host` to test on devices.
- `npm run server` – launches the WebSocket matchmaking service on `ws://localhost:8787` via `tsx`.
- `npm run lint` – ESLint across `.ts/.tsx` (shared + client + server TS).
- `npm run build` – composite TypeScript build (app + Vite config + server) then Vite bundling into `dist/`.
- `npm run preview` / `npm run start` – serve the latest build (`start` binds to `0.0.0.0:4173`).
- `npm run server:build` / `npm run server:start` – produce and execute the compiled Node server; `server:start` wraps Node with `--experimental-specifier-resolution=node` so shared imports without `.js` work at runtime.
- `npm run integrated` – runs `server:build` first, then launches the production Node server (`server:start`) plus the Vite dev server via `concurrently` for end-to-end testing.

## Coding Style & Naming Conventions
Write TypeScript functional components that rely on hooks for state (`useOnlineMatch` centralizes all WS logic). Keep pure calculations and re-usable types inside `shared/` so both client and server can import them—avoid duplicating rule code. Follow the existing formatting: 2-space indents, single quotes, PascalCase for components/hooks, lowerCamelCase for utilities. Prefer small helpers over inline complexity, and run `npm run lint` before pushing; server files are linted the same way as `src/`.

## Testing Guidelines
No automated runner ships yet, but logic modules should gain `*.test.ts` files (Vitest drops in with minimal config). Until then, document manual checks in every PR: `npm run dev` + `npm run server`, walk through (1) random match pairing, (2) key host/join flows, (3) spectator prompt when a room is full, and (4) local fallbacks (pass handling, restart button, a11y labels). When bugs are fixed, describe the failing scenario plus the expected board state / network exchange.

## Commit & Pull Request Guidelines
Use Conventional Commit prefixes (`feat`, `fix`, `chore`) so future automation can parse history; keep each commit focused. PRs must state intent or linked issue, list the commands you ran (`dev`, `lint`, `build`), and include screenshots or GIFs for UX work. Request review only after lint passes and the preview server renders correctly.

## Agent Workflow Tips
Run `npm install` before touching code. For online changes, boot both `npm run server` and `npm run dev` so you can exercise random/key/spectator flows end-to-end. Skim `README.md` for environment variables and server notes, edit the smallest surface necessary (UI in `App.tsx`, hooks in `src/hooks`, rule tweaks in `shared/`). Leave succinct TODOs when you defer edge cases so the next agent can continue without rediscovery.
- サーバー接続先は `VITE_MATCH_SERVER_URL` でビルド時に決められるほか、アプリ内オンラインパネルの「マッチングサーバー URL」で動的に変更できます（`localStorage` に保存される）。検証時はここを使って LAN 上の別ホストを参照してください。
