'use strict';
// Player settings, saved in the browser. Sound on/off and music on/off live in SFX.

const DIFFICULTY = [
  { name: 'EASY', speed: -0.05, aggression: 0.6 },
  { name: 'NORMAL', speed: 0, aggression: 1 },
  { name: 'HARD', speed: 0.05, aggression: 1.4 },
];

const OPTION_DEFAULTS = {
  musicVol: 7,        // 0-10
  sfxVol: 8,          // 0-10
  difficulty: 1,      // index into DIFFICULTY
  units: 'kmh',       // 'kmh' | 'mph'
  shake: true,
  rumble: true,
  minimap: true,
};

const Options = Object.assign({}, OPTION_DEFAULTS, loadJSON('cc_options', {}));

function saveOptions() { saveJSON('cc_options', Options); }

// Clear saved progress: championship save, practice lap records and the last track picked.
function resetSaveData() {
  removeKey('cc_champ');
  removeKey('cc_lastTrack');
  for (const t of TRACKS) { removeKey('cc_record_' + t.name); removeKey('cc_record2_' + t.name); }
}
