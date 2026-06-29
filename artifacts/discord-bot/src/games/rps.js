const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recordGame } = require('../utils/gameStats');

const games = new Map();

const CHOICES = { rock: '🪨 Rock', paper: '📄 Paper', scissors: '✂️ Scissors' };
const BEATS   = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function choiceRow(gameId, suffix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rps_pick_${gameId}_rock_${suffix}`).setLabel('Rock').setEmoji('🪨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rps_pick_${gameId}_paper_${suffix}`).setLabel('Paper').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rps_pick_${gameId}_scissors_${suffix}`).setLabel('Scissors').setEmoji('✂️').setStyle(ButtonStyle.Secondary),
  );
}

function resolve(a, b) {
  if (a === b) return 'draw';
  return BEATS[a] === b ? 'win' : 'loss';
}

async function startVsBot(interaction) {
  const gameId = `${interaction.user.id}_${Date.now()}`;
  games.set(gameId, { mode: 'bot', player: interaction.user, choice: null });

  const embed = new EmbedBuilder()
    .setTitle('🪨 Rock Paper Scissors — vs Bot')
    .setDescription('Pick your choice!')
    .setColor(0x010101)
    .setFooter({ text: 'Powered by Zenix Realm' });

  await interaction.reply({ embeds: [embed], components: [choiceRow(gameId, 'p1')], ephemeral: false });

  setTimeout(() => { if (games.has(gameId)) games.delete(gameId); }, 60000);
}

async function startVsPlayer(interaction, opponent) {
  if (opponent.id === interaction.user.id) return interaction.reply({ content: '❌ Cannot challenge yourself.', ephemeral: true });
  if (opponent.bot) return interaction.reply({ content: '❌ Cannot challenge a bot.', ephemeral: true });

  const gameId = `${interaction.channel.id}_${Date.now()}`;
  games.set(gameId, { mode: 'pvp', player1: interaction.user, player2: opponent, p1Choice: null, p2Choice: null });

  const embed = new EmbedBuilder()
    .setTitle('🪨 Rock Paper Scissors — PvP')
    .setDescription(
      `<@${interaction.user.id}> vs <@${opponent.id}>\n\n` +
      `**Both players:** Click the button below to make your choice! (choices are hidden)`
    )
    .setColor(0x010101)
    .setFooter({ text: 'Powered by Zenix Realm • 60s timeout' });

  await interaction.reply({ embeds: [embed], components: [choiceRow(gameId, 'both')] });

  setTimeout(async () => {
    if (games.has(gameId)) {
      games.delete(gameId);
      const msg = await interaction.fetchReply().catch(() => null);
      if (msg) await msg.edit({ content: '⏱️ Game timed out.', embeds: [], components: [] }).catch(() => {});
    }
  }, 60000);
}

async function handleButton(interaction) {
  const parts = interaction.customId.split('_');
  // rps_pick_{gameId}_{choice}_{suffix}
  const gameId = parts[2];
  const choice = parts[3];
  const game   = games.get(gameId);

  if (!game) return interaction.reply({ content: '❌ Game expired.', ephemeral: true });

  // BOT MODE
  if (game.mode === 'bot') {
    if (interaction.user.id !== game.player.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

    games.delete(gameId);
    const botChoice = Object.keys(CHOICES)[Math.floor(Math.random() * 3)];
    const result    = resolve(choice, botChoice);

    recordGame(interaction.user.id, result, 'rps');

    const resultText = result === 'win' ? '🏆 You win!' : result === 'loss' ? '💀 You lose!' : '🤝 Draw!';
    const embed = new EmbedBuilder()
      .setTitle('🪨 Rock Paper Scissors — Result')
      .setDescription(
        `**You:** ${CHOICES[choice]}\n**Bot:** ${CHOICES[botChoice]}\n\n**${resultText}**`
      )
      .setColor(result === 'win' ? 0x2ecc71 : result === 'loss' ? 0xe74c3c : 0xffd700)
      .setFooter({ text: 'Powered by Zenix Realm' });

    return interaction.update({ embeds: [embed], components: [] });
  }

  // PVP MODE
  const isP1 = interaction.user.id === game.player1.id;
  const isP2 = interaction.user.id === game.player2.id;
  if (!isP1 && !isP2) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  if (isP1 && game.p1Choice) return interaction.reply({ content: '✅ You already chose! Waiting for opponent.', ephemeral: true });
  if (isP2 && game.p2Choice) return interaction.reply({ content: '✅ You already chose! Waiting for opponent.', ephemeral: true });

  if (isP1) game.p1Choice = choice;
  if (isP2) game.p2Choice = choice;

  // Acknowledge secretly
  await interaction.reply({ content: `✅ You chose **${CHOICES[choice]}**! Waiting for the other player...`, ephemeral: true });

  // Both chose — resolve
  if (game.p1Choice && game.p2Choice) {
    games.delete(gameId);
    const result1 = resolve(game.p1Choice, game.p2Choice);
    const result2 = resolve(game.p2Choice, game.p1Choice);

    recordGame(game.player1.id, result1, 'rps');
    recordGame(game.player2.id, result2, 'rps');

    const winner = result1 === 'win' ? game.player1 : result2 === 'win' ? game.player2 : null;
    const resultText = winner ? `🏆 **<@${winner.id}> wins!**` : '🤝 **It\'s a draw!**';

    const embed = new EmbedBuilder()
      .setTitle('🪨 Rock Paper Scissors — Result')
      .setDescription(
        `**${game.player1.username}:** ${CHOICES[game.p1Choice]}\n` +
        `**${game.player2.username}:** ${CHOICES[game.p2Choice]}\n\n${resultText}`
      )
      .setColor(winner ? 0x2ecc71 : 0xffd700)
      .setFooter({ text: 'Powered by Zenix Realm' });

    const msg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }
}

module.exports = { startVsBot, startVsPlayer, handleButton };
