const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/game-stats.json');

const RANKS = [
  { min: 0,  name: 'Bronze',   emoji: '🥉', color: 0xcd7f32 },
  { min: 5,  name: 'Silver',   emoji: '🥈', color: 0xc0c0c0 },
  { min: 10, name: 'Gold',     emoji: '🥇', color: 0xffd700 },
  { min: 20, name: 'Diamond',  emoji: '💎', color: 0x00bfff },
  { min: 30, name: 'Master',   emoji: '🔮', color: 0x9b59b6 },
  { min: 45, name: 'Champion', emoji: '🏆', color: 0xff6b00 },
  { min: 60, name: 'Legend',   emoji: '👑', color: 0xff0000 },
];

const XP_PER_LEVEL   = 150;
const DAILY_COINS    = 500;
const DAILY_XP       = 100;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

const REWARDS = {
  win:  { coins: 200, xp: 50 },
  loss: { coins: 10,  xp: 20 },
  draw: { coins: 50,  xp: 30 },
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

function getPlayer(userId) {
  const d = load();
  if (!d[userId]) {
    d[userId] = { coins: 100, xp: 0, level: 1, streak: 0, lastDaily: null,
      stats: { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gamesDraw: 0 }, gameStats: {} };
    save(d);
  }
  return d[userId];
}

function savePlayer(userId, p) { const d = load(); d[userId] = p; save(d); }

function getRank(level) {
  let r = RANKS[0];
  for (const rank of RANKS) if (level >= rank.min) r = rank;
  return r;
}

function addXP(userId, amount) {
  const p = getPlayer(userId);
  p.xp += amount;
  let leveled = false;
  while (p.xp >= p.level * XP_PER_LEVEL) { p.xp -= p.level * XP_PER_LEVEL; p.level++; leveled = true; }
  savePlayer(userId, p);
  return { leveled, level: p.level, rank: getRank(p.level) };
}

function addCoins(userId, amount) {
  const p = getPlayer(userId);
  p.coins = Math.max(0, p.coins + amount);
  savePlayer(userId, p);
  return p.coins;
}

function recordGame(userId, result, game) {
  const p = getPlayer(userId);
  p.stats.gamesPlayed++;
  if (result === 'win')  p.stats.gamesWon++;
  if (result === 'loss') p.stats.gamesLost++;
  if (result === 'draw') p.stats.gamesDraw++;
  if (!p.gameStats[game]) p.gameStats[game] = { played: 0, won: 0, lost: 0, draw: 0 };
  p.gameStats[game].played++;
  if (result === 'win')  p.gameStats[game].won++;
  if (result === 'loss') p.gameStats[game].lost++;
  if (result === 'draw') p.gameStats[game].draw++;
  const r = REWARDS[result] || REWARDS.loss;
  p.coins += r.coins;
  p.xp    += r.xp;
  while (p.xp >= p.level * XP_PER_LEVEL) { p.xp -= p.level * XP_PER_LEVEL; p.level++; }
  savePlayer(userId, p);
  return r;
}

function claimDaily(userId) {
  const p    = getPlayer(userId);
  const now  = Date.now();
  if (p.lastDaily && now - p.lastDaily < DAILY_COOLDOWN) {
    return { success: false, remaining: DAILY_COOLDOWN - (now - p.lastDaily) };
  }
  const isStreak = p.lastDaily && now - p.lastDaily < DAILY_COOLDOWN * 2;
  p.streak  = isStreak ? (p.streak || 0) + 1 : 1;
  const bonus = Math.min(p.streak * 50, 500);
  const coins = DAILY_COINS + bonus;
  p.coins   += coins;
  p.xp      += DAILY_XP;
  while (p.xp >= p.level * XP_PER_LEVEL) { p.xp -= p.level * XP_PER_LEVEL; p.level++; }
  p.lastDaily = now;
  savePlayer(userId, p);
  return { success: true, coins, bonus, streak: p.streak, xp: DAILY_XP };
}

function getLeaderboard(limit = 10) {
  return Object.entries(load())
    .map(([userId, p]) => ({ userId, ...p }))
    .sort((a, b) => b.level !== a.level ? b.level - a.level : b.xp - a.xp)
    .slice(0, limit);
}

module.exports = { getPlayer, savePlayer, getRank, addXP, addCoins, recordGame, claimDaily, getLeaderboard, RANKS, REWARDS };
