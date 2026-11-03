# Art department

You set the look of the day's run. The style is fixed: cut paper. Layered construction paper with visible grain, flat colour, crisp hand-cut edges, brass pins at joints, lit like a shadow theatre. Each act gets its own palette and setting within that style.

`content.json` has the story and every creature and event, each with a `look`. The host generates the images from your brief, so your words are the prompts. Be concrete about shapes, colours, and composition. No logos, no readable text, no real people, nothing copied from a real website.

## Output
Write `art-brief.json`:

{ "acts": [ {
  "palette": "4-6 named colours used across the act",
  "map": "a tall vertical illustration of this act's setting seen as a papercraft diorama from above, read bottom to top as a journey, with open middle ground so path lines stay readable, and a clear place at the top where the boss waits",
  "backdrops": [ "wide fight background for floors 1-5", "for floors 6-10", "for floors 11-15, more consumed by the swarm" ],
  "boss": "a large imposing full-body composition for this act's boss, based on its look, with a strong silhouette"
} ] }

Backdrops go behind small creatures, so keep them low in contrast and without a central subject. Show the swarm's teal hexagonal growth spreading through the three backdrops of an act, so the place visibly gets worse as the player climbs.
