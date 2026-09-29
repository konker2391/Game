'use strict';
// Game content: themes, drivers, weapons, tracks and economy tables.

const THEMES = {
  desert: {
    name: 'DESERT', ground: '#d6ad6b', speck: ['#c89d5a', '#e4c088', '#b98c4b'],
    shoulder: '#c39659', road: '#5d5752', roadEdge: '#48433f', curbA: '#ffffff', curbB: '#d23a2a',
    wall: '#6e4222', wallB: '#b0703d', line: '#f2d24b', grip: 1.0, offSpeed: 0.55, offDamage: 0,
    decor: ['cactus', 'cactus', 'cactus', 'rock', 'rock', 'rock', 'skull'],
  },
  snow: {
    name: 'ARCTIC', ground: '#e9f0f7', speck: ['#d4e1ee', '#ffffff', '#c3d4e4'],
    shoulder: '#d8e4ef', road: '#6f7d8c', roadEdge: '#5a6775', curbA: '#ffffff', curbB: '#2d6fd2',
    wall: '#2e4a66', wallB: '#7ea3c6', line: '#ffffff', grip: 0.6, offSpeed: 0.6, offDamage: 0,
    decor: ['pine', 'pine', 'pine', 'snowman', 'rock'],
  },
  city: {
    name: 'CITY', ground: '#2a2e39', speck: ['#323744', '#242832', '#393e4c'],
    shoulder: '#4a4e5a', road: '#3a3c44', roadEdge: '#26282e', curbA: '#e8e8e8', curbB: '#f2c318',
    wall: '#15171d', wallB: '#ff3fa4', line: '#f2c318', grip: 1.0, offSpeed: 0.6, offDamage: 0,
    decor: ['building', 'building', 'building', 'lamp'], night: true,
  },
  jungle: {
    name: 'JUNGLE', ground: '#3b8636', speck: ['#2e772b', '#4d9a44', '#347c2f'],
    shoulder: '#7a5a33', road: '#6b5847', roadEdge: '#56463a', curbA: '#f7e7b5', curbB: '#3b6b2a',
    wall: '#4a3018', wallB: '#8d6337', line: '#e8d9a0', grip: 0.9, offSpeed: 0.5, offDamage: 0,
    decor: ['palm', 'palm', 'bush', 'bush', 'rock'],
  },
  junk: {
    name: 'SCRAPYARD', ground: '#6b6350', speck: ['#5d5645', '#7a7160', '#524b3c'],
    shoulder: '#80735a', road: '#4d4a46', roadEdge: '#3b3936', curbA: '#f0d040', curbB: '#222222',
    wall: '#2e2b27', wallB: '#8c8577', line: '#f0d040', grip: 0.95, offSpeed: 0.55, offDamage: 0,
    decor: ['tires', 'wreck', 'barrel', 'tires', 'wreck'],
  },
  volcano: {
    name: 'VOLCANO', ground: '#2a1917', speck: ['#3a2320', '#1f1110', '#4a2a22'],
    shoulder: '#5c2a19', road: '#3d3838', roadEdge: '#2a2626', curbA: '#ffd23f', curbB: '#e0421b',
    wall: '#140a09', wallB: '#ff6a1f', line: '#ff9a2f', grip: 1.0, offSpeed: 0.6, offDamage: 7,
    decor: ['lava', 'lavarock', 'lavarock', 'crystal'],
  },
};

