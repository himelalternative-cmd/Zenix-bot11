const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { getBalance, removeBalance } = require('../utils/zenixPoints');
const { getGuildSettings, saveGuildSettings, getSettings, generateOrderId } = require('../utils/settings');
const { logPurchase } = require('../utils/stockHistory');
const { getPendingOrder, setPendingOrder, removePendingOrder } = require('../utils/pendingOrders');
const { getOwnerByChannel } = require('../utils/tickets');

const ZP_PER_ROBUX     = 0.9;   // !buy robux: 1 Robux = 0.9 ZP
const ZP_PER_ROBUX_IGG = 0.75;  // !igg: 1 Robux = 0.75 ZP

// ═══════════════════════════════════════════════════════════════════════════
//  !buy robux / !buy rbx / !buy rb — any member, ticket or bot-cmd only
// ═══════════════════════════════════════════════════════════════════════════

// ── Send the order embed with a button ──────────────────────────────────────
async function handleBuyRobuxCommand(message) {
  const settings = getGuildSettings(message.guild.id);

  const isTicket = !!getOwnerByChannel(message.channel.id);
  const isBotCmd = settings.botCmdChannelId === message.channel.id;

  if (!isTicket && !isBotCmd) {
    const reply = await message.reply({
      content:
        '❌ This command can only be used inside a **ticket** or the configured **bot commands channel**.\n' +
        '_Ask an admin to set one with `/set botcmd channel`._',
    });
    setTimeout(() => reply.delete().catch(() => {}), 8000);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Robux Purchase')
    .setDescription(
      'Click the button below to fill the order form.\n\n' +
      '> 💎 **Rate:** 1 Robux = **0.9 ZP**\n\n' +
      '_You may only have one pending order at a time._'
    )
    .setColor(0x000000)
    .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() ?? undefined })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rbx_buy_btn')
      .setLabel('Fill Order Form')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({ embeds: [embed], components: [row] });
  await message.delete().catch(() => {});
}

