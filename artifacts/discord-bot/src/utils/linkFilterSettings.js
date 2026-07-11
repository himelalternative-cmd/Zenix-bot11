const fs   = require('fs');
const path = require('path');

const DATA_DIR = require('./dataDir');
const FILE = path.join(DATA_DIR, 'linkfilter-settings.json');

const DEFAULTS = {
  enabled: true, // link filter is on by default in every guild
};

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getLinkFilter(guildId) {
  const d = load();
  if (!d[guildId]) {
    d[guildId] = { ...DEFAULTS };
    save(d);
  }
  return d[guildId];
}

function saveLinkFilter(guildId, settings) {
  const d = load();
  d[guildId] = settings;
  save(d);
}

module.exports = { getLinkFilter, saveLinkFilter, DEFAULTS };
