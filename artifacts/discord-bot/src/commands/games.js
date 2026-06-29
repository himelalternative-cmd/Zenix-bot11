const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const GAME_LIST = [
  { label: '❌ Tic Tac Toe',     value: 'tictactoe',   desc: 'Classic 3x3 grid — challenge a friend' },
  { label: '🪨 Rock Paper Scissors', value: 'rps',     desc: 'PvP or vs Bot — choose wisely' },
  { label: '🎯 Guess The Number', value: 'guessnumber', desc: 'Higher or lower hints — solo' },
  { label: '🃏 Blackjack',        value: 'blackjack',   desc: 'Hit or Stand vs the dealer' },
  { label: '💰 Coin Flip',        value: 'coinflip',    desc: 'Heads or Tails — pure luck' },
  { label: '❓ Trivia',           value: 'trivia',      desc: 'Multiple choice questions' },
  { label: '🎯 Hangman',          value: 'hangman',     desc: 'Guess the hidden word' },
  { label: '🎲 Would You Rather', value: 'wyr',         desc: 'Vote between two options' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription('Open the Zenix mini-games hub'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Zenix Games Hub')
      .setDescription(
        'Welcome to the **Zenix Realm Games Hub**!\n' +
        'Select a game from the menu below to start playing.\n\n' +
        '**🏆 Earn coins and XP** from every game you play!\n' +
        '**Use `/game daily`** for your daily coin bonus.\n' +
        '**Use `/game profile`** to view your stats and rank.'
      )
      .addFields(
        { name: '⚔️ Multiplayer', value: '❌ Tic Tac Toe\n🪨 Rock Paper Scissors', inline: true },
        { name: '🧠 Brain Games', value: '🎯 Guess The Number\n❓ Trivia\n🎯 Hangman',  inline: true },
        { name: '🎲 Fun & Luck',  value: '💰 Coin Flip\n🃏 Blackjack\n🎲 Would You Rather', inline: true },
      )
      .setColor(0x010101)
      .setFooter({ text: 'Powered by Zenix Realm • Developer: o4u9x' })
      .setTimestamp();

    const menu = new StringSelectMenuBuilder()
      .setCustomId('games_select_hub')
      .setPlaceholder('🎮 Pick a game to get started...')
      .addOptions(GAME_LIST.map(g => ({ label: g.label, value: g.value, description: g.desc })));

    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