// ── Button clicked → check duplicate → show modal ───────────────────────────
async function handleBuyRobuxButton(interaction) {
  const existing = getPendingOrder(interaction.user.id);
  if (existing) {
    return interaction.reply({
      content:
        '❌ You already have a **pending Robux order**. ' +
        'Please wait for it to be confirmed by an admin before submitting a new one.',
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('rbx_order_modal')
    .setTitle('Robux Order Form');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('roblox_username')
        .setLabel('Roblox Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your Roblox username')
        .setRequired(true)
        .setMaxLength(20)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('robux_amount')
        .setLabel('How much Robux do you want to buy?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 100')
        .setRequired(true)
        .setMaxLength(8)
    ),
  );

  await interaction.showModal(modal);
}

// ── Modal submitted → validate → deduct ZP → post to pending channel ─────────
async function handleBuyRobuxModal(interaction) {
  const robloxUsername = interaction.fields.getTextInputValue('roblox_username').trim();
  const robuxRaw       = interaction.fields.getTextInputValue('robux_amount').trim();

  const robuxAmount = parseInt(robuxRaw, 10);
  if (isNaN(robuxAmount) || robuxAmount <= 0) {
    return interaction.reply({
      content: '❌ Please enter a valid Robux amount (whole number greater than 0).',
      ephemeral: true,
    });
  }

  const zpCost  = Math.ceil(robuxAmount * ZP_PER_ROBUX);
  const userId  = interaction.user.id;
  const balance = getBalance(userId);

  // Double-check duplicate (race-condition guard)
  if (getPendingOrder(userId)) {
    return interaction.reply({
      content: '❌ You already have a pending Robux order. Please wait for it to be confirmed.',
      ephemeral: true,
    });
  }

  if (balance < zpCost) {
    const needed = zpCost - balance;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Insufficient Zenix Points')
          .setColor(0xe74c3c)
          .addFields(
            { name: '🎮 Robux Amount', value: `**${robuxAmount.toLocaleString()}**`,    inline: true },
            { name: '💲 ZP Cost',      value: `**${zpCost.toLocaleString()} ZP**`,      inline: true },
            { name: '💎 Your Balance', value: `**${balance.toLocaleString()} ZP**`,     inline: true },
            { name: '⚠️ Still Needed', value: `**${needed.toLocaleString()} ZP**`,      inline: true },
          )
          .setFooter({ text: 'Powered by Zenix Realm' })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  // Deduct ZP
  const newBalance = removeBalance(userId, zpCost);

  // Determine source (ticket vs bot-cmd)
  const isTicket        = !!getOwnerByChannel(interaction.channelId);
  const sourceType      = isTicket ? 'ticket' : 'botcmd';
  const sourceChannelId = interaction.channelId;
  const timestamp       = Math.floor(Date.now() / 1000);

  // Save pending order
  setPendingOrder(userId, {
    userId,
    guildId: interaction.guildId,
    robloxUsername,
    robuxAmount,
    zpCost,
    sourceChannelId,
    sourceType,
    timestamp,
  });

  // Ephemeral confirmation
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Order Submitted!')
        .setDescription(
          `**${zpCost.toLocaleString()} ZP** has been deducted from your balance.\n` +
          `💎 **Remaining Balance:** ${newBalance.toLocaleString()} ZP\n\n` +
          `An admin will confirm your order shortly.`
        )
        .setColor(0x2ecc71)
        .setTimestamp(),
    ],
    ephemeral: true,
  });

  // Info embed in the source channel (no confirm button — view only)
  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🎮 Robux Order Submitted — Awaiting Confirmation')
        .setDescription('An admin will review and confirm this order shortly.')
        .setColor(0xf39c12)
        .addFields(
          { name: '👤 Buyer',           value: `<@${userId}>`,                              inline: true },
          { name: '🎮 Roblox Username', value: `\`${robloxUsername}\``,                     inline: true },
          { name: '💫 Robux Amount',    value: `**${robuxAmount.toLocaleString()} Robux**`, inline: true },
          { name: '💎 ZP Paid',         value: `**${zpCost.toLocaleString()} ZP**`,         inline: true },
        )
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp(),
    ],
  });

  // Post to private pending channel with Confirm button
  const settings      = getGuildSettings(interaction.guildId);
  const pendingChanId = settings.pendingChannelId;
  if (!pendingChanId) return;

  const pendingChannel = interaction.guild.channels.cache.get(pendingChanId);
  if (!pendingChannel) return;

  const sourceLabel = sourceType === 'ticket'
    ? `<#${sourceChannelId}> (Ticket)`
    : `<#${sourceChannelId}> (Bot CMD)`;

  await pendingChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('📋 Pending Robux Order')
        .setDescription('A new Robux order is waiting for confirmation.')
        .setColor(0xe67e22)
        .addFields(
          { name: '👤 Buyer',           value: `<@${userId}>`,                              inline: true },
          { name: '🎮 Roblox Username', value: `\`${robloxUsername}\``,                     inline: true },
          { name: '💫 Robux Amount',    value: `**${robuxAmount.toLocaleString()} Robux**`, inline: true },
          { name: '💎 ZP Paid',         value: `**${zpCost.toLocaleString()} ZP**`,         inline: true },
          { name: '📍 Source',          value: sourceLabel,                                  inline: true },
          { name: '⏰ Submitted',       value: `<t:${timestamp}:R>`,                        inline: true },
        )
        .setFooter({ text: 'Only admins can confirm orders here.' })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rbx_confirm:${userId}`)
          .setLabel('Confirm Order')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
      ),
    ],
  });
}

// ── Admin confirms order from the pending channel ────────────────────────────
async function handleRbxConfirm(interaction) {
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    interaction.member.id !== interaction.guild.ownerId
  ) {
    return interaction.reply({ content: '❌ Only administrators can confirm orders.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];
  const order   = getPendingOrder(buyerId);

  if (!order) {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rbx_confirm_disabled')
        .setLabel('Already Processed')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    return interaction.update({ embeds: interaction.message.embeds, components: [disabledRow] });
  }

  const { guildId, robloxUsername, robuxAmount, zpCost, sourceChannelId, sourceType } = order;
  const settings  = getGuildSettings(guildId);
  const orderId   = generateOrderId(settings.orderIdPrefix || 'ORDER');
  const now       = Math.floor(Date.now() / 1000);
  const orderColor = settings.orderColor ?? 0x010101;

  const orderLines =
    `• Handler : Robux Buy\n` +
    `• Buyer : <@${buyerId}>\n` +
    `• Roblox User : \`${robloxUsername}\`\n` +
    `• Robux : ${robuxAmount.toLocaleString()} Robux\n` +
    `• ZP Paid : ${zpCost.toLocaleString()} ZP\n` +
    `• Completed by : <@${interaction.user.id}>\n` +
    `• Order id : ${orderId}\n` +
    `• Time : <t:${now}:R>`;

  const completionEmbed = new EmbedBuilder()
    .setTitle(settings.orderTitle || '▶ Order Details:')
    .setDescription(orderLines)
    .setColor(orderColor)
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();

  // Post to order log channel
  if (settings.orderChannelId) {
    const logChannel = interaction.guild.channels.cache.get(settings.orderChannelId);
    if (logChannel) await logChannel.send({ embeds: [completionEmbed] }).catch(() => {});
  }

  // Log to spent leaderboard
  logPurchase(guildId, {
    userId:    buyerId,
    username:  robloxUsername,
    item:      `${robuxAmount.toLocaleString()} Robux (buy robux)`,
    amount:    robuxAmount,
    totalCost: zpCost,
    timestamp: new Date().toISOString(),
  });

  // Update order count + bot status
  settings.orderCount = (settings.orderCount || 0) + 1;
  saveGuildSettings(guildId, settings);
  const allSettings = getSettings();
  let totalOrders = 0;
  for (const gid of Object.keys(allSettings)) totalOrders += (allSettings[gid].orderCount || 0);
  interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });

  // Remove pending order
  removePendingOrder(buyerId);

  // Buyer notification embed
  const buyerEmbed = new EmbedBuilder()
    .setTitle('✅ Your Robux Order Has Been Confirmed!')
    .setDescription(
      `Your order has been completed.\n\n` +
      `> 🎮 **Roblox Username:** \`${robloxUsername}\`\n` +
      `> 💫 **Robux Amount:** ${robuxAmount.toLocaleString()} Robux\n` +
      `> 🆔 **Order ID:** \`${orderId}\``
    )
    .setColor(0x2ecc71)
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();

  if (sourceType === 'ticket') {
    const ticketChannel = interaction.guild.channels.cache.get(sourceChannelId);
    if (ticketChannel) {
      await ticketChannel.send({ content: `<@${buyerId}>`, embeds: [buyerEmbed] }).catch(() => {});
    }
  } else {
    try {
      const buyer = await interaction.client.users.fetch(buyerId);
      await buyer.send({ embeds: [buyerEmbed] });
    } catch {}
  }

  // Disable confirm button — PRESERVE EMBEDS to prevent the "message deleted" visual
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rbx_confirm_disabled')
      .setLabel('Order Confirmed')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );
  await interaction.update({ embeds: interaction.message.embeds, components: [disabledRow] });
}

