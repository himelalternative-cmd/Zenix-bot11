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
const { addBalance } = require('../utils/zenixPoints');

const completedSubmissions = new Set();

// Parse the raw amount string typed after !pay
// Accepts: 500  |  $500  |  500BDT  |  ৳500  |  500 BDT  |  $500.50
function parseAmount(raw) {
  if (!raw) return null;
  // Strip leading/trailing whitespace, keep everything
  const cleaned = raw.trim();
  // Match an optional currency prefix, a number, and an optional currency suffix
  const m = cleaned.match(/^([^\d]*)(\d+(?:[.,]\d+)?)([^\d]*)$/);
  if (!m) return null;
  const prefix = m[1].trim();   // e.g. "$", "৳", ""
  const num    = m[2].replace(',', '.');
  const suffix = m[3].trim();   // e.g. "BDT", "USD", ""
  const currency = (prefix || suffix || '').toUpperCase() || null;
  return { display: `${prefix}${num}${suffix ? ' ' + suffix : ''}`.trim(), num, currency };
}

// Build the payment methods embed, optionally highlighting the required amount
function buildPaymentEmbed(amountInfo) {
  const amountLine = amountInfo
    ? `\n> 💰 **Amount to Pay: ${amountInfo.display}**\n`
    : '';

  return new EmbedBuilder()
    .setTitle('💳 Payment Methods')
    .setDescription(
      amountLine +
      '**Bkash Send Money:**\n`01621522235`\n\n' +
      '**Bkash Cash In:**\n`01624447830`\n\n' +
      '**Nagad:**\n`01624447830`\n\n' +
      '**Binance Pay:**\n`1207739186`  [$1 = 122 BDT]\n\n' +
      '**UPI:**\n`karansahil827-2@okaxis`\n\n' +
      '━━━━━━━━━━━━━━━━━━'
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Click the button below to submit your payment.' });
}

// !pay [amount] — admin only
async function handlePayCommand(message, amountRaw) {
  if (!message.member || !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply({ content: '❌ You need **Administrator** permission to use this command.' });
  }

  const amountInfo = parseAmount(amountRaw);

  // Encode amount in customId so it travels through button → modal
  const btnId = amountInfo ? `pay_submit_btn:${encodeURIComponent(amountInfo.display)}` : 'pay_submit_btn';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(btnId)
      .setLabel('📋 Submit Payment')
      .setStyle(ButtonStyle.Primary)
  );

  await message.reply({ embeds: [buildPaymentEmbed(amountInfo)], components: [row] });
}

// "Submit Payment" button — open TRX ID modal
async function handlePayButton(interaction) {
  const userId = interaction.user.id;

  if (completedSubmissions.has(userId)) {
    return interaction.reply({
      content: '✅ You have already submitted your payment. Please wait for verification.',
      ephemeral: true,
    });
  }

  // Extract encoded amount from customId (e.g. "pay_submit_btn:500%20BDT")
  const parts = interaction.customId.split(':');
  const amountEncoded = parts[1] ?? null;
  const amountDisplay = amountEncoded ? decodeURIComponent(amountEncoded) : null;

  const modal = new ModalBuilder()
    .setCustomId(amountEncoded ? `pay_trx_modal:${amountEncoded}` : 'pay_trx_modal')
    .setTitle('Payment Submission');

  const trxInput = new TextInputBuilder()
    .setCustomId('trx_id')
    .setLabel('TRX.ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter your payment transaction ID')
    .setRequired(true);

  // If an amount was set, show a read-only reminder field
  if (amountDisplay) {
    const amtInput = new TextInputBuilder()
      .setCustomId('amount_display')
      .setLabel('Amount')
      .setStyle(TextInputStyle.Short)
      .setValue(amountDisplay)
      .setRequired(false);
    modal.addComponents(
      new ActionRowBuilder().addComponents(amtInput),
      new ActionRowBuilder().addComponents(trxInput),
    );
  } else {
    modal.addComponents(new ActionRowBuilder().addComponents(trxInput));
  }

  await interaction.showModal(modal);
}

