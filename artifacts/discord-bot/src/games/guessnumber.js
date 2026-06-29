const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { recordGame } = require('../utils/gameStats');

const sessions = new Map();

const DIFFICULTIES = {
  easy:   { min: 1, max: 10,   label: 'Easy (1–10)',    maxGuesses: 5 },
  medium: { min: 1, max: 100,  label: 'Medium (1–100)', maxGuesses: 8 },
  hard:   { min: 1, max: 1000, label: 'Hard (1–1000)',  maxGuesses: 10 },
};

function hint(answer, guess) {
  const diff = Math.abs(answer - guess);
  if      (diff === 0)          return '🎯 Exact!';
  else if (diff <= answer * 0.05) return guess < answer ? '🔥 Very Hot — Higher!' : '🔥 Very Hot — Lower!';
  else if (diff <= answer * 0.15) return guess < answer ? '♨️ Hot — Higher!'     : '♨️ Hot — Lower!';
  else if (diff <= answer * 0.3)  return guess < answer ? '🌡️ Warm — Higher!'   : '🌡️ Warm — Lower!';
  else                            return guess < answer ? '🧊 Cold — Go Higher!' : '🧊 Cold — Go Lower!';
}

function buildEmbed(session) {
  const diff = DIFFICULTIES[session.difficulty];
  return new EmbedBuilder()
    .setTitle('🎯 Guess The Number')
    .setDescription(
      `**Difficulty:** ${diff.label}\n` +
      `**Guesses:** ${session.guesses}/${diff.maxGuesses}\n\n` +
      (session.lastHint ? `**Last hint:** ${session.lastHint}` : 'I\'ve picked a number. Can you guess it?')
    )
    .setColor(0x010101)
    .setFooter({ text: 'Powered by Zenix Realm • Click Guess to enter your number' });
}

async function start(interaction, difficulty) {
  const userId = interaction.user.id;
  if (sessions.has(userId)) return interaction.reply({ content: '❌ You already have an active game! Finish it first.', ephemeral: true });

  const diff   = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
  const answer = Math.floor(Math.random() * (diff.max - diff.min + 1)) + diff.min;
  const gameId = `${userId}_${Date.now()}`;

  sessions.set(userId, { userId, gameId, answer, difficulty, guesses: 0, lastHint: null });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gn_guess_${userId}`).setLabel('Guess!').setEmoji('🔢').setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [buildEmbed(sessions.get(userId))], components: [row] });

  setTimeout(() => { if (sessions.has(userId)) sessions.delete(userId); }, 10 * 60 * 1000);
}

async function handleButton(interaction) {
  const userId  = interaction.customId.split('_')[2];
  if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  const session = sessions.get(userId);
  if (!session) return interaction.reply({ content: '❌ No active game. Start one with `/game play guessnumber`.', ephemeral: true });

  const modal = new ModalBuilder().setCustomId(`gn_modal_${userId}`).setTitle('Guess The Number');
  const input = new TextInputBuilder()
    .setCustomId('gn_number').setLabel(`Enter a number (${DIFFICULTIES[session.difficulty].min}–${DIFFICULTIES[session.difficulty].max})`)
    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 42');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleModal(interaction) {
  const userId  = interaction.customId.split('_')[2];
  const session = sessions.get(userId);

  if (!session) return interaction.reply({ content: '❌ Game expired.', ephemeral: true });
  if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  const diff  = DIFFICULTIES[session.difficulty];
  const raw   = interaction.fields.getTextInputValue('gn_number').trim();
  const guess = parseInt(raw);

  if (isNaN(guess) || guess < diff.min || guess > diff.max) {
    return interaction.reply({ content: `❌ Enter a valid number between ${diff.min} and ${diff.max}.`, ephemeral: true });
  }

  session.guesses++;
  const h = hint(session.answer, guess);
  session.lastHint = h;

  const won  = guess === session.answer;
  const lost = !won && session.guesses >= diff.maxGuesses;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gn_guess_${userId}`).setLabel('Guess!').setEmoji('🔢').setStyle(ButtonStyle.Primary).setDisabled(won || lost),
  );

  if (won || lost) {
    sessions.delete(userId);
    recordGame(userId, won ? 'win' : 'loss', 'guessnumber');

    const endEmbed = new EmbedBuilder()
      .setTitle(`🎯 Guess The Number — ${won ? 'You Win! 🏆' : 'Game Over 💀'}`)
      .setDescription(
        (won
          ? `🏆 **Correct! The number was ${session.answer}!** (${session.guesses} guess${session.guesses !== 1 ? 'es' : ''})\n+200 coins!`
          : `💀 **Out of guesses!** The number was **${session.answer}**.`)
      )
      .setColor(won ? 0x2ecc71 : 0xe74c3c)
      .setFooter({ text: 'Powered by Zenix Realm' });

    return interaction.update({ embeds: [endEmbed], components: [row] });
  }

  await interaction.update({ embeds: [buildEmbed(session)], components: [row] });
}

module.exports = { start, handleButton, handleModal };
