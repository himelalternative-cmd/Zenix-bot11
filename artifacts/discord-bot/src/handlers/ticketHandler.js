// ─── Ticket System Handler ────────────────────────────────────────────────────
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const { getTicket, setTicket, removeTicket, getOwnerByChannel } = require('../utils/tickets');

// ── Config ────────────────────────────────────────────────────────────────────
function getConfig() {
  return {
    categoryId:  process.env.TICKET_CATEGORY_ID || null,
    staffRoleId: process.env.STAFF_ROLE_ID       || null,
    logChannelId: process.env.LOG_CHANNEL_ID     || null,
  };
}

// Category display labels
const CATEGORY_LABELS = {
  claim_reward:  '🎁 Claim Reward',
  report:        '❗ Report',
  buy_something: '🪙 Buy Something',
  others:        '✨ Others',
};

// Short names for channel naming
const CATEGORY_SLUGS = {
  claim_reward:  'claim',
  report:        'report',
  buy_something: 'buy',
  others:        'ticket',
};

// ── Ticket action buttons ─────────────────────────────────────────────────────
function ticketButtons(claimDisabled = false, closeDisabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(closeDisabled),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setEmoji('📌').setStyle(ButtonStyle.Primary).setDisabled(claimDisabled),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setEmoji('🗑').setStyle(ButtonStyle.Danger)
  );
}

// ── Select Menu → Create Ticket ───────────────────────────────────────────────
async function handleTicketSelect(interaction) {
  const category = interaction.values[0];
  await createTicket(interaction, category);
}

