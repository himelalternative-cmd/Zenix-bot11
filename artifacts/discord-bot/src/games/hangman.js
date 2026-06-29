const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { recordGame } = require('../utils/gameStats');

const sessions = new Map();

const WORDS = {
  movies:    ['INCEPTION','AVATAR','TITANIC','INTERSTELLAR','PARASITE','JOKER','DUNE','MATRIX'],
  games:     ['MINECRAFT','ROBLOX','FORTNITE','POKEMON','ZELDA','HALO','PORTAL','TETRIS'],
  countries: ['BRAZIL','CANADA','GERMANY','JAPAN','AUSTRALIA','FRANCE','EGYPT','NORWAY'],
  animals:   ['ELEPHANT','GIRAFFE','PENGUIN','DOLPHIN','CHEETAH','GORILLA','FLAMINGO','CROCODILE'],
  food:      ['SPAGHETTI','PIZZA','SUSHI','BURRITO','CROISSANT','LASAGNA','WAFFLE','AVOCADO'],
};

const STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

function display(word, guessed) {
  return word.split('').map(c => guessed.has(c) ? c : '_').join(' ');
}

function buildEmbed(session) {
  const stage    = STAGES[6 - session.lives];
  const revealed = display(session.word, session.guessed);
  const guessed  = [...session.guessed].sort().join(', ') || '—';
  return new EmbedBuilder()
    .setTitle('🎯 Hangman')
    .setDescription(
      `${stage}\n` +
      `**Word:** \`${revealed}\`\n\n` +
      `**Lives:** ${'❤️'.repeat(session.lives)}${'🖤'.repeat(6 - session.lives)}\n` +
      `**Guessed:** ${guessed}`
    )
    .setColor(session.lives > 3 ? 0x2ecc71 : session.lives > 1 ? 0xffd700 : 0xe74c3c)
    .setFooter({ text: `Category: ${session.category} • Click "Guess" to enter a letter` });
}

function guessRow(gameId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hng_guess_${gameId}`).setLabel('Guess a Letter').setEmoji('🔤').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

async function start(interaction, category) {
  const cat      = WORDS[category] ? category : 'games';
  const wordList = WORDS[cat];
  const word     = wordList[Math.floor(Math.random() * wordList.length)];
  const gameId   = `${interaction.user.id}_${Date.now()}`;

  const session = { userId: interaction.user.id, word, guessed: new Set(), lives: 6, category: cat, gameId };
  sessions.set(gameId, session);

  await interaction.reply({ embeds: [buildEmbed(session)], components: [guessRow(gameId)] });

  setTimeout(() => { if (sessions.has(gameId)) sessions.delete(gameId); }, 10 * 60 * 1000);
}

async function handleButton(interaction) {
  const parts  = interaction.customId.split('_');
  const gameId = parts[2];
  const session = sessions.get(gameId);

  if (!session) return interaction.reply({ content: '❌ Game expired.', ephemeral: true });
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  // Show modal to enter a letter
  const modal = new ModalBuilder().setCustomId(`hng_modal_${gameId}`).setTitle('Guess a Letter');
  const input = new TextInputBuilder()
    .setCustomId('hng_letter').setLabel('Enter a single letter (A–Z)').setStyle(TextInputStyle.Short)
    .setMinLength(1).setMaxLength(1).setRequired(true).setPlaceholder('e.g. E');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleModal(interaction) {
  const parts   = interaction.customId.split('_');
  const gameId  = parts[2];
  const session = sessions.get(gameId);

  if (!session) return interaction.reply({ content: '❌ Game expired.', ephemeral: true });
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  const letter = interaction.fields.getTextInputValue('hng_letter').toUpperCase().trim();
  if (!letter.match(/^[A-Z]$/)) return interaction.reply({ content: '❌ Please enter a single letter A–Z.', ephemeral: true });

  if (session.guessed.has(letter)) return interaction.reply({ content: `⚠️ You already guessed **${letter}**!`, ephemeral: true });

  session.guessed.add(letter);
  const hit = session.word.includes(letter);
  if (!hit) session.lives--;

  const revealed = display(session.word, session.guessed);
  const won  = !revealed.includes('_');
  const lost = session.lives <= 0;

  if (won || lost) {
    sessions.delete(session.gameId);
    recordGame(session.userId, won ? 'win' : 'loss', 'hangman');

    const endEmbed = buildEmbed(session)
      .setTitle(`🎯 Hangman — ${won ? 'You Win! 🏆' : 'Game Over 💀'}`)
      .setDescription(
        `${STAGES[6 - session.lives]}\n` +
        `**Word:** \`${session.word}\`\n\n` +
        (won ? '🏆 **Congratulations! +200 coins**' : `💀 **The word was: ${session.word}**`)
      )
      .setColor(won ? 0x2ecc71 : 0xe74c3c);

    return interaction.update({ embeds: [endEmbed], components: [guessRow(session.gameId, true)] });
  }

  await interaction.update({ embeds: [buildEmbed(session)], components: [guessRow(session.gameId)] });
}

module.exports = { start, handleButton, handleModal };
