# Breakdance Hero

A mobile-first 1980s electro rhythm game. Tap the arrows in time and a b-boy breaks on a neon dancefloor: toprock, six-step, windmills, headspins and freezes. Live at **https://breakdancehero.com**.

- Three.js dancefloor, crowd and procedurally animated breakdancer
- A DJ scratching on turntables, a "Club Breakin'" neon sign, and the b-boy's crew grooving at the edge of the floor
- A camera director that cuts on the bar line (close-ups, orbits, DJ cutaways); holds one steady shot with reduced motion
- Original TR-808 style electro track ("Cardboard Kings", 124 BPM), synthesised in the browser with Web Audio
- Charts generated from the track's own note data, so arrows always match what you hear (Easy, Normal, Hard)

Dev: `npm install`, `npm run dev`. Tests: `npm test`.

Design: tokens in `src/design/tokens.css`, living style guide at `/style-guide.html`. Social images (`public/og-image.png`, `public/twitter-card.png`) are generated from `design/social/` with `design/social/render.sh`.

## Global high scores (Cloudflare D1)

One shared top-10 per difficulty for all players. `worker/` is a Cloudflare Worker backed by a D1 database, served at `https://api.breakdancehero.com/api/scores` (`GET ?difficulty=easy|normal|hard`, `POST` a score). The game falls back to the device-local table when offline.

One-time setup:
1. `npx wrangler login`, then `npx wrangler d1 create breakdancehero-scores` and paste the printed `database_id` into `wrangler.toml`.
2. `npx wrangler d1 execute breakdancehero-scores --remote --file=worker/schema.sql`
3. `npx wrangler deploy`

After that, `.github/workflows/worker.yml` redeploys on changes to `worker/` (needs repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`). Local testing: `npx wrangler dev` and set `VITE_API_URL=http://localhost:8787`.
