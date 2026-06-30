const fs   = require('fs');
const path = require('path');

const DATA_DIR = require('./dataDir');
const FILE     = require('path').join(DATA_DIR, 'stock-history.json');

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) return {};
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Log a purchase.
 * @param {string} guildId
 * @param {{ userId, username, item, amount, totalCost, timestamp }} entry
 */
function logPurchase(guildId, entry) {
  const all = load();
  if (!all[guildId]) all[guildId] = { logChannelId: null, entries: [] };
  all[guildId].entries.push(entry);
  save(all);
}

/** Get the log channel ID for a guild. */
function getLogChannel(guildId) {
  return load()[guildId]?.logChannelId ?? null;
}

/** Set the private log channel. */
function setLogChannel(guildId, channelId) {
  const all = load();
  if (!all[guildId]) all[guildId] = { logChannelId: null, entries: [] };
  all[guildId].logChannelId = channelId;
  save(all);
}

/**
 * Get paginated history entries for a guild.
 * @returns {{ entries: object[], total: number }}
 */
function getHistory(guildId, { page = 1, perPage = 10, userId = null } = {}) {
  const all     = load();
  let entries   = (all[guildId]?.entries ?? []).slice().reverse(); // newest first
  if (userId) entries = entries.filter(e => e.userId === userId);
  const total   = entries.length;
  const sliced  = entries.slice((page - 1) * perPage, page * perPage);
  return { entries: sliced, total };
}

/** Clear all history entries for a guild. */
function clearHistory(guildId) {
  const all = load();
  if (all[guildId]) all[guildId].entries = [];
  save(all);
}

/**
 * Get top spenders for a guild, sorted by total ZP spent.
 * @param {string} guildId
 * @param {number} limit
 * @returns {{ userId: string, spent: number }[]}
 */
function getSpentLeaderboard(guildId, limit = 10) {
  const entries = load()[guildId]?.entries ?? [];
  const totals  = {};
  for (const e of entries) {
    totals[e.userId] = (totals[e.userId] || 0) + (e.totalCost || 0);
  }
  return Object.entries(totals)
    .map(([userId, spent]) => ({ userId, spent }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}

module.exports = { logPurchase, getLogChannel, setLogChannel, getHistory, clearHistory, getSpentLeaderboard };
