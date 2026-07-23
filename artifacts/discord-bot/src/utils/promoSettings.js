const fs = require('fs');
const path = require('path');
const DATA_DIR = require('./dataDir');

const DATA_PATH = path.join(DATA_DIR, 'promo-settings.json');
const TMP_PATH  = DATA_PATH + '.tmp';

let _cache = null;

function ensureFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, '{}', 'utf8');
}

function load() {
  ensureFile();
  try {
    _cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    _cache = {};
  }
}

function all() {
  if (_cache === null) load();
  return _cache;
}

function save(data) {
  _cache = data;
  ensureFile();
  fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(TMP_PATH, DATA_PATH);
}

/** Get the promo text for a guild, or null if not set. */
function getPromo(guildId) {
  return all()[guildId] ?? null;
}

/** Set (or overwrite) the promo text for a guild. */
function setPromo(guildId, text) {
  const data = all();
  data[guildId] = text;
  save(data);
}

module.exports = { getPromo, setPromo };