// TRX modal submitted — confirm
async function handleTrxModal(interaction) {
  const userId = interaction.user.id;

  if (completedSubmissions.has(userId)) {
    return interaction.reply({ content: '✅ You have already submitted your payment.', ephemeral: true });
  }

  const trxId = interaction.fields.getTextInputValue('trx_id').trim();
  if (!trxId) {
    return interaction.reply({ content: '❌ TRX ID cannot be empty.', ephemeral: true });
  }

  // Recover amount from modal customId
  const parts = interaction.customId.split(':');
  const amountDisplay = parts[1] ? decodeURIComponent(parts[1]) : null;

  const amountLine = amountDisplay ? `**Amount:** \`${amountDisplay}\`\n` : '';

  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Payment Submitted Successfully!')
    .setDescription(
      `${amountLine}` +
      `**TRX ID:** \`${trxId}\`\n\n` +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '⏳ Wait For Server Moderator or Owner To Verify Your Payment.'
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  const adminEmbed = new EmbedBuilder()
    .setTitle('💳 New Payment Submission')
    .setDescription(
      `**User:** <@${userId}>\n` +
      `${amountLine}` +
      `**TRX ID:** \`${trxId}\`\n` +
      `**Submitted at:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setColor(0xf39c12)
    .setFooter({ text: `User ID: ${userId}` })
    .setTimestamp();

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pay_confirm:${userId}`)
      .setLabel('Confirm Payment')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pay_reject:${userId}`)
      .setLabel('Reject Payment')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  // Only mark as submitted after the admin message is sent successfully
  await interaction.channel.send({ embeds: [adminEmbed], components: [confirmRow] });
  completedSubmissions.add(userId);
}

// ── Helper: check if member can manage payments ───────────────────────────────
// Accepts: guild owner OR Administrator permission.
// Role-name checks ("Owner") are spoofable; permission flags are not.
function canManagePayments(member, guild) {
  if (member.id === guild.ownerId) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Confirm Payment (Admin/Owner only) — opens ZP amount modal ───────────────
async function handlePayConfirm(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can confirm payments.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];

  const modal = new ModalBuilder()
    .setCustomId(`pay_confirm_modal:${buyerId}`)
    .setTitle('Confirm Payment — Add Zenix Points');

  const zpInput = new TextInputBuilder()
    .setCustomId('zp_amount')
    .setLabel('Zenix Points to add')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 500')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(zpInput));
  await interaction.showModal(modal);
}

// ── Pay confirm modal submitted — add ZP, DM buyer, update embed ──────────────
async function handlePayConfirmModal(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can confirm payments.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];
  const zpRaw   = interaction.fields.getTextInputValue('zp_amount').trim();
  if (!/^\d+$/.test(zpRaw)) {
    return interaction.reply({ content: '❌ Please enter a whole positive number (digits only) for Zenix Points.', ephemeral: true });
  }
  const zp = parseInt(zpRaw, 10);
  if (zp <= 0) {
    return interaction.reply({ content: '❌ Zenix Points must be greater than zero.', ephemeral: true });
  }

  // Add ZP to the buyer's balance
  const newBalance = addBalance(buyerId, zp);

  // Update the admin embed to show verified state
  const verifiedEmbed = new EmbedBuilder()
    .setTitle('✅ Payment Verified')
    .setDescription(
      (interaction.message?.embeds[0]?.description ?? '') +
      `\n\n💎 **Zenix Points Added:** \`${zp.toLocaleString()} ZP\``
    )
    .setColor(0x2ecc71)
    .setFooter({ text: `Verified by ${interaction.user.username} • User ID: ${buyerId}` })
    .setTimestamp();

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pay_confirm:${buyerId}`)
      .setLabel('Payment Confirmed')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pay_reject:${buyerId}`)
      .setLabel('Reject Payment')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  await interaction.update({ embeds: [verifiedEmbed], components: [disabledRow] });

  // Allow the buyer to submit again in the future
  completedSubmissions.delete(buyerId);

  // DM the buyer with ZP confirmation
  try {
    const buyer = await interaction.client.users.fetch(buyerId);
    const dmEmbed = new EmbedBuilder()
      .setTitle('✅ Payment Confirmed!')
      .setDescription(
        `Your Payment Confirmed and **${zp.toLocaleString()} Zenix Point** is Added to Your Balance.\n\n` +
        `💎 **New Balance:** ${newBalance.toLocaleString()} ZP\n\n` +
        `To buy something, use \`/buy\``
      )
      .setColor(0x2ecc71)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();
    await buyer.send({ embeds: [dmEmbed] });
  } catch {
    // DMs disabled — silently ignore
  }
}

// ── Reject Payment (Admin/Owner only) — opens reason modal ────────────────────
async function handlePayReject(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can reject payments.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];

  const modal = new ModalBuilder()
    .setCustomId(`pay_reject_modal:${buyerId}`)
    .setTitle('Reject Payment');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reject_reason')
    .setLabel('Reason (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter a reason for rejection...')
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

// ── Reject modal submitted ─────────────────────────────────────────────────────
async function handleRejectModal(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can reject payments.', ephemeral: true });
  }

  const buyerId = interaction.customId.split(':')[1];
  const reason  = interaction.fields.getTextInputValue('reject_reason').trim() || 'No reason provided.';

  // Re-allow the buyer to submit again
  completedSubmissions.delete(buyerId);

  const rejectedEmbed = new EmbedBuilder()
    .setTitle('❌ Payment Rejected')
    .setDescription(
      (interaction.message.embeds[0]?.description ?? '') +
      `\n\n**Reason:** ${reason}`
    )
    .setColor(0xe74c3c)
    .setFooter({ text: `Rejected by ${interaction.user.username} • User ID: ${buyerId}` })
    .setTimestamp();

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pay_confirm:${buyerId}`)
      .setLabel('Confirm Payment')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pay_reject:${buyerId}`)
      .setLabel('Payment Rejected')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  await interaction.update({ embeds: [rejectedEmbed], components: [disabledRow] });

  // DM the buyer with the rejection reason
  try {
    const buyer = await interaction.client.users.fetch(buyerId);
    const dmEmbed = new EmbedBuilder()
      .setTitle('❌ Payment Rejected')
      .setDescription(
        `Your payment submission was rejected by the server owner.\n\n**Reason:** ${reason}\n\nPlease resubmit with the correct details.`
      )
      .setColor(0xe74c3c)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();
    await buyer.send({ embeds: [dmEmbed] });
  } catch {}
}

module.exports = { handlePayCommand, handlePayButton, handleTrxModal, handlePayConfirm, handlePayConfirmModal, handlePayReject, handleRejectModal };
