const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getAntinuke, saveAntinuke } = require('../utils/antinukeSettings');

// ── Action Tracker ─────────────────────────────────────────────────────────────
// guildId -> userId -> { action: [timestamp, ...] }
const tracker = new Map();
// Prevent duplicate punishments
const punished = new Set();

function trackAction(guildId, userId, action, windowMs = 10000) {
  if (!tracker.has(guildId)) tracker.set(guildId, new Map());
  const users = tracker.get(guildId);
  if (!users.has(userId)) users.set(userId, {});
  const acts = users.get(userId);
  if (!acts[action]) acts[action] = [];

  const now = Date.now();
  acts[action] = acts[action].filter(t => now - t < windowMs);
  acts[action].push(now);
  return acts[action].length;
}

// ── Whitelist Check ────────────────────────────────────────────────────────────
function isWhitelisted(settings, userId, member, guild) {
  if (userId === guild.ownerId) return true;
  if (userId === guild.client.user.id) return true;
  if (settings.whitelist?.users?.includes(userId)) return true;
  if (member && settings.whitelist?.roles?.some(rId => member.roles?.cache?.has(rId))) return true;
  return false;
}

// ── Fetch Audit Log Entry ──────────────────────────────────────────────────────
async function getAuditEntry(guild, type, maxAgeMs = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > maxAgeMs) return null;
    return entry;
  } catch { return null; }
}

// ── Punish Executor ────────────────────────────────────────────────────────────
async function punish(guild, executorId, settings, reason) {
  const key = `${guild.id}:${executorId}`;
  if (punished.has(key)) return;
  punished.add(key);
  setTimeout(() => punished.delete(key), 30000);

  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) {
      // Not in server — ban directly
      await guild.members.ban(executorId, { reason: `Anti-Nuke: ${reason}` }).catch(() => {});
      return;
    }

    switch (settings.punishment) {
      case 'ban':
        await guild.members.ban(executorId, { reason: `Anti-Nuke: ${reason}` }).catch(() => {});
        break;
      case 'strip':
        await member.roles.set([], `Anti-Nuke: ${reason}`).catch(() => {});
        break;
      case 'timeout':
        await member.timeout(24 * 60 * 60 * 1000, `Anti-Nuke: ${reason}`).catch(() => {});
        break;
      case 'kick':
      default:
        await member.kick(`Anti-Nuke: ${reason}`).catch(() => {});
        break;
    }
  } catch {}
}

// ── Send Log Embed ─────────────────────────────────────────────────────────────
async function sendLog(guild, settings, embed) {
  if (!settings.logChannelId) return;
  const ch = guild.channels.cache.get(settings.logChannelId);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

function buildLogEmbed(title, fields, color = 0x9b59b6) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields(fields)
    .setColor(color)
    .setFooter({ text: 'Powered by Zenix Realm • Anti-Nuke' })
    .setTimestamp();
}

// ── Channel Delete ─────────────────────────────────────────────────────────────
async function handleChannelDelete(channel) {
  if (!channel.guild) return;
  const guild    = channel.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  // Cache channel data for potential recovery
  const channelData = {
    name:      channel.name,
    type:      channel.type,
    parentId:  channel.parentId,
    position:  channel.rawPosition,
    topic:     channel.topic || null,
    nsfw:      channel.nsfw || false,
    permissionOverwrites: channel.permissionOverwrites?.cache?.map(o => ({
      id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString(),
    })) ?? [],
  };

  const entry = await getAuditEntry(guild, AuditLogEvent.ChannelDelete);
  if (!entry) return;

  const executor = entry.executor;
  const member   = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, member, guild)) return;

  const count = trackAction(guild.id, executor.id, 'channelDelete');
  const threshold = settings.thresholds?.channelDelete ?? 3;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Mass channel delete (${count} channels)`);

    // Recovery: recreate channel
    if (settings.recovery) {
      try {
        await guild.channels.create({
          name:      channelData.name,
          type:      channelData.type,
          parent:    channelData.parentId,
          position:  channelData.position,
          topic:     channelData.topic,
          nsfw:      channelData.nsfw,
        });
      } catch {}
    }

    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Channel Delete', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Channel', value: `#${channelData.name}`, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
      { name: 'Recovery', value: settings.recovery ? '✅ Attempted' : '❌ Disabled', inline: true },
    ], 0xe74c3c));
  }
}

// ── Channel Create ─────────────────────────────────────────────────────────────
async function handleChannelCreate(channel) {
  if (!channel.guild) return;
  const guild    = channel.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  const entry = await getAuditEntry(guild, AuditLogEvent.ChannelCreate);
  if (!entry) return;

  const executor = entry.executor;
  const member   = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, member, guild)) return;

  const count     = trackAction(guild.id, executor.id, 'channelCreate');
  const threshold = settings.thresholds?.channelCreate ?? 5;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Mass channel create (${count} channels)`);
    await channel.delete().catch(() => {});
    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Channel Spam', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
    ], 0xe74c3c));
  }
}

// ── Role Delete ────────────────────────────────────────────────────────────────
async function handleRoleDelete(role) {
  const guild    = role.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  const roleData = {
    name:        role.name,
    color:       role.color,
    hoist:       role.hoist,
    permissions: role.permissions.bitfield.toString(),
    mentionable: role.mentionable,
    position:    role.rawPosition,
  };

  const entry = await getAuditEntry(guild, AuditLogEvent.RoleDelete);
  if (!entry) return;

  const executor = entry.executor;
  const member   = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, member, guild)) return;

  const count     = trackAction(guild.id, executor.id, 'roleDelete');
  const threshold = settings.thresholds?.roleDelete ?? 3;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Mass role delete (${count} roles)`);

    // Recovery: recreate role
    if (settings.recovery) {
      try {
        await guild.roles.create({
          name:        roleData.name,
          color:       roleData.color,
          hoist:       roleData.hoist,
          mentionable: roleData.mentionable,
          position:    roleData.position,
          reason:      'Anti-Nuke recovery',
        });
      } catch {}
    }

    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Role Delete', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Role', value: roleData.name, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
      { name: 'Recovery', value: settings.recovery ? '✅ Attempted' : '❌ Disabled', inline: true },
    ], 0xe74c3c));
  }
}

