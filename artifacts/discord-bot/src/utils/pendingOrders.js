// Tracks one pending buy-robux order per user.
// Stored in data/pending-orders.json as { userId: orderObject, ... }

const fs   = require('fs');
const path = require('path');

const DATA_DIR = require('./dataDir');
const FILE     = path.join(DATA_DIR, 'pending-orders.json');
const TMP_FILE = FILE + '.tmp';

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(TMP_FILE, FILE);
}

/** Return the pending order object for a user, or null. */
function getPendingOrder(userId) {
  return load()[userId] ?? null;
}

/** Save or overwrite the pending order for a user. */
function setPendingOrder(userId, order) {
  const data = load();
  data[userId] = order;
  save(data);
}

/** Remove the pending order for a user (call after confirm or cancel). */
function removePendingOrder(userId) {
  const data = load();
  delete data[userId];
  save(data);
}

module.exports = { getPendingOrder, setPendingOrder, removePendingOrder };
