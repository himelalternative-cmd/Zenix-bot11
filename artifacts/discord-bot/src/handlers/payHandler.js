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

// Parse the raw amount string typed after !pay
// Accepts: 500  |  $500  |  500BDT  |  ৳500  |  500 BDT  |  $500.50
function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.trim();
  const m = cleaned.match(/^([^\d]*)(\d+(?:[.,]\d+)?)([^\d]*)$/);
  if (!m) return null;
  const prefix   = m[1].trim();
  const num      = m[2].replace(',', '.');
  const suffix   = m[3].trim();
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
  const btnId = amountInfo ? `pay_submit_btn:${encodeURIComponent(amountInfo.display)}` : 'pay_submit_btn';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(btnId)
      .setLabel('📋 Submit Payment')
      .setStyle(ButtonStyle.Primary)
  );

  await message.reply({ embeds: [buildPaymentEmbed(amountInfo)], components: [row] });
}

// "Submit Payment" button — open TRX ID + Amount modal
// Users can submit unlimited times — no restriction.
async function handlePayButton(interaction) {
  const parts         = interaction.customId.split(':');
  const amountEncoded = parts[1] ?? null;
  const amountDisplay = amountEncoded ? decodeURIComponent(amountEncoded) : null;

  const modal = new ModalBuilder()
    .setCustomId(amountEncoded ? `pay_trx_modal:${amountEncoded}` : 'pay_trx_modal')
    .setTitle('Payment Submission');

  // Amount field — pre-filled if admin set it, otherwise blank for user to fill
  const amtInput = new TextInputBuilder()
    .setCustomId('amount_display')
    .setLabel('Amount Paid (e.g. 500 BDT)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 600 BDT')
    .setRequired(true);
  if (amountDisplay) amtInput.setValue(amountDisplay);

  const trxInput = new TextInputBuilder()
    .setCustomId('trx_id')
    .setLabel('TRX ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter your payment transaction ID')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(amtInput),
    new ActionRowBuilder().addComponents(trxInput),
  );

  await interaction.showModal(modal);
}

// TRX modal submitted — forward to admin channel
async function handleTrxModal(interaction) {
  const userId       = interaction.user.id;
  const trxId        = interaction.fields.getTextInputValue('trx_id').trim();
  const amountEntered = interaction.fields.getTextInputValue('amount_display').trim();

  if (!trxId) {
    return interaction.reply({ content: '❌ TRX ID cannot be empty.', ephemeral: true });
  }
  if (!amountEntered) {
    return interaction.reply({ content: '❌ Amount cannot be empty.', ephemeral: true });
  }

  // Confirmation shown to the submitting user (ephemeral)
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Payment Submitted Successfully!')
    .setDescription(
      `**Amount:** \`${amountEntered}\`\n` +
      `**TRX ID:** \`${trxId}\`\n\n` +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '⏳ Wait For Server Moderator or Owner To Verify Your Payment.'
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  // Admin-facing submission embed
  const submittedAt = Math.floor(Date.now() / 1000);
  const adminEmbed = new EmbedBuilder()
    .setTitle('💳 New Payment Submission')
    .setDescription(
      `**User:** <@${userId}>\n` +
      `**Amount:** \`${amountEntered}\`\n` +
      `**TRX ID:** \`${trxId}\`\n` +
      `**Submitted at:** <t:${submittedAt}:F>`
    )
    .setColor(0xf39c12)
    .setFooter({ text: `User ID: ${userId}` })
    .setTimestamp();

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pay_confirm:${userId}:${encodeURIComponent(amountEntered)}:${encodeURIComponent(trxId)}:${submittedAt}`)
      .setLabel('Confirm Payment')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pay_reject:${userId}:${encodeURIComponent(amountEntered)}:${encodeURIComponent(trxId)}:${submittedAt}`)
      .setLabel('Reject Payment')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.channel.send({ embeds: [adminEmbed], components: [confirmRow] });
}

// ── Helper: check if member can manage payments ───────────────────────────────
function canManagePayments(member, guild) {
  if (member.id === guild.ownerId) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Confirm Payment (Admin/Owner only) — opens ZP amount modal ───────────────
async function handlePayConfirm(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can confirm payments.', ephemeral: true });
  }

  // customId: pay_confirm:<userId>:<amount>:<trxId>:<submittedAt>
  const parts = interaction.customId.split(':');
  const buyerId      = parts[1];
  const amountEnc    = parts[2] ?? '';
  const trxEnc       = parts[3] ?? '';
  const submittedAt  = parts[4] ?? '';

  const modal = new ModalBuilder()
    .setCustomId(`pay_confirm_modal:${buyerId}:${amountEnc}:${trxEnc}:${submittedAt}`)
    .setTitle('Confirm Payment — Add Zenix Points');

  const zpInput = new TextInputBuilder()
    .setCustomId('zp_amount')
    .setLabel('Zenix Points to add')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 600')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(zpInput));
  await interaction.showModal(modal);
}