// ── Role Create ────────────────────────────────────────────────────────────────
async function handleRoleCreate(role) {
  const guild    = role.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  const entry = await getAuditEntry(guild, AuditLogEvent.RoleCreate);
  if (!entry) return;

  const executor = entry.executor;
  const member   = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, member, guild)) return;

  const count     = trackAction(guild.id, executor.id, 'roleCreate');
  const threshold = settings.thresholds?.roleCreate ?? 5;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Mass role create (${count} roles)`);
    await role.delete().catch(() => {});
    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Role Spam', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
    ], 0xe74c3c));
  }
}

// ── Mass Ban ───────────────────────────────────────────────────────────────────
async function handleGuildBanAdd(ban) {
  const guild    = ban.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  const entry = await getAuditEntry(guild, AuditLogEvent.MemberBanAdd);
  if (!entry) return;

  const executor = entry.executor;
  const member   = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, member, guild)) return;

  const count     = trackAction(guild.id, executor.id, 'ban');
  const threshold = settings.thresholds?.ban ?? 5;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Mass ban (${count} bans)`);
    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Mass Ban', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Victim', value: `${ban.user.tag}`, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
    ], 0xe74c3c));
  }
}

// ── Mass Kick Detection ────────────────────────────────────────────────────────
async function handleGuildMemberRemove(member) {
  const guild    = member.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  // Check audit log to see if this was a kick (not a leave)
  const entry = await getAuditEntry(guild, AuditLogEvent.MemberKick);
  if (!entry || entry.target?.id !== member.id) return;

  const executor = entry.executor;
  const exMember = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, exMember, guild)) return;

  const count     = trackAction(guild.id, executor.id, 'kick');
  const threshold = settings.thresholds?.kick ?? 5;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Mass kick (${count} kicks)`);
    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Mass Kick', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Victim', value: `${member.user.tag}`, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
    ], 0xe74c3c));
  }
}

// ── Bot Add Detection ──────────────────────────────────────────────────────────
async function handleGuildMemberAdd(member) {
  if (!member.user.bot) return;
  const guild    = member.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  const entry = await getAuditEntry(guild, AuditLogEvent.BotAdd, 8000);
  if (!entry) return;

  const executor = entry.executor;
  const exMember = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, exMember, guild)) return;

  await punish(guild, executor.id, settings, `Unauthorized bot added (${member.user.tag})`);
  await member.kick('Anti-Nuke: Unauthorized bot').catch(() => {});

  await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Bot Added', [
    { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
    { name: 'Bot', value: `${member.user.tag}`, inline: true },
    { name: 'Punishment', value: settings.punishment, inline: true },
  ], 0xe74c3c));
}

// ── Webhook Create ─────────────────────────────────────────────────────────────
async function handleWebhookUpdate(channel) {
  if (!channel.guild) return;
  const guild    = channel.guild;
  const settings = getAntinuke(guild.id);
  if (!settings.enabled) return;

  const entry = await getAuditEntry(guild, AuditLogEvent.WebhookCreate);
  if (!entry) return;

  const executor = entry.executor;
  const member   = await guild.members.fetch(executor.id).catch(() => null);
  if (isWhitelisted(settings, executor.id, member, guild)) return;

  const count     = trackAction(guild.id, executor.id, 'webhookCreate');
  const threshold = settings.thresholds?.webhookCreate ?? 3;

  if (count >= threshold) {
    await punish(guild, executor.id, settings, `Webhook spam (${count} webhooks)`);

    // Delete the newly created webhook
    try {
      const webhooks = await channel.fetchWebhooks();
      for (const wh of webhooks.values()) {
        if (wh.owner?.id === executor.id) await wh.delete('Anti-Nuke').catch(() => {});
      }
    } catch {}

    await sendLog(guild, settings, buildLogEmbed('🔨 Anti-Nuke: Webhook Spam', [
      { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Count', value: `${count} in 10s`, inline: true },
      { name: 'Punishment', value: settings.punishment, inline: true },
    ], 0xe74c3c));
  }
}

// ── Attach all listeners to client ────────────────────────────────────────────
function attachEvents(client) {
  client.on('channelDelete',      handleChannelDelete);
  client.on('channelCreate',      handleChannelCreate);
  client.on('roleDelete',         handleRoleDelete);
  client.on('roleCreate',         handleRoleCreate);
  client.on('guildBanAdd',        handleGuildBanAdd);
  client.on('guildMemberRemove',  handleGuildMemberRemove);
  client.on('guildMemberAdd',     handleGuildMemberAdd);
  client.on('webhookUpdate',      handleWebhookUpdate);
}

module.exports = { attachEvents };
