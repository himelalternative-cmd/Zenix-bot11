// ─── Auto Backup Utility ────────────────────────────────────────────────────
// On bot ready, sends all data JSON files to a private backup channel.
// Set BACKUP_CHANNEL_ID in Railway environment variables to enable.

const fs   = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const DATA_DIR = require('./dataDir');

const DATA_FILES = [
  'guild-settings.json',
  'zenix-points.json',
  'antinuke-settings.json',
  'stock-history.json',
  'tickets.json',
  'moderation-warnings.json',
  'autoreact.json',
  'linkfilter-settings.json',
  'verify-settings.json',
  'game-stats.json',
];

async function sendBackup(client) {
  const channelId = process.env.BACKUP_CHANNEL_ID;
  if (!channelId) return; // silently skip if not configured

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.warn('[Backup] BACKUP_CHANNEL_ID set but channel not found:', channelId);
      return;
    }

    const attachments = [];
    const missing     = [];

    for (const filename of DATA_FILES) {
      const filePath = path.join(DATA_DIR, filename);
      if (fs.existsSync(filePath)) {
        attachments.push(new AttachmentBuilder(filePath, { name: filename }));
      } else {
        missing.push(filename);
      }
    }

    if (attachments.length === 0) {
      await channel.send('⚠️ **Zenix Backup** — no data files found to back up.');
      return;
    }

    const now      = new Date().toUTCString();
    const summary  = [
      `📦 **Zenix Auto-Backup** — \`${now}\``,
      `✅ Files backed up: **${attachments.length}**`,
      missing.length ? `⚪ Not found (empty/unused): ${missing.map(f => `\`${f}\``).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // Discord allows max 10 attachments per message — split if needed
    for (let i = 0; i < attachments.length; i += 10) {
      const chunk   = attachments.slice(i, i + 10);
      const content = i === 0 ? summary : `📦 **Zenix Auto-Backup** (continued)`;
      await channel.send({ content, files: chunk });
    }

    console.log(`[Backup] Sent ${attachments.length} file(s) to backup channel.`);
  } catch (err) {
    console.error('[Backup] Failed to send backup:', err.message);
  }
}

module.exports = { sendBackup };