// ═══════════════════════════════════════════════════════════════════════════
//  !igg  —  In-Game Gifting System  (1 Robux = 0.75 ZP)
// ═══════════════════════════════════════════════════════════════════════════

async function handleIggCommand(message) {
  if (!message.member || !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply({ content: '❌ You need **Administrator** permission to use this command.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('🎁 In-Game Gifting')
    .setDescription(
      'Fill this form to order **In-Game Gifting**.\n\n' +
      '> 💎 **Rate:** 1 Robux = **0.75 ZP**\n\n' +
      'Click the button below to place your order.'
    )
    .setColor(0x000000)
    .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() ?? undefined })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('igg_buy_btn')
      .setLabel('Order Gifting')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({ embeds: [embed], components: [row] });
  await message.delete().catch(() => {});
}

async function handleIggBuyButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('igg_order_modal')
    .setTitle('In-Game Gifting Order');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('roblox_username')
        .setLabel('Whats your Roblox Username?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Builderman')
        .setRequired(true)
        .setMaxLength(20)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('gamepass_price')
        .setLabel('Gamepass Price? (in Robux)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 400')
        .setRequired(true)
        .setMaxLength(10)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('game_name')
        .setLabel('Game name in Roblox?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Blox Fruits, Steal a Brainrot')
        .setRequired(true)
        .setMaxLength(80)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('gifting_type')
        .setLabel('Global Gifting or Same Server?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Global Gifting / Same Server')
        .setRequired(true)
        .setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('gamepass_name')
        .setLabel('Which gamepass do you want to buy?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Gamepass 1, Gamepass 2, Gamepass 3')
        .setRequired(true)
        .setMaxLength(100)
    ),
  );

  await interaction.showModal(modal);
}

