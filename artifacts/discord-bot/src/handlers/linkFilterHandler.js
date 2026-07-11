const { PermissionFlagsBits } = require('discord.js');
const { getLinkFilter } = require('../utils/linkFilterSettings');

// Matches http(s) URLs, bare www. links, and Discord invite links (discord.gg / discord.com/invite).
const LINK_REGEX = /(https?:\/\/\S+|www\.\S+|discord(?:app)?\.(?:gg|com\/invite)\/\S+)/gi;

// Hosts / patterns that are always treated as GIFs and allowed through.
const GIF_HOST_PATTERNS = [
  /(^|\.)tenor\.com$/i,
  /(^|\.)giphy\.com$/i,
  /(^|\.)media\.discordapp\.net$/i, // Discord's own attachment/GIF proxy
  /(^|\.)cdn\.discordapp\.com$/i,
];

function isGifLink(rawUrl) {
  // Strip trailing punctuation commonly attached to links in chat (e.g. "link.com," or "link.com)")
  const cleaned = rawUrl.replace(/[),.!?]+$/, '');

  // Direct .gif file links are always allowed.
  if (/\.gif(?:[?#].*)?$/i.test(cleaned)) return true;

  try {
    const url = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    return GIF_HOST_PATTERNS.some(pattern => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

function containsDisallowedLink(content) {
  const matches = content.match(LINK_REGEX);
  if (!matches) return false;
  return matches.some(match => !isGifLink(match));
}

// Returns true if the message was handled (deleted) by the link filter, so the
// caller can stop further processing (auto-react, prefix commands, etc.).
async function handleLinkFilter(message) {
  if (!message.guild) return false;
  if (message.author.bot) return false;

  const settings = getLinkFilter(message.guild.id);
  if (!settings.enabled) return false;

  const member = message.member;
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return false;

  if (!containsDisallowedLink(message.content)) return false;

  try {
    await message.delete();
  } catch {
    // Missing permissions or already deleted — nothing more we can do.
  }

  try {
    const warning = await message.channel.send({
      content: `${message.author}, sending links is not allowed and it's against the rules.`,
    });
    setTimeout(() => warning.delete().catch(() => {}), 8000);
  } catch {
    // Ignore — channel may not allow the bot to send messages.
  }

  return true;
}

module.exports = { handleLinkFilter, containsDisallowedLink, isGifLink };
