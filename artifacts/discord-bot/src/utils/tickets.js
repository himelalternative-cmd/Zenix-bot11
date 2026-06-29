// ─── Ticket State Utility ───────────────────────────────────────────────────
// Persists open tickets across bot restarts using data/tickets.json
// Structure: { userId: channelId, ... }

const fs = require('fs');
const path = require('path');

const TICKETS_FILE = path.join(__dirname, '../../data/tickets.json');

function load() {
  try {
    if (!fs.existsSync(TICKETS_FILE)) return {};
    return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const dir = path.dirname(TICKETS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Get open channel ID for a user (or null)
function getTicket(userId) {
  return load()[userId] || null;
}

// Record a new open ticket
function setTicket(userId, channelId) {
  const data = load();
  data[userId] = channelId;
  save(data);
}

// Remove a ticket record
function removeTicket(userId) {
  const data = load();
  delete data[userId];
  save(data);
}

// Find the ticket owner by channel ID
function getOwnerByChannel(channelId) {
  const data = load();
  return Object.keys(data).find(uid => data[uid] === channelId) || null;
}

module.exports = { getTicket, setTicket, removeTicket, getOwnerByChannel };