async function handleIggOrderModal(interaction) {
  const robloxUsername = interaction.fields.getTextInputValue('roblox_username').trim();
  const gamepassRaw    = interaction.fields.getTextInputValue('gamepass_price').trim();
  const gameName       = interaction.fields.getTextInputValue('game_name').trim();
  const giftingType    = interaction.fields.getTextInputValue('gifting_type').trim();
  const gamepassName   = interaction.fields.getTextInputValue('gamepass_name').trim();

  const gamepassPrice = parseInt(gamepassRaw, 10);
  if (isNaN(gamepassPrice) || gamepassPrice <= 0) {
    return interaction.reply({
      content: '❌ Please enter a valid Gamepass price (whole number greater than 0).',
      ephemeral: true,
    });
  }

  const zpCost  = Math.ceil(gamepassPrice * ZP_PER_ROBUX_IGG);
  const userId  = interaction.user.id;
  const balance = getBalance(userId);

  if (balance < zpCost) {
    const needed = zpCost - balance;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Insufficient Zenix Points')
          .setColor(0xe74c3c)
          .addFields(
            { name: '🎁 Gamepass Price',  value: `**${gamepassPrice.toLocaleString()} Robux**`, inline: true },
            { name: '💲 ZP Cost',         value: `**${zpCost.toLocaleString()} ZP**`,           inline: true },
            { name: '💎 Your Balance',    value: `**${balance.toLocaleString()} ZP**`,          inline: true },
            { name: '⚠️ Still Needed',   value: `**${needed.toLocaleString()} ZP**`,            inline: true },
          )
          .setFooter({ text: 'Powered by Zenix Realm' })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  const newBalance = removeBalance(userId, zpCost);
  const timestamp  = Math.floor(Date.now() / 1000);

  const doneId = `igg_done:${userId}`;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Order Placed!')
        .setDescription(
          `**${zpCost.toLocaleString()} ZP** has been deducted from your balance.\n` +
          `💎 **Remaining Balance:** ${newBalance.toLocaleString()} ZP`
        )
        .setColor(0x2ecc71)
        .setTimestamp(),
    ],
    ephemeral: true,
  });

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🎁 In-Game Gifting Order Placed')
        .setDescription(
          `Your IGG order has been placed. Wait for an admin to complete it.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setColor(0x000000)
        .addFields(
          { name: '👤 Buyer',            value: `<@${userId}>`,                                    inline: true },
          { name: '🎮 Roblox Username',  value: `\`${robloxUsername}\``,                           inline: true },
          { name: '💲 Gamepass Price',   value: `**${gamepassPrice.toLocaleString()} Robux**`,     inline: true },
          { name: '🎮 Game Name',        value: `\`${gameName}\``,                                 inline: true },
          { name: '🎫 Gamepass Name',    value: `\`${gamepassName}\``,                             inline: true },
          { name: '🌐 Gifting Type',     value: `\`${giftingType}\``,                              inline: true },
          { name: '💎 ZP Paid',          value: `**${zpCost.toLocaleString()} ZP**`,               inline: true },
        )
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(doneId)
          .setLabel('Done Order')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
      ),
    ],
  });
}

