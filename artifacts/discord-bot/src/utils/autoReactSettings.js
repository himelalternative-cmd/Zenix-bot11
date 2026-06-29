const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'autoreact.json');

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/** Get all auto-react configs for a guild. Returns { [channelId]: { emojis: string[] } } */
function getGuildAutoReact(guildId) {
  const all = load();
  return all[guildId] || {};
}

/** Set auto-react emojis for a channel. Pass empty array to clear. */
function setChannelAutoReact(guildId, channelId, emojis) {
  const all = load();
  if (!all[guildId]) all[guildId] = {};
  if (emojis.length === 0) {
    delete all[guildId][channelId];
    if (Object.keys(all[guildId]).length === 0) delete all[guildId];
  } else {
    all[guildId][channelId] = { emojis };
  }
  save(all);
}

module.exports = { getGuildAutoReact, setChannelAutoReact };