// Stats run 1-5. Each driver has a signature special weapon.
const DRIVERS = [
  {
    id: 'havoc', name: 'SGT. HAVOC', car: 'Armored Jeep', num: 1, color: '#5d7d38', accent: '#d7e08a',
    body: 'jeep', stats: { speed: 3, accel: 2, handling: 3, armor: 5 }, special: 'missile',
    quote: 'Target acquired. Fire at will!',
  },
  {
    id: 'blaze', name: 'BLAZE', car: 'Hot Rod', num: 2, color: '#d8431f', accent: '#ffc12e',
    body: 'hotrod', stats: { speed: 4, accel: 4, handling: 2, armor: 2 }, special: 'flame',
    quote: 'Eat my flames, slowpokes!',
  },
  {
    id: 'volt', name: 'DR. VOLT', car: 'Tesla Coupe', num: 3, color: '#2f63d6', accent: '#8ff3ff',
    body: 'coupe', stats: { speed: 3, accel: 3, handling: 5, armor: 2 }, special: 'emp',
    quote: 'Science always wins the race.',
  },
  {
    id: 'grease', name: 'GREASE MONKEY', car: 'Tow Pickup', num: 4, color: '#8a5a2b', accent: '#f0b24a',
    body: 'pickup', stats: { speed: 3, accel: 3, handling: 3, armor: 4 }, special: 'oil',
    quote: 'Watch your step. It gets slippery!',
  },
  {
    id: 'mina', name: 'MINA BLAST', car: 'Rally Car', num: 5, color: '#a63ad0', accent: '#ffe066',
    body: 'rally', stats: { speed: 4, accel: 4, handling: 4, armor: 1 }, special: 'mine',
    quote: 'I leave a little present behind.',
  },
  {
    id: 'tex', name: 'TURBO TEX', car: 'Muscle Car', num: 6, color: '#e6b91c', accent: '#1b1b1b',
    body: 'muscle', stats: { speed: 5, accel: 3, handling: 2, armor: 3 }, special: 'nitro',
    quote: 'Yee-haw! Full throttle, partner!',
  },
  {
    id: 'frost', name: 'FROSTBITE', car: 'Snow Racer', num: 7, color: '#9fdcff', accent: '#2a5fa8',
    body: 'sled', stats: { speed: 4, accel: 3, handling: 4, armor: 2 }, special: 'freeze',
    quote: 'Chill out. Permanently.',
  },
  {
    id: 'brick', name: 'BRICK', car: 'Monster Truck', num: 8, color: '#5a5f66', accent: '#ff5a36',
    body: 'truck', stats: { speed: 2, accel: 3, handling: 2, armor: 5 }, special: 'ram',
    quote: 'Outta my way!',
  },
];

// Weapons shared by driver specials and track pickups.
const WEAPONS = {
  missile: { name: 'MISSILE', ammo: 4, cd: 0.6, desc: 'Homing rocket locks on to the car ahead.' },
  flame: { name: 'FLAMER', ammo: 6, cd: 0.9, desc: 'Short-range burst of fire.' },
  emp: { name: 'EMP BLAST', ammo: 3, cd: 1.5, desc: 'Shocks and stalls every car nearby.' },
  oil: { name: 'OIL SLICK', ammo: 5, cd: 0.5, desc: 'Drops oil that spins cars out.' },
  mine: { name: 'MINE', ammo: 5, cd: 0.5, desc: 'Drops an explosive mine behind you.' },
  nitro: { name: 'NITRO', ammo: 4, cd: 2.5, desc: 'Huge burst of speed.' },
  freeze: { name: 'FREEZE RAY', ammo: 4, cd: 0.8, desc: 'Ice bolt that freezes a rival solid.' },
  ram: { name: 'RAM PLATE', ammo: 3, cd: 4.5, desc: 'Invulnerable charge that wrecks what it hits.' },
  repair: { name: 'REPAIR', desc: 'Restores armor.' },
  cash: { name: 'CASH', desc: 'Bonus prize money.' },
};

const ITEM_TABLE = [['missile', 3], ['mine', 2], ['oil', 2], ['nitro', 3], ['freeze', 2], ['repair', 1.4], ['cash', 1.4]];

