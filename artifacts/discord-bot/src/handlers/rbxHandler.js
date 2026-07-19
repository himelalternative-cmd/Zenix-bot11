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

const ZP_PER_ROBUX = 0.9; // 1 Robux = 0.9 ZP

// ── !rbxacc — admin sends the Robux purchase embed ───────────────────────────
async function handleRbxAccCommand(message) {
  if (!message.member || !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply({ content: '❌ You need **Administrator** permission to use this command.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Robux Purchase')
    .setDescription(
      'Fill this form to buy **Robux**.\n\n' +
      '> 💎 **Rate:** 1 Robux = **0.9 ZP**\n\n' +
      'Click the button below to place your order.'
    )
    .setColor(0x000000)
    .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() ?? undefined })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rbx_buy_btn')
      .setLabel('Buy Robux')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({ embeds: [embed], components: [row] });

  // Delete the command message to keep the channel clean
  await message.delete().catch(() => {});
}

// ── "Buy Robux" button — open modal ─────────────────────────────────────────
async function handleRbxBuyButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('rbx_order_modal')
    .setTitle('Robux Order Form');

  const usernameInput = new TextInputBuilder()
    .setCustomId('roblox_username')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter your Roblox username')
    .setRequired(true)
    .setMaxLength(20);

  const amountInput = new TextInputBuilder()
    .setCustomId('robux_amount')
    .setLabel('How much Robux do you want to buy?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100')
    .setRequired(true)
    .setMaxLength(8);

  modal.addComponents(
    new ActionRowBuilder().addComponents(usernameInput),
    new ActionRowBuilder().addComponents(amountInput),
  );

  await interaction.showModal(modal);
}

// ── Modal submitted — deduct ZP and post order confirmation ──────────────────
async function handleRbxOrderModal(interaction) {
  const robloxUsername = interaction.fields.getTextInputValue('roblox_username').trim();
  const robuxRaw       = interaction.fields.getTextInputValue('robux_amount').trim();

  // Validate amount
  const robuxAmount = parseInt(robuxRaw, 10);
  if (isNaN(robuxAmount) || robuxAmount <= 0) {
    return interaction.reply({
      content: '❌ Please enter a valid Robux amount (whole number greater than 0).',
      ephemeral: true,
    });
  }

  const zpCost     = Math.ceil(robuxAmount * ZP_PER_ROBUX);
  const userId     = interaction.user.id;
  const balance    = getBalance(userId);

  // Check balance
  if (balance < zpCost) {
    const needed = zpCost - balance;
    const embed  = new EmbedBuilder()
      .setTitle('❌ Insufficient Zenix Points')
      .setColor(0xe74c3c)
      .addFields(
        { name: '🎮 Robux Amount', value: `**${robuxAmount.toLocaleString()}**`,       inline: true },
        { name: '💲 ZP Cost',      value: `**${zpCost.toLocaleString()} ZP**`,         inline: true },
        { name: '💎 Your Balance', value: `**${balance.toLocaleString()} ZP**`,        inline: true },
        { name: '⚠️ Still Needed', value: `**${needed.toLocaleString()} ZP**`,         inline: true },
      )
      .setFooter({ text: 'Powered by Zenix Realm' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Deduct ZP
  const newBalance  = removeBalance(userId, zpCost);
  const timestamp   = Math.floor(Date.now() / 1000);

  // Encode data into customId for the Done Order button (max 100 chars total)
  const encodedUser = encodeURIComponent(robloxUsername);
  const doneId = `rbx_done:${userId}:${encodedUser}:${robuxAmount}:${zpCost}:${timestamp}`;

  // Ephemeral confirmation to buyer
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Order Placed!')
    .setDescription(
      `**${zpCost.toLocaleString()} ZP** has been deducted from your balance.\n` +
      `💎 **Remaining Balance:** ${newBalance.toLocaleString()} ZP`
    )
    .setColor(0x2ecc71)
    .setTimestamp();
  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  // Public order confirmation embed in the channel
  const orderEmbed = new EmbedBuilder()
    .setTitle('🎮 Robux Order Placed Successfully')
    .setDescription(
      `Your Robux Order is Placed Successfully.\n` +
      `Wait for an admin or owner to Complete Your Order.\n` +
      `Thanks.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x000000)
    .addFields(
      { name: '👤 Buyer',           value: `<@${userId}>`,                             inline: true },
      { name: '🎮 Roblox Username', value: `\`${robloxUsername}\``,                    inline: true },
      { name: '💫 Robux Amount',    value: `**${robuxAmount.toLocaleString()} Robux**`, inline: true },
      { name: '💎 ZP Paid',         value: `**${zpCost.toLocaleString()} ZP**`,        inline: true },
    )
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();

  const doneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(doneId)
      .setLabel('Done Order')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({ embeds: [orderEmbed], components: [doneRow] });
}

// ── "Done Order" button — post to order channel ──────────────────────────────
async function handleRbxDone(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      interaction.member.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: '❌ Only administrators can complete orders.', ephemeral: true });
  }

  // Parse customId: rbx_done:<userId>:<encodedUsername>:<robuxAmt>:<zpCost>:<timestamp>
  const parts          = interaction.customId.split(':');
  const buyerId        = parts[1];
  const robloxUsername = decodeURIComponent(parts[2] ?? '');
  const robuxAmount    = parts[3] ?? '?';
  const zpCost         = parts[4] ?? '?';
  const submittedAt    = parts[5] ? parseInt(parts[5], 10) : null;

  const settings    = getGuildSettings(interaction.guildId);
  const orderChanId = settings.orderChannelId;

  // Post to order channel if configured
  if (orderChanId) {
    const orderChannel = interaction.guild.channels.cache.get(orderChanId);
    if (orderChannel) {
      const orderId    = generateOrderId(settings.orderIdPrefix || 'ORDER');
      const now        = Math.floor(Date.now() / 1000);
      const orderColor = settings.orderColor ?? 0x010101;

      const orderLines =
        `• Handler : Robux Buy\n` +
        `• Buyer : <@${buyerId}>\n` +
        `• Roblox User : \`${robloxUsername}\`\n` +
        `• Robux : ${parseInt(robuxAmount).toLocaleString()} Robux\n` +
        `• ZP Paid : ${parseInt(zpCost).toLocaleString()} ZP\n` +
        `• Completed by : <@${interaction.user.id}>\n` +
        `• Order id : ${orderId}\n` +
        `• Time : <t:${now}:R>`;

      const orderEmbed = new EmbedBuilder()
        .setTitle(settings.orderTitle || '▶ Order Details:')
        .setDescription(orderLines)
        .setColor(orderColor)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp();

      await orderChannel.send({ embeds: [orderEmbed] }).catch(() => {});

      // Update order count + bot status
      settings.orderCount = (settings.orderCount || 0) + 1;
      saveGuildSettings(interaction.guildId, settings);
      const allSettings = getSettings();
      let totalOrders = 0;
      for (const gid of Object.keys(allSettings)) totalOrders += (allSettings[gid].orderCount || 0);
      interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });
    }
  }

  // Disable the Done Order button on the original message
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rbx_done_disabled')
      .setLabel('Order Completed')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );

  await interaction.update({ components: [disabledRow] });
}

