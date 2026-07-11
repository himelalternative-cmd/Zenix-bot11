// Tracks the first moment we observed a Roblox user as a member of the
// configured community group. Roblox's public API does not expose the real
// "joined group at" date, so we approximate it as the first time this bot
// notices the user is a member — that becomes the start of their 14-day
// payout-eligibility countdown.

const fs   = require('fs');
const path = require('path');

const DATA_DIR = require('./dataDir');
const FILE = path.join(DATA_DIR, 'robux-join-tracker.json');

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

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

// Records first-seen membership for a userId if not already tracked.
// Returns the record: { userId, username, firstSeenAt }
function recordFirstSeen(userId, username) {
  const d   = load();
  const key = String(userId);

  if (!d[key]) {
    d[key] = { userId: key, username, firstSeenAt: Date.now() };
    save(d);
  } else if (d[key].username !== username) {
    // Username can change (Roblox allows renames) — keep the timestamp, update the label.
    d[key].username = username;
    save(d);
  }

  return d[key];
}

function getRecord(userId) {
  return load()[String(userId)] || null;
}

function getEligibility(record) {
  if (!record) return { eligible: false, eligibleAt: null };
  const eligibleAt = record.firstSeenAt + FOURTEEN_DAYS_MS;
  return { eligible: Date.now() >= eligibleAt, eligibleAt };
}

module.exports = { recordFirstSeen, getRecord, getEligibility, FOURTEEN_DAYS_MS };
