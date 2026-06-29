const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/antinuke-settings.json');

const DEFAULTS = {
  enabled:      false,
  logChannelId: null,
  punishment:   'kick',   // kick | ban | strip | timeout
  recovery:     true,
  thresholds: {
    channelDelete:  3,  // per 10s
    channelCreate:  5,
    roleDelete:     3,
    roleCreate:     5,
    ban:            5,
    kick:           5,
    webhookCreate:  3,
    botAdd:         1,
  },
  whitelist: { users: [], roles: [] },
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

function getAntinuke(guildId) {
  const d = load();
  if (!d[guildId]) { d[guildId] = { ...DEFAULTS, whitelist: { users: [], roles: [] }, thresholds: { ...DEFAULTS.thresholds } }; save(d); }
  return d[guildId];
}

function saveAntinuke(guildId, settings) {
  const d = load();
  d[guildId] = settings;
  save(d);
}

module.exports = { getAntinuke, saveAntinuke, DEFAULTS };