// ════════════════════════════════════════════════════════════════════════════
// !igg  —  In-Game Gifting System  (1 Robux = 0.75 ZP)
// ════════════════════════════════════════════════════════════════════════════

const ZP_PER_ROBUX_IGG = 0.75;

// ── !igg — admin sends the In-Game Gifting embed ─────────────────────────────
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

// ── "Order Gifting" button — open modal ──────────────────────────────────────
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

// ── IGG modal submitted ───────────────────────────────────────────────────────
async function handleIggOrderModal(interaction) {
  const robloxUsername = interaction.fields.getTextInputValue('roblox_username').trim();
  const gamepassRaw    = interaction.fields.getTextInputValue('gamepass_price').trim();
  const gameName       = interaction.fields.getTextInputValue('game_name').trim();
  const giftingType    = interaction.fields.getTextInputValue('gifting_type').trim();
  const gamepassName   = interaction.fields.getTextInputValue('gamepass_name').trim();

  // Parse gamepass price — allow "400 robux", "400 R$", plain "400"
  const priceMatch = gamepassRaw.match(/(\d+(?:\.\d+)?)/);
  if (!priceMatch) {
    return interaction.reply({ content: '❌ Invalid gamepass price. Please enter a number (e.g. `400`).', ephemeral: true });
  }
  const gamepassPrice = Math.round(parseFloat(priceMatch[1]));
  if (gamepassPrice <= 0) {
    return interaction.reply({ content: '❌ Gamepass price must be greater than 0.', ephemeral: true });
  }

  const zpCost     = Math.ceil(gamepassPrice * ZP_PER_ROBUX_IGG);
  const userId     = interaction.user.id;
  const balance    = getBalance(userId);

  if (balance < zpCost) {
    const needed = zpCost - balance;
    const embed  = new EmbedBuilder()
      .setTitle('❌ Insufficient Zenix Points')
      .setColor(0xe74c3c)
      .addFields(
        { name: '🎁 Gamepass Price', value: `**${gamepassPrice.toLocaleString()} Robux**`, inline: true },
        { name: '💲 ZP Cost',        value: `**${zpCost.toLocaleString()} ZP**`,           inline: true },
        { name: '💎 Your Balance',   value: `**${balance.toLocaleString()} ZP**`,          inline: true },
        { name: '⚠️ Still Needed',  value: `**${needed.toLocaleString()} ZP**`,            inline: true },
      )
      .setFooter({ text: 'Powered by Zenix Realm' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const newBalance = removeBalance(userId, zpCost);
  const timestamp  = Math.floor(Date.now() / 1000);

  // Ephemeral confirmation
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Order Placed!')
    .setDescription(
      `**${zpCost.toLocaleString()} ZP** has been deducted from your balance.\n` +
      `💎 **Remaining Balance:** ${newBalance.toLocaleString()} ZP`
    )
    .setColor(0x2ecc71)
    .setTimestamp();
  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  // Public order embed — data is stored in the embed fields so the Done button
  // can read them back without hitting the 100-char customId limit.
  const orderEmbed = new EmbedBuilder()
    .setTitle('🎁 In-Game Gifting Order Placed Successfully')
    .setDescription(
      `Your In-Game Gifting Order is Placed Successfully.\n` +
      `Wait for an admin or owner to Complete Your Order.\n` +
      `Thanks.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x000000)
    .addFields(
      { name: '👤 Buyer',             value: `<@${userId}>`,                               inline: true },
      { name: '🎮 Roblox Username',   value: `\`${robloxUsername}\``,                      inline: true },
      { name: '🎁 Gamepass Price',    value: `**${gamepassPrice.toLocaleString()} Robux**`, inline: true },
      { name: '🕹️ Game Name',        value: `\`${gameName}\``,                             inline: true },
      { name: '🎟️ Gamepass Name',    value: `\`${gamepassName}\``,                         inline: true },
      { name: '🌐 Gifting Type',      value: `\`${giftingType}\``,                         inline: true },
      { name: '💎 ZP Paid',           value: `**${zpCost.toLocaleString()} ZP**`,          inline: true },
    )
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();

  // customId only carries userId + timestamp (game name can be long)
  const doneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`igg_done:${userId}:${timestamp}`)
      .setLabel('Done Order')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({ embeds: [orderEmbed], components: [doneRow] });
}

// ── "Done Order" (IGG) — read fields from embed, post to order channel ────────
async function handleIggDone(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      interaction.member.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: '❌ Only administrators can complete orders.', ephemeral: true });
  }

  const parts    = interaction.customId.split(':');
  const buyerId  = parts[1];

  // Read order details from the embed fields on the message
  const embed  = interaction.message.embeds[0];
  const field  = name => embed?.fields?.find(f => f.name.includes(name))?.value ?? '?';

  const robloxUsername = field('Roblox Username').replace(/`/g, '');
  const gamepassPrice  = field('Gamepass Price').replace(/\*\*/g, '');
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
        `• Gamepass Price : ${gamepassPrice}\n` +
        `• Game : \`${gameName}\`\n` +
        `• Gamepass : \`${gamepassName}\`\n` +
        `• Gifting Type : \`${giftingType}\`\n` +
        `• ZP Paid : ${zpPaid}\n` +
        `• Completed by : <@${interaction.user.id}>\n` +
        `• Order id : ${orderId}\n` +
        `• Time : <t:${now}:R>`;

      const orderEmbed = new EmbedBuilder()
        .setTitle(settings.orderTitle || '▶ Order Details:')
        .setDescription(orderLines)
        .setColor(orderColor)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp();

      await orderChannel.send({ embeds: [orderEmbed] }).catch(() => {});

      settings.orderCount = (settings.orderCount || 0) + 1;
      saveGuildSettings(interaction.guildId, settings);
      const allSettings = getSettings();
      let totalOrders = 0;
      for (const gid of Object.keys(allSettings)) totalOrders += (allSettings[gid].orderCount || 0);
      interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });
    }
  }

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('igg_done_disabled')
      .setLabel('Order Completed')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );

  await interaction.update({ components: [disabledRow] });
}

module.exports = { handleRbxAccCommand, handleRbxBuyButton, handleRbxOrderModal, handleRbxDone, handleIggCommand, handleIggBuyButton, handleIggOrderModal, handleIggDone };