async function handleIggDone(interaction) {
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    interaction.member.id !== interaction.guild.ownerId
  ) {
    return interaction.reply({ content: '❌ Only administrators can complete orders.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];

  // Read order details from embed fields
  const embed  = interaction.message.embeds[0];
  const field  = name => embed?.fields?.find(f => f.name.includes(name))?.value ?? '?';

  const robloxUsername = field('Roblox Username').replace(/`/g, '');
  const gamepassPrice  = field('Gamepass Price').replace(/\*\*/g, '').replace(' Robux', '').trim();
  const gameName       = field('Game Name').replace(/`/g, '');
  const gamepassName   = field('Gamepass Name').replace(/`/g, '');
  const giftingType    = field('Gifting Type').replace(/`/g, '');
  const zpPaid         = field('ZP Paid').replace(/\*\*/g, '');

  const settings    = getGuildSettings(interaction.guildId);
  const orderChanId = settings.orderChannelId;

  if (orderChanId) {
    const orderChannel = interaction.guild.channels.cache.get(orderChanId);
    if (orderChannel) {
      const orderId    = generateOrderId(settings.orderIdPrefix || 'ORDER');
      const now        = Math.floor(Date.now() / 1000);
      const orderColor = settings.orderColor ?? 0x010101;

      const orderLines =
        `• Handler : In-Game Gifting\n` +
        `• Buyer : <@${buyerId}>\n` +
        `• Roblox User : \`${robloxUsername}\`\n` +
        `• Gamepass Price : ${gamepassPrice} Robux\n` +
        `• Game : \`${gameName}\`\n` +
        `• Gamepass : \`${gamepassName}\`\n` +
        `• Gifting Type : \`${giftingType}\`\n` +
        `• ZP Paid : ${zpPaid}\n` +
        `• Completed by : <@${interaction.user.id}>\n` +
        `• Order id : ${orderId}\n` +
        `• Time : <t:${now}:R>`;

      await orderChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(settings.orderTitle || '▶ Order Details:')
            .setDescription(orderLines)
            .setColor(orderColor)
            .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
            .setTimestamp(),
        ],
      }).catch(() => {});

      // Log to spent leaderboard
      const zpPaidNum = parseInt(zpPaid.replace(/[^0-9]/g, ''), 10) || 0;
      logPurchase(interaction.guildId, {
        userId:    buyerId,
        username:  robloxUsername,
        item:      `${gamepassName} in ${gameName} (igg)`,
        amount:    parseInt(gamepassPrice) || 0,
        totalCost: zpPaidNum,
        timestamp: new Date().toISOString(),
      });

      settings.orderCount = (settings.orderCount || 0) + 1;
      saveGuildSettings(interaction.guildId, settings);
      const allSettings = getSettings();
      let totalOrders = 0;
      for (const gid of Object.keys(allSettings)) totalOrders += (allSettings[gid].orderCount || 0);
      interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });
    }
  }

  // Disable Done button — PRESERVE EMBEDS to prevent message appearing deleted
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('igg_done_disabled')
      .setLabel('Order Completed')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );

  await interaction.update({ embeds: interaction.message.embeds, components: [disabledRow] });
}

module.exports = {
  handleBuyRobuxCommand,
  handleBuyRobuxButton,
  handleBuyRobuxModal,
  handleRbxConfirm,
  handleIggCommand,
  handleIggBuyButton,
  handleIggOrderModal,
  handleIggDone,
};
