const path = require('path');
const fs   = require('fs');

// On Railway: set DATA_DIR=/app/artifacts/discord-bot/data in environment variables.
// Locally / fallback: uses the sibling data/ folder next to src/.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = DATA_DIR;
