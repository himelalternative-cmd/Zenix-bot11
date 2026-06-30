const fs   = require('fs');
const path = require('path');

const DATA_DIR = require('./dataDir');
const FILE = require('path').join(DATA_DIR, 'zenix-points.json');

// Conversion rates
const TAKA_PER_POINT = 1;       // 1 Zenix Point = 1 TAKA
const USD_PER_TAKA   = 0.0070;  // 1 TAKA = $0.0070

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

function getBalance(userId) {
  return load()[userId] || 0;
}

function setBalance(userId, amount) {
  const d = load();
  d[userId] = Math.max(0, Math.round(amount));
  save(d);
  return d[userId];
}

function addBalance(userId, amount) {
  return setBalance(userId, getBalance(userId) + amount);
}

function removeBalance(userId, amount) {
  return setBalance(userId, getBalance(userId) - amount);
}

function toTaka(points)  { return (points * TAKA_PER_POINT).toFixed(2); }
function toUSD(points)   { return (points * TAKA_PER_POINT * USD_PER_TAKA).toFixed(4); }

function getLeaderboard(limit = 10) {
  return Object.entries(load())
    .map(([userId, balance]) => ({ userId, balance }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

module.exports = { getBalance, setBalance, addBalance, removeBalance, toTaka, toUSD, getLeaderboard };
