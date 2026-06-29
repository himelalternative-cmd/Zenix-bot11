const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/verify-settings.json');

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

function getGuildVerify(guildId)            { return load()[guildId] || null; }
function saveGuildVerify(guildId, settings) { const d = load(); d[guildId] = settings; save(d); }
function clearGuildVerify(guildId)          { const d = load(); delete d[guildId]; save(d); }

module.exports = { getGuildVerify, saveGuildVerify, clearGuildVerify };
