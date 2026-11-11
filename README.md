# Swarmbreak

A daily browser roguelike. Rogue AI swarms are eating parts of the internet, and your crew goes in to clear them out. Each page a swarm has eaten becomes a dungeon.

Work in progress, built for the Qodo Software Factory Hackathon. Code is MIT. Files in `snapshots/` keep their own licenses.

Install dependencies with `npm install`, then run `npm run dev` to start the local development server. Run `npm test` to check the generator.

To check a fresh visit through the walkthrough and first fight in headless Chrome, run `npm run build` followed by `node factory/screens.mjs /path/to/chrome dist /tmp/swarmbreak-screens`. The PR host also runs this screen check; it reports page and console errors in its JSON output and fails the PR verification when errors are present.