// ── Pay confirm modal submitted — add ZP, update embed, DM buyer ──────────────
async function handlePayConfirmModal(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can confirm payments.', ephemeral: true });
  }

  // customId: pay_confirm_modal:<userId>:<amount>:<trxId>:<submittedAt>
  const parts       = interaction.customId.split(':');
  const buyerId     = parts[1];
  const amount      = parts[2] ? decodeURIComponent(parts[2]) : null;
  const trxId       = parts[3] ? decodeURIComponent(parts[3]) : null;
  const submittedAt = parts[4] ? parseInt(parts[4], 10) : null;

  const zpRaw = interaction.fields.getTextInputValue('zp_amount').trim();
  if (!/^\d+$/.test(zpRaw)) {
    return interaction.reply({ content: '❌ Please enter a whole positive number for Zenix Points.', ephemeral: true });
  }
  const zp = parseInt(zpRaw, 10);
  if (zp <= 0) {
    return interaction.reply({ content: '❌ Zenix Points must be greater than zero.', ephemeral: true });
  }

  const newBalance = addBalance(buyerId, zp);

  // Build the verified embed matching the screenshot layout
  let desc = `**User:** <@${buyerId}>\n`;
  if (amount)      desc += `**Amount:** \`${amount}\`\n`;
  if (trxId)       desc += `**TRX ID:** \`${trxId}\`\n`;
  if (submittedAt) desc += `**Submitted at:** <t:${submittedAt}:F>\n`;
  desc += `\n💎 **Zenix Points Added:** \`${zp.toLocaleString()} ZP\``;

  const verifiedEmbed = new EmbedBuilder()
    .setTitle('✅ Payment Verified')
    .setDescription(desc)
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

  // DM the buyer
  try {
    const buyer = await interaction.client.users.fetch(buyerId);
    const dmEmbed = new EmbedBuilder()
      .setTitle('✅ Payment Confirmed!')
      .setDescription(
        `Your payment has been confirmed and **${zp.toLocaleString()} Zenix Points** added to your balance.\n\n` +
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

// ── Reject Payment (Admin/Owner only) ─────────────────────────────────────────
async function handlePayReject(interaction) {
  if (!canManagePayments(interaction.member, interaction.guild)) {
    return interaction.reply({ content: '❌ Only server administrators can reject payments.', ephemeral: true });
  }

  // customId: pay_reject:<userId>:<amount>:<trxId>:<submittedAt>
  const parts = interaction.customId.split(':');
  const buyerId     = parts[1];
  const amountEnc   = parts[2] ?? '';
  const trxEnc      = parts[3] ?? '';
  const submittedAt = parts[4] ?? '';

  const modal = new ModalBuilder()
    .setCustomId(`pay_reject_modal:${buyerId}:${amountEnc}:${trxEnc}:${submittedAt}`)
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

  // customId: pay_reject_modal:<userId>:<amount>:<trxId>:<submittedAt>
  const parts       = interaction.customId.split(':');
  const buyerId     = parts[1];
  const amount      = parts[2] ? decodeURIComponent(parts[2]) : null;
  const trxId       = parts[3] ? decodeURIComponent(parts[3]) : null;
  const submittedAt = parts[4] ? parseInt(parts[4], 10) : null;
  const reason      = interaction.fields.getTextInputValue('reject_reason').trim() || 'No reason provided.';

  let desc = `**User:** <@${buyerId}>\n`;
  if (amount)      desc += `**Amount:** \`${amount}\`\n`;
  if (trxId)       desc += `**TRX ID:** \`${trxId}\`\n`;
  if (submittedAt) desc += `**Submitted at:** <t:${submittedAt}:F>\n`;
  desc += `\n**Reason:** ${reason}`;

  const rejectedEmbed = new EmbedBuilder()
    .setTitle('❌ Payment Rejected')
    .setDescription(desc)
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

  // DM the buyer
  try {
    const buyer = await interaction.client.users.fetch(buyerId);
    const dmEmbed = new EmbedBuilder()
      .setTitle('❌ Payment Rejected')
      .setDescription(
        `Your payment submission was rejected.\n\n**Reason:** ${reason}\n\nPlease resubmit with the correct details.`
      )
      .setColor(0xe74c3c)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();
    await buyer.send({ embeds: [dmEmbed] });
  } catch {}
}

module.exports = { handlePayCommand, handlePayButton, handleTrxModal, handlePayConfirm, handlePayConfirmModal, handlePayReject, handleRejectModal };