// Closed-loop control points (world pixels). The centerline is a centripetal
// Catmull-Rom spline through them.
const TRACKS = [
  {
    name: 'SANDSTORM SPEEDWAY', theme: 'desert', laps: 3, seed: 11,
    points: [[400, 400], [1400, 300], [2400, 400], [2800, 800], [2650, 1300], [2050, 1420], [1600, 1180], [1150, 1480], [600, 1500], [300, 1000]],
  },
  {
    name: 'FROSTBITE PASS', theme: 'snow', laps: 3, seed: 22,
    points: [[500, 300], [1500, 250], [2200, 500], [2300, 1000], [1800, 1250], [1300, 1050], [900, 1250], [1000, 1700], [1800, 1800], [2600, 1700], [2900, 2100], [2400, 2500], [1200, 2500], [400, 2200], [250, 1300]],
  },
  {
    name: 'NEON NIGHTS', theme: 'city', laps: 3, seed: 33,
    points: [[520, 380], [1200, 400], [1450, 520], [1520, 800], [1560, 1050], [1800, 1200], [2600, 1200], [2820, 1360], [2860, 1700], [2800, 2000], [2560, 2180], [1000, 2200], [650, 2120], [480, 1900], [520, 1600], [700, 1300], [640, 1000], [400, 780], [360, 560]],
  },
  {
    name: 'JUNGLE RUMBLE', theme: 'jungle', laps: 3, seed: 44,
    points: [[400, 500], [1000, 300], [1700, 400], [2100, 800], [1850, 1200], [1300, 1100], [900, 1350], [1100, 1750], [1700, 1750], [2300, 1600], [2700, 1900], [2500, 2400], [1800, 2550], [1100, 2400], [500, 2200], [250, 1600], [300, 1000]],
  },
  {
    name: 'SCRAPHEAP SHUFFLE', theme: 'junk', laps: 3, seed: 55,
    points: [[500, 500], [1300, 400], [1850, 700], [1750, 1100], [1200, 1200], [900, 1520], [1200, 1880], [1900, 1820], [2300, 1400], [2400, 850], [2800, 500], [3200, 800], [3250, 1600], [2950, 2200], [2200, 2550], [1200, 2550], [500, 2300], [300, 1600], [300, 900]],
  },
  {
    name: 'MAGMA MAYHEM', theme: 'volcano', laps: 3, seed: 66,
    points: [[600, 400], [1600, 350], [2500, 500], [2900, 1000], [2600, 1500], [2000, 1520], [1700, 1900], [2100, 2300], [2800, 2300], [3100, 2700], [2700, 3100], [1700, 3100], [900, 2900], [600, 2400], [1000, 1900], [900, 1400], [400, 1150], [350, 700]],
  },
  {
    name: 'CANYON CARNAGE', theme: 'desert', laps: 3, seed: 77,
    points: [[400, 600], [900, 300], [1600, 400], [2000, 900], [2600, 700], [3200, 900], [3300, 1500], [2800, 1800], [2200, 1700], [1800, 2050], [2200, 2450], [2850, 2500], [3050, 2800], [2800, 3150], [1900, 3200], [1000, 3000], [900, 2400], [1200, 1950], [950, 1500], [400, 1300]],
  },
  {
    name: 'MEGACITY MADNESS', theme: 'city', laps: 3, seed: 88,
    points: [[500, 400], [1500, 300], [2500, 350], [3300, 500], [3500, 1000], [3100, 1400], [2500, 1300], [2100, 1650], [2400, 2050], [3200, 2000], [3600, 2400], [3400, 3000], [2600, 3200], [1800, 3000], [1400, 2500], [900, 2750], [500, 2400], [600, 1800], [1000, 1650], [1170, 1350], [900, 1080], [520, 1000], [360, 700]],
  },
];

const PRIZES = [5000, 3500, 2500, 1800, 1200, 800, 500, 300];
const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const QUALIFY_PLACE = 4;
const KO_BONUS = 300;
const START_CASH = 1500;
const START_CONTINUES = 3;

const UPGRADES = [
  { key: 'engine', name: 'ENGINE', desc: 'Top speed and acceleration', costs: [2000, 3500, 5500, 8000] },
  { key: 'tires', name: 'TIRES', desc: 'Grip and handling', costs: [1500, 2500, 4000, 6000] },
  { key: 'armor', name: 'ARMOR', desc: 'Hit points', costs: [1500, 2500, 4000, 6000] },
];
const AMMO_PACK = { amount: 2, cost: 1200, max: 8 };
