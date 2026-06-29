const { EmbedBuilder } = require('discord.js');
const { handlePayButton, handleTrxModal, handlePayConfirm, handlePayReject, handleRejectModal } = require('./payHandler');
const { handleVerifyButton, handleVerifyCaptcha } = require('./verifyHandler');
const { handleGameInteraction, isGameInteraction } = require('./gameHandler');
const {
  handleTicketSelect,
  handleTicketClose,
  handleTicketClaim,
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

// Route games hub select menu → start the chosen game
async function handleGamesSelectHub(interaction, client) {
  const game = interaction.values[0];
  const gameCmd = client.commands.get('game');
  if (!gameCmd) return interaction.reply({ content: '❌ Game system not loaded.', ephemeral: true });

  const descriptions = {
    tictactoe:   '**❌ Tic Tac Toe** — Use `/game play tictactoe opponent:@user` to challenge someone.',
    rps:         '**🪨 Rock Paper Scissors** — Use `/game play rps mode:bot` or `mode:pvp opponent:@user`.',
    guessnumber: '**🎯 Guess The Number** — Use `/game play guessnumber difficulty:easy/medium/hard`.',
    blackjack:   '**🃏 Blackjack** — Use `/game play blackjack` to play against the dealer.',
    coinflip:    '**💰 Coin Flip** — Use `/game play coinflip side:heads` or `side:tails`.',
    trivia:      '**❓ Trivia** — Use `/game play trivia category:gaming` (or any category).',
    hangman:     '**🎯 Hangman** — Use `/game play hangman category:movies` (or any category).',
    wyr:         '**🎲 Would You Rather** — Use `/game play wyr` to start a vote.',
  };

  const hint = descriptions[game] || 'Use `/game play` to start this game.';
  await interaction.reply({ content: `${hint}\n\nOr use \`/game play\` with the **game** option set to \`${game}\`.`, ephemeral: true });
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
      await command.autocomplete(interaction).catch(err => console.error('Autocomplete error:', err));
    }
    return;
  }

  // ── Select Menus ────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') return handleTicketSelect(interaction);
    if (interaction.customId === 'games_select_hub')       return handleGamesSelectHub(interaction, client);
    return;
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === 'verify_btn')            return handleVerifyButton(interaction);
    if (isGameInteraction(id))          return handleGameInteraction(interaction);
    if (id.startsWith('pay_submit_btn')) return handlePayButton(interaction);
    if (id.startsWith('pay_confirm'))    return handlePayConfirm(interaction);
    if (id.startsWith('pay_reject'))     return handlePayReject(interaction);
    if (id === 'ticket_close')          return handleTicketClose(interaction);
    if (id === 'ticket_claim')          return handleTicketClaim(interaction);
    if (id === 'ticket_transcript')     return handleTicketTranscript(interaction);
    if (id === 'ticket_delete')         return handleTicketDelete(interaction);
    if (id === 'ticket_delete_confirm') return handleTicketDeleteConfirm(interaction);
    if (id === 'ticket_delete_cancel')  return handleTicketDeleteCancel(interaction);
    return;
  }

  // ── Modals ──────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verify_captcha_modal')      return handleVerifyCaptcha(interaction);
    if (isGameInteraction(interaction.customId))             return handleGameInteraction(interaction);
    if (interaction.customId.startsWith('pay_trx_modal'))    return handleTrxModal(interaction);
    if (interaction.customId.startsWith('pay_reject_modal')) return handleRejectModal(interaction);
    if (interaction.customId.startsWith('dm_modal'))          return handleDmModal(interaction);
    return;
  }
}

module.exports = { handleInteraction };
