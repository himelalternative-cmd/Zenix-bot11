const fs   = require('fs');
const path = require('path');

const DATA_DIR = require('./dataDir');
const FILE = path.join(DATA_DIR, 'moderation-warnings.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Returns the list of warnings for a user in a guild (never null).
function getWarnings(guildId, userId) {
  const d = load();
  return d[guildId]?.[userId] ?? [];
}

// Adds a warning and returns the new list.
function addWarning(guildId, userId, { reason, moderatorId }) {
  const d = load();
  if (!d[guildId]) d[guildId] = {};
  if (!d[guildId][userId]) d[guildId][userId] = [];

  d[guildId][userId].push({
    reason: reason || 'No reason provided',
    moderatorId,
    timestamp: Date.now(),
  });

  save(d);
  return d[guildId][userId];
}

// Clears all warnings for a user. Returns how many were removed.
function clearWarnings(guildId, userId) {
  const d = load();
  const count = d[guildId]?.[userId]?.length ?? 0;
  if (d[guildId]) delete d[guildId][userId];
  save(d);
  return count;
}

module.exports = { getWarnings, addWarning, clearWarnings };
