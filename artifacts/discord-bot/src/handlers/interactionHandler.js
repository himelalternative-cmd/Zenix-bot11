const { EmbedBuilder } = require('discord.js');
const { handlePayButton, handleTrxModal, handlePayConfirm, handlePayConfirmModal, handlePayReject, handleRejectModal } = require('./payHandler');
const { handleBuyRobuxButton, handleBuyRobuxModal, handleRbxConfirm, handleIggBuyButton, handleIggOrderModal, handleIggDone } = require('./rbxHandler');
const { handleDmMessageModal } = require('../commands/setup');
const { handleVerifyButton, handleVerifyCaptcha } = require('./verifyHandler');
const {
  handleTicketSelect,
  handleTicketClose,
  handleTicketClaim,
  handleTicketDone,
  handleTicketTranscript,
  handleTicketDelete,
  handleTicketDeleteConfirm,
  handleTicketDeleteCancel,
} = require('./ticketHandler');

async function handleDmModal(interaction) {
  const targetId = interaction.customId.split(':')[1];
  const message  = interaction.fields.getTextInputValue('dm_message').trim();

  if (!message) {
    return interaction.reply({ content: '❌ Message cannot be empty.', ephemeral: true });
  }

  let target;
  try {
    target = await interaction.client.users.fetch(targetId);
  } catch {
    return interaction.reply({ content: '❌ Could not find that user.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setDescription(message)
    .setColor(0x010101)
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTimestamp();

  try {
    await target.send({ embeds: [embed] });
    await interaction.reply({
      content: `✅ DM sent to **${target.username}**.`,
      ephemeral: true,
    });
  } catch {
    await interaction.reply({
      content: `❌ Could not DM **${target.username}**. They may have DMs disabled.`,
      ephemeral: true,
    });
  }
}

async function handleInteraction(client, interaction) {
  // ── Slash Commands ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`Error in /${interaction.commandName}:`, err);
      const msg = { content: '❌ An error occurred.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
    return;
  }

  // ── Autocomplete ────────────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`Autocomplete error in /${interaction.commandName}:`, err);
        await interaction.respond([]).catch(() => {});
      }
    } else {
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  // ── Select Menus ────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') return handleTicketSelect(interaction);
    return;
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === 'verify_btn')            return handleVerifyButton(interaction);
    if (id === 'rbx_buy_btn')           return handleBuyRobuxButton(interaction);
    if (id.startsWith('rbx_confirm:')) return handleRbxConfirm(interaction);
    if (id === 'igg_buy_btn')           return handleIggBuyButton(interaction);
    if (id.startsWith('igg_done:'))     return handleIggDone(interaction);
    if (id.startsWith('pay_submit_btn')) return handlePayButton(interaction);
    if (id.startsWith('pay_confirm'))    return handlePayConfirm(interaction);
    if (id.startsWith('pay_reject'))     return handlePayReject(interaction);
    if (id === 'ticket_close')          return handleTicketClose(interaction);
    if (id === 'ticket_claim')          return handleTicketClaim(interaction);
    if (id === 'ticket_done')           return handleTicketDone(interaction);
    if (id === 'ticket_transcript')     return handleTicketTranscript(interaction);
    if (id === 'ticket_delete')         return handleTicketDelete(interaction);
    if (id === 'ticket_delete_confirm') return handleTicketDeleteConfirm(interaction);
    if (id === 'ticket_delete_cancel')  return handleTicketDeleteCancel(interaction);
    return;
  }

  // ── Modals ──────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verify_captcha_modal')      return handleVerifyCaptcha(interaction);
    if (interaction.customId === 'rbx_order_modal')           return handleBuyRobuxModal(interaction);
    if (interaction.customId === 'igg_order_modal')           return handleIggOrderModal(interaction);
    if (interaction.customId.startsWith('pay_trx_modal'))     return handleTrxModal(interaction);
    if (interaction.customId.startsWith('pay_confirm_modal')) return handlePayConfirmModal(interaction);
    if (interaction.customId.startsWith('pay_reject_modal'))  return handleRejectModal(interaction);
    if (interaction.customId.startsWith('dm_modal'))               return handleDmModal(interaction);
    if (interaction.customId.startsWith('setup_dm_message_modal|')) return handleDmMessageModal(interaction);
    return;
  }
}

module.exports = { handleInteraction };
