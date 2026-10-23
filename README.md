# Mineshaft

Browser voxel sandbox with an infinite world, biomes, caves, 45 blocks, third-person characters, mobile + desktop controls.

## Modes
- **Public World (Creative)** - shared online, build freely, PvP.
- **Private room (code)** - Creative or **Co-op Survival**. The first person to enter a code creates the room; friends enter the same code. Room, builds, coins, inventory and camps are saved on the server (autosave + "Save now" in the menu).
- **Single Player Survival (offline)** - runs fully on your device, saved in the browser (autosave + manual save).

## Survival
Hostile wolves, bears and spiders (more at night), passive pigs/sheep for meat. Mine ores, logs and stone and sell them to the trader at any camp (banner + planks floor); the trader sells swords, armor, food and building supplies and never buys those back, so there is no coin exploit. Logs can be sawed into planks for free. Other income: bounties on wolves, bears and spiders, and 5 coins/minute from each camp you hold. Red and Blue clan soldiers raid camps to take territory; your starting camp is yours. Capture camps by standing at the flag (clear of enemy soldiers) to get allied soldiers and passive coin income. Dying costs half your coins.

## Controls
PC: WASD, Space, Shift sprint, F fly, V view, E backpack, Q eat/heal, T trader, M menu, 1-9/wheel hotbar, left click break/hit (hold repeats), right click place.
Mobile: left thumb joystick (push fully to sprint), drag right side to look, diamond buttons: top USE (eat / trader), right HIT, bottom PLACE, left JUMP; side buttons: view, backpack, shop, menu.

## Run / deploy
    npm install
    npm start       # http://localhost:3000
Render: New > Web Service, build `npm install`, start `npm start` (or use render.yaml). Free tier sleeps and has no disk, so server rooms reset on restart; add a disk + DATA_DIR on a paid plan.

## Files
- `public/index.html` - the whole client in ONE file (generated).
- `server.js`, `core.js` - server; core.js (world + survival sim) is shared with the client.
- `src/template.html`, `src/client.js`, `build.js` - sources. After editing core.js or src/*, run `node build.js` to regenerate public/index.html.
