const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../data/guild-settings.json');
const TMP_PATH  = DATA_PATH + '.tmp';

// ── In-memory cache (single source of truth) ──────────────────────────────────
// Eliminates the read-modify-write race: all reads hit the cache, not disk.
// Node.js is single-threaded so synchronous writes are serialised automatically.
let _cache = null;

function ensureDataDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, '{}', 'utf8');
}

function loadFromDisk() {
  ensureDataDir();
  try {
    _cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    _cache = {};
  }
}

function getSettings() {
  if (_cache === null) loadFromDisk();
  return _cache;
}

function saveSettings(data) {
  _cache = data;
  ensureDataDir();
  // Atomic write: write to a temp file first, then rename (rename is atomic on Linux)
  fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(TMP_PATH, DATA_PATH);
}

function getGuildSettings(guildId) {
  const all = getSettings();
  if (!all[guildId]) {
    all[guildId] = {
      orderChannelId: null,
      orderTitle: '▶ Order Details:',
      orderIdPrefix: 'ORDER',
      orderColor: 0x9b59b6,
      dmMessage: null,
      dmEmbed: false,
      dmColor: null,
      items: [],
      orderCount: 0,
    };
    saveSettings(all);
  }
  return all[guildId];
}

function saveGuildSettings(guildId, settings) {
  const all = getSettings(); // reads from cache — no stale disk snapshot
  all[guildId] = settings;
  saveSettings(all);
}

const COLOR_MAP = {
  Red: 0xe74c3c,
  Orange: 0xe67e22,
  Yellow: 0xf1c40f,
  Green: 0x2ecc71,
  Teal: 0x1abc9c,
  Blue: 0x3498db,
  Indigo: 0x4b0082,
  Purple: 0x9b59b6,
  Pink: 0xff69b4,
  White: 0xffffff,
  Black: 0x000000,
  Gold: 0xffd700,
  Cyan: 0x00ffff,
  Lime: 0x00ff00,
  Blurple: 0x5865f2,
};

const RANDOM_DM_COLORS = [
  0xff6b6b, 0xb39ddb, 0x80cbc4, 0xf48fb1, 0xce93d8,
  0xa5d6a7, 0xffcc02, 0x80deea, 0xffca28, 0x90caf9,
  0xef9a9a, 0xc5e1a5, 0xffe082, 0x81d4fa, 0xf0a500,
  0xe8a0bf, 0x98ff98, 0xd4a5a5, 0xa8d8ea, 0xffd59e,
  0xc9b1ff, 0x9de8bc, 0xffb347, 0x87ceeb, 0xdc143c,
];

function resolveColor(name) {
  return COLOR_MAP[name] ?? 0x9b59b6;
}

function randomDmColor() {
  return RANDOM_DM_COLORS[Math.floor(Math.random() * RANDOM_DM_COLORS.length)];
}

function generateOrderId(prefix) {
  const digits = Math.floor(10000000 + Math.random() * 90000000).toString();
  return `${prefix}-${digits}`;
}

module.exports = {
  getSettings,
  saveSettings,
  getGuildSettings,
  saveGuildSettings,
  COLOR_MAP,
  RANDOM_DM_COLORS,
  resolveColor,
  randomDmColor,
  generateOrderId,
};
