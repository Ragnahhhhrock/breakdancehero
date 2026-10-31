# Breakdance Hero

A mobile-first 1980s electro rhythm game. Tap the arrows in time and a b-boy breaks on a neon dancefloor: toprock, six-step, windmills, headspins and freezes. Live at **https://breakdancehero.com**.

- Three.js dancefloor, crowd and procedurally animated breakdancer
- A DJ scratching on turntables, a "Club Breakin'" neon sign, and the b-boy's crew grooving at the edge of the floor
- A camera director that cuts on the bar line (close-ups, orbits, DJ cutaways); holds one steady shot with reduced motion
- Original TR-808 style electro track ("Cardboard Kings", 124 BPM), synthesised in the browser with Web Audio
- Charts generated from the track's own note data, so arrows always match what you hear (Easy, Normal, Hard)

Dev: `npm install`, `npm run dev`. Tests: `npm test`.

Design: tokens in `src/design/tokens.css`, living style guide at `/style-guide.html`. Social images (`public/og-image.png`, `public/twitter-card.png`) are generated from `design/social/` with `design/social/render.sh`.
