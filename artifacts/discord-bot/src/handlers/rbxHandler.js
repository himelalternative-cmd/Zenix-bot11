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
const { getOwnerByChannel } = require('../utils/tickets');

const ZP_PER_ROBUX     = 0.9;   // !buy robux: 1 Robux = 0.9 ZP
const ZP_PER_ROBUX_IGG = 0.75;  // !igg: 1 Robux = 0.75 ZP

function getPendingChannel(guild, settings) {
  if (!settings.pendingChannelId) return null;

  const channel = guild.channels.cache.get(settings.pendingChannelId);
  if (!channel || typeof channel.send !== 'function') return null;
  return channel;
}

function isPendingChannel(interaction, settings) {
  return Boolean(settings.pendingChannelId && interaction.channelId === settings.pendingChannelId);
}

function getOrderChannel(guild, settings) {
  if (!settings.orderChannelId) return null;

  const channel = guild.channels.cache.get(settings.orderChannelId);
  if (!channel || typeof channel.send !== 'function') return null;
  return channel;
}

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
      '> 💎 **Rate:** 1 Robux = **0.9 ZP**'
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

// ── Button clicked → show modal ─────────────────────────────────────────────
async function handleBuyRobuxButton(interaction) {
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

// ── Modal submitted → validate → deduct ZP → show in source + pending channels ──
async function handleBuyRobuxModal(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  const pendingChannel = getPendingChannel(interaction.guild, settings);
  if (!pendingChannel) {
    return interaction.reply({
      content:
        '❌ Pending orders channel is not configured or is unavailable. ' +
        'Please ask an administrator to run `/set pending channel`.',
      ephemeral: true,
    });
  }

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
  const doneId     = `rbx_done:${userId}`;

  // Ephemeral confirmation
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

  const orderEmbed = new EmbedBuilder()
    .setTitle('🎮 Robux Order Placed')
    .setDescription(
      `Your order has been placed. Wait for an admin to complete it.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x000000)
    .addFields(
      { name: '👤 Buyer',           value: `<@${userId}>`,                              inline: true },
      { name: '🎮 Roblox Username', value: `\`${robloxUsername}\``,                     inline: true },
      { name: '💫 Robux Amount',    value: `**${robuxAmount.toLocaleString()} Robux**`, inline: true },
      { name: '💎 ZP Paid',         value: `**${zpCost.toLocaleString()} ZP**`,         inline: true },
    )
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();

  // Show the filled form in the channel where the customer started it,
  // without a completion button.
  await interaction.channel.send({ embeds: [orderEmbed] });

  // Staff process the only actionable copy in the pending-orders channel.
  await pendingChannel.send({
    embeds: [orderEmbed],
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

// ── Admin clicks Done Order ───────────────────────────────────────────────────
async function handleRbxDone(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  if (!isPendingChannel(interaction, settings)) {
    return interaction.reply({
      content: '❌ Orders can only be completed from the configured pending orders channel.',
      ephemeral: true,
    });
  }

  const orderChannel = getOrderChannel(interaction.guild, settings);
  if (!orderChannel) {
    return interaction.reply({
      content: '❌ Orders channel is not configured or is unavailable. Configure it with `/set order channel` first.',
      ephemeral: true,
    });
  }

  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    interaction.member.id !== interaction.guild.ownerId
  ) {
    return interaction.reply({ content: '❌ Only administrators can complete orders.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];

  // Read order details from embed fields
  const embed = interaction.message.embeds[0];
  const field = name => embed?.fields?.find(f => f.name.includes(name))?.value ?? '?';

  const robloxUsername = field('Roblox Username').replace(/`/g, '');
  const robuxAmountStr = field('Robux Amount').replace(/\*\*/g, '').replace(' Robux', '').replace(/,/g, '').trim();
  const zpPaid         = field('ZP Paid').replace(/\*\*/g, '');

  const robuxAmount = parseInt(robuxAmountStr, 10) || 0;
  const zpPaidNum   = parseInt(zpPaid.replace(/[^0-9]/g, ''), 10) || 0;

  const orderId    = generateOrderId(settings.orderIdPrefix || 'ORDER');
  const now        = Math.floor(Date.now() / 1000);
  const orderColor = settings.orderColor ?? 0x010101;

  const orderLines =
    `• Handler : Robux Buy\n` +
    `• Buyer : <@${buyerId}>\n` +
    `• Roblox User : \`${robloxUsername}\`\n` +
    `• Robux : ${robuxAmount.toLocaleString()} Robux\n` +
    `• ZP Paid : ${zpPaidNum.toLocaleString()} ZP\n` +
    `• Completed by : <@${interaction.user.id}>\n` +
    `• Order id : ${orderId}\n` +
    `• Time : <t:${now}:R>`;

  try {
    await orderChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(settings.orderTitle || '▶ Order Details:')
          .setDescription(orderLines)
          .setColor(orderColor)
          .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    console.error('[rbx] Failed to post completed order:', err.message);
    return interaction.reply({
      content: '❌ I could not post the completed order to the configured orders channel. Check the bot permissions and try again.',
      ephemeral: true,
    });
  }

  // Log to spent leaderboard
  logPurchase(interaction.guildId, {
    userId:    buyerId,
    username:  robloxUsername,
    item:      `${robuxAmount.toLocaleString()} Robux (buy robux)`,
    amount:    robuxAmount,
    totalCost: zpPaidNum,
    timestamp: new Date().toISOString(),
  });

  // Update order count + bot status
  settings.orderCount = (settings.orderCount || 0) + 1;
  saveGuildSettings(interaction.guildId, settings);
  const allSettings = getSettings();
  let totalOrders = 0;
  for (const gid of Object.keys(allSettings)) totalOrders += (allSettings[gid].orderCount || 0);
  interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });

  // Disable Done button — preserve embed
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rbx_done_disabled')
      .setLabel('Order Completed')
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
  const settings = getGuildSettings(interaction.guildId);
  const pendingChannel = getPendingChannel(interaction.guild, settings);
  if (!pendingChannel) {
    return interaction.reply({
      content:
        '❌ Pending orders channel is not configured or is unavailable. ' +
        'Please ask an administrator to run `/set pending channel`.',
      ephemeral: true,
    });
  }

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

  const orderEmbed = new EmbedBuilder()
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
    .setTimestamp();

  // Show the filled form in the channel where the customer started it,
  // without a completion button.
  await interaction.channel.send({ embeds: [orderEmbed] });

  // Staff process the only actionable copy in the pending-orders channel.
  await pendingChannel.send({
    embeds: [orderEmbed],
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
  const settings = getGuildSettings(interaction.guildId);
  if (!isPendingChannel(interaction, settings)) {
    return interaction.reply({
      content: '❌ Orders can only be completed from the configured pending orders channel.',
      ephemeral: true,
    });
  }

  const orderChannel = getOrderChannel(interaction.guild, settings);
  if (!orderChannel) {
    return interaction.reply({
      content: '❌ Orders channel is not configured or is unavailable. Configure it with `/set order channel` first.',
      ephemeral: true,
    });
  }

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

  try {
    await orderChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(settings.orderTitle || '▶ Order Details:')
          .setDescription(orderLines)
          .setColor(orderColor)
          .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    console.error('[igg] Failed to post completed order:', err.message);
    return interaction.reply({
      content: '❌ I could not post the completed order to the configured orders channel. Check the bot permissions and try again.',
      ephemeral: true,
    });
  }

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
  handleRbxDone,
  handleIggCommand,
  handleIggBuyButton,
  handleIggOrderModal,
  handleIggDone,
};