// ── Core ticket creation ──────────────────────────────────────────────────────
async function createTicket(interaction, category) {
  // Guard against already-acknowledged interactions
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch {
    return;
  }

  const { categoryId, staffRoleId } = getConfig();
  const guild  = interaction.guild;
  const user   = interaction.user;

  // Prevent duplicate open tickets
  const existingId = getTicket(user.id);
  if (existingId) {
    const existing = guild.channels.cache.get(existingId);
    if (existing) {
      return interaction.editReply({ content: `❌ You already have an open ticket: ${existing}` });
    }
    removeTicket(user.id); // stale record — channel was deleted manually
  }

  // Permission overwrites — always include explicit `type` so discord.js
  // never tries to cache-resolve the ID (avoids "not a cached User or Role")
  // type 0 = Role, type 1 = Member/User
  const VIEW_SEND_READ = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];

  const overwrites = [
    // @everyone — hide channel from everyone
    { id: guild.id, type: 0, deny: [PermissionFlagsBits.ViewChannel] },
    // ticket opener
    { id: user.id, type: 1, allow: VIEW_SEND_READ },
    // guild owner
    { id: guild.ownerId, type: 1, allow: VIEW_SEND_READ },
  ];

  if (staffRoleId) {
    overwrites.push({ id: staffRoleId, type: 0, allow: VIEW_SEND_READ });
  }

  const slug = CATEGORY_SLUGS[category] ?? 'ticket';
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';

  let channel;
  try {
    channel = await guild.channels.create({
      name: `${slug}-${safeName}`,
      type: ChannelType.GuildText,
      parent: categoryId || null,
      permissionOverwrites: overwrites,
      topic: `${CATEGORY_LABELS[category] ?? category} | ${user.tag} | ID: ${user.id}`,
    });
  } catch (err) {
    console.error('Failed to create ticket channel:', err.message);
    return interaction.editReply({
      content: `❌ Failed to create ticket channel: \`${err.message}\`\n\nMake sure the bot has **Manage Channels** permission.`,
    });
  }

  setTicket(user.id, channel.id);

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${CATEGORY_LABELS[category] ?? 'Support Ticket'}`)
    .setDescription(
      `Welcome <@${user.id}>!\n\n` +
      `Please describe your issue and a staff member will assist you shortly.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `**Category:** ${CATEGORY_LABELS[category] ?? category}\n` +
      `**Opened by:** <@${user.id}>\n` +
      `**Opened at:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setColor(0x010101)
    .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTimestamp();

  await channel.send({
    content: `<@${user.id}>${staffRoleId ? ` | <@&${staffRoleId}>` : ''}`,
    embeds: [embed],
    components: [ticketButtons()],
  });

  await interaction.editReply({ content: `✅ Ticket created: ${channel}` });
}

// ── Close ─────────────────────────────────────────────────────────────────────
async function handleTicketClose(interaction) {
  const member = interaction.member;
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Only administrators can close tickets.', ephemeral: true });
  }

  await interaction.deferReply();
  const channel = interaction.channel;
  const guild   = interaction.guild;

  await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});

  const ownerId = getOwnerByChannel(channel.id);
  if (ownerId) {
    await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true, SendMessages: false }).catch(() => {});
  }

  // Disable Close button on original embed
  try {
    const msgs = await channel.messages.fetch({ limit: 15 });
    const original = msgs.find(m => m.author.id === guild.members.me.id && m.components.length > 0);
    if (original) await original.edit({ components: [ticketButtons(false, true)] });
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle('🔒 Ticket Closed')
    .setDescription(
      `Closed by <@${interaction.user.id}>.\n\n` +
      `Use 🗑 **Delete** to remove this ticket or 📄 **Transcript** to save the log.`
    )
    .setColor(0xe74c3c)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── Claim ─────────────────────────────────────────────────────────────────────
async function handleTicketClaim(interaction) {
  const member = interaction.member;

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Only administrators can claim tickets.', ephemeral: true });
  }

  // Disable Claim button, label shows who claimed
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel(`Claimed by ${interaction.user.username}`).setEmoji('📌').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setEmoji('🗑').setStyle(ButtonStyle.Danger)
  );

  try {
    const msgs = await interaction.channel.messages.fetch({ limit: 15 });
    const original = msgs.find(m => m.author.id === interaction.guild.members.me.id && m.components.length > 0);
    if (original) await original.edit({ components: [row] });
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle('📌 Ticket Claimed')
    .setDescription(`This ticket has been claimed by <@${interaction.user.id}>.`)
    .setColor(0x2ecc71)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Transcript ────────────────────────────────────────────────────────────────
async function handleTicketTranscript(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  const { logChannelId } = getConfig();

  let allMessages = [];
  let lastId;
  for (let i = 0; i < 5; i++) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch || batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = allMessages.map(m => {
    const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    const att  = m.attachments.size > 0 ? ` [${m.attachments.size} attachment(s)]` : '';
    return `[${time}] ${m.author.tag}: ${m.content}${att}`;
  });

  const transcript = [
    `Transcript for #${channel.name}`,
    `Generated: ${new Date().toISOString()}`,
    `Messages: ${lines.length}`,
    '═'.repeat(60),
    ...lines,
  ].join('\n');

  const makeFile = () => new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), { name: `transcript-${channel.name}.txt` });

  if (logChannelId) {
    const logCh = interaction.guild.channels.cache.get(logChannelId);
    if (logCh) {
      const logEmbed = new EmbedBuilder()
        .setTitle('📄 Ticket Transcript')
        .setDescription(`Channel: <#${channel.id}>\nExported by: <@${interaction.user.id}>`)
        .setColor(0x3498db)
        .setTimestamp();
      await logCh.send({ embeds: [logEmbed], files: [makeFile()] }).catch(() => {});
    }
  }

  await interaction.editReply({ content: '📄 Transcript generated!', files: [makeFile()] });
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function handleTicketDelete(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_delete_confirm').setLabel('Yes, delete it').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  await interaction.reply({
    content: '⚠️ Are you sure you want to **permanently delete** this ticket?',
    components: [row],
    ephemeral: true,
  });
}

async function handleTicketDeleteConfirm(interaction) {
  const channel  = interaction.channel;
  const ownerId  = getOwnerByChannel(channel.id);
  if (ownerId) removeTicket(ownerId);
  await interaction.reply({ content: '🗑 Deleting ticket...', ephemeral: true });
  setTimeout(() => channel.delete().catch(() => {}), 2000);
}

async function handleTicketDeleteCancel(interaction) {
  await interaction.reply({ content: '✅ Deletion cancelled.', ephemeral: true });
}

module.exports = {
  handleTicketSelect,
  handleTicketClose,
  handleTicketClaim,
  handleTicketTranscript,
  handleTicketDelete,
  handleTicketDeleteConfirm,
  handleTicketDeleteCancel,
};
