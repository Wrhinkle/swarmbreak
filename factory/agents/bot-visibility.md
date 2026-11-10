# Bot decisions: information available to a player

Use the current UI in `src/main.ts` as the authority, and update these examples when it changes. Review each decision at the point it is made, not merely whether the data exists in the downloaded run.

- On the map, the player sees the whole current act's topology, floor positions and connections. Uncleared hidden rooms show as mystery rooms: their kind and label are masked. Other rooms show their kind and label, but not their encounter, rewards, event options or shop contents. Route choices may use the displayed map and remembered past information, not the contents of future hidden encounters.
- Between fights, the crew screen shows active and reserve members, health, equipped routines, available routines, slots and gold. Preparation may use those and the player's prior observations. It may not use an upcoming encounter's enemy identities or routines: entering a fight starts it immediately.
- In a fight, enemies and their health are displayed, and tapping an enemy reveals its name, blurb and routines. Those details can inform decisions available during that fight; they cannot retroactively inform between-fight preparation. A player can pause and queue manual orders, but cannot edit the crew's loadout during combat.
- On entering an event, shop, treasure or rest room, the UI shows its available choices; choices can use the information shown there and the crew's known state. Do not assume unseen outcomes or future room contents are displayed.

Simulated fight outcomes are unavailable to a player choosing a route, preparing a loadout or making a decision. Reject lookahead that simulates candidate fights to choose an action, even if the input data was visible. The simulator may of course run the actual fight after the choice to determine its result.
