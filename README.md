# Combat Circuit

A top-down vehicular combat racer for the browser, inspired by Sega's 1994 Genesis game *Combat Cars*.
Pick one of eight armed drivers, race seven rivals over eight tracks, blow them off the road, and spend
your winnings in the garage between races.

It is plain HTML5 canvas and JavaScript with no build step and no dependencies. Graphics and sound are generated in code.

## Play

Open `index.html` in a modern browser. Double-clicking the file works, and so does any static server:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- **8 drivers**, each with a unique car, stats (speed, acceleration, handling, armor) and signature weapon:

  | Driver | Car | Special weapon |
  |---|---|---|
  | Sgt. Havoc | Armored Jeep | Homing missiles |
  | Blaze | Hot Rod | Flamethrower |
  | Dr. Volt | Tesla Coupe | EMP blast |
  | Grease Monkey | Tow Pickup | Oil slicks |
  | Mina Blast | Rally Car | Proximity mines |
  | Turbo Tex | Muscle Car | Nitro |
  | Frostbite | Snow Racer | Freeze ray |
  | Brick | Monster Truck | Ram plate |

- **8 tracks** across six terrains: desert, arctic (icy grip), neon city at night, jungle, scrapyard and
  volcano (the shoulders burn).
- **Championship mode**: finish 4th or better to advance. Miss the cut and you spend one of 3 continues.
  You earn points, prize money and $300 for every rival you wreck. Progress saves automatically, so you can
  continue a championship later.
- **Garage**: buy engine, tire and armor upgrades (4 levels each) and extra special-weapon ammo.
- **Track pickups**: `?` crates hold missiles, mines, oil, nitro, freeze bolts, repairs or cash.
  Arrow pads on the road give a speed boost.
- **2-player split screen** for both championship and quick race.
- **Quick race**: any track, 1–9 laps.
- The AI takes racing lines, hunts crates, dodges hazards and fires back.
- Chiptune soundtrack and synthesized sound effects. Press `M` to mute.
- Keyboard, gamepad and touch controls.

## Controls

| Action | 1 player | Player 1 (2P) | Player 2 (2P) | Gamepad |
|---|---|---|---|---|
| Steer / gas / brake | Arrows or WASD | W A S D | Arrows | Stick or d-pad, A gas, B brake |
| Special weapon | Z / Space / J | F | `.` or Numpad 0 | X or RB |
| Use item | X / K | G | `/` or Numpad . | Y or LB |
| Pause | Esc / P | Esc / P | Esc / P | Start |

Menus work with the arrow keys and Enter, a mouse, touch or a gamepad. On touch screens, on-screen buttons
appear during races.

## Code layout

| File | Purpose |
|---|---|
| `js/data.js` | Drivers, weapons, track layouts, themes, prize and upgrade tables |
| `js/track.js` | Spline centerline, nearest-point queries, pickups, boost pads, scenery placement |
| `js/car.js` | Arcade car physics (grip and drift model) |
| `js/race.js` | Race simulation: laps, collisions, weapons, hazards, effects, cameras, HUD |
| `js/ai.js` | Computer drivers |
| `js/render.js` | Procedural car, icon, scenery and track drawing |
| `js/ui.js` | Menus and screens |
| `js/audio.js` | Web Audio sound effects and music sequencer |
| `js/input.js` | Keyboard, gamepad, touch and pointer input |
| `js/main.js` | Championship flow, main loop, canvas scaling |

To add a track, append an entry to `TRACKS` in `js/data.js` with a closed loop of control points. Keep parts
of the loop that are not next to each other at least ~300px apart, and keep corners gentle so the road does not fold.
