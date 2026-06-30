const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSpentLeaderboard } = require('../utils/stockHistory');
const { toTaka, toUSD }       = require('../utils/zenixPoints');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spentleaderboard')
    .setDescription('🏆 Show the top spenders by total Zenix Points spent on purchases'),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    const lb      = getSpentLeaderboard(guildId, 10);

    if (!lb.length) {
      return interaction.editReply({
        content: '❌ No purchase data yet. Spend some Zenix Points first!',
      });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const desc   = lb.map((e, i) => {
      const place = medals[i] || `**${i + 1}.**`;
      const taka  = toTaka(e.spent);
      const usd   = toUSD(e.spent);
      return `${place} <@${e.userId}> — **${e.spent.toLocaleString()} ZP** spent\n　　৳${taka} • $${usd}`;
    }).join('\n\n');

    const top = lb[0];

    const embed = new EmbedBuilder()
      .setTitle('💸 Balance Spent Leaderboard')
      .setDescription(desc)
      .setColor(0xff6b00)
      .addFields({
        name:   '🔥 Biggest Spender',
        value:  `<@${top.userId}> with **${top.spent.toLocaleString()} ZP** (৳${toTaka(top.spent)} / $${toUSD(top.spent)})`,
        inline: false,
      })
      .setFooter({ text: 'Counts /buy purchases + /balance give • Powered by Zenix Realm' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
