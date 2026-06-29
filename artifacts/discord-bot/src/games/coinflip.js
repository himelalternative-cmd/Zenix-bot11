const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recordGame } = require('../utils/gameStats');

const SIDES = { heads: '🪙 Heads', tails: '🪙 Tails' };

async function start(interaction, side) {
  const result  = Math.random() < 0.5 ? 'heads' : 'tails';
  const win     = result === side;

  recordGame(interaction.user.id, win ? 'win' : 'loss', 'coinflip');

  // "Spinning" embed → then reveal
  const spinEmbed = new EmbedBuilder()
    .setTitle('💰 Coin Flip')
    .setDescription('🌀 **Flipping the coin...**')
    .setColor(0xffd700);

  await interaction.reply({ embeds: [spinEmbed] });

  await new Promise(r => setTimeout(r, 1500));

  const resultEmbed = new EmbedBuilder()
    .setTitle('💰 Coin Flip')
    .setDescription(
      `You chose **${SIDES[side]}**\n` +
      `The coin landed on **${SIDES[result]}**\n\n` +
      (win ? '🏆 **You win! +200 coins**' : '💀 **You lose!**')
    )
    .setColor(win ? 0x2ecc71 : 0xe74c3c)
    .setFooter({ text: 'Powered by Zenix Realm' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cf_flip_${interaction.user.id}_heads`).setLabel('Flip Heads').setEmoji('🪙').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cf_flip_${interaction.user.id}_tails`).setLabel('Flip Tails').setEmoji('🪙').setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [resultEmbed], components: [row] });
}

async function handleButton(interaction) {
  const parts  = interaction.customId.split('_');
  const userId = parts[2];
  const side   = parts[3];

  if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const win    = result === side;

  recordGame(userId, win ? 'win' : 'loss', 'coinflip');

  const embed = new EmbedBuilder()
    .setTitle('💰 Coin Flip')
    .setDescription(
      `You chose **${SIDES[side]}**\n` +
      `The coin landed on **${SIDES[result]}**\n\n` +
      (win ? '🏆 **You win! +200 coins**' : '💀 **You lose!**')
    )
    .setColor(win ? 0x2ecc71 : 0xe74c3c)
    .setFooter({ text: 'Powered by Zenix Realm' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cf_flip_${userId}_heads`).setLabel('Flip Heads').setEmoji('🪙').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cf_flip_${userId}_tails`).setLabel('Flip Tails').setEmoji('🪙').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

module.exports = { start, handleButton };
