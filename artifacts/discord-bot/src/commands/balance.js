const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addBalance, removeBalance, toTaka, toUSD, getLeaderboard } = require('../utils/zenixPoints');
const { getSpentLeaderboard } = require('../utils/stockHistory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check or transfer Zenix Points (1 point = 1 TAKA = $0.0070)')

    // ── view ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View Zenix Points balance')
      .addUserOption(o => o.setName('user').setDescription('User to check (default: yourself)').setRequired(false))
    )

    // ── give ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('give')
      .setDescription('Give some of your Zenix Points to another user')
      .addUserOption(o => o.setName('user').setDescription('User to send points to').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to send').setMinValue(1).setRequired(true))
    )

    // ── top ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('top')
      .setDescription('View the Zenix Points leaderboard')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── view ──────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const target  = interaction.options.getUser('user') || interaction.user;
      const balance = getBalance(target.id);

      const spentList = getSpentLeaderboard(interaction.guildId, Infinity);
      const spentEntry = spentList.find(e => e.userId === target.id);
      const spent = spentEntry ? spentEntry.spent : 0;

      const embed = new EmbedBuilder()
        .setTitle('💎 Zenix Points Balance')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '👤 User',          value: `<@${target.id}>`,                   inline: true },
          { name: '💎 Zenix Points',  value: `**${balance.toLocaleString()}** ZP`, inline: true },
          { name: '\u200b',           value: '\u200b',                              inline: true },
          { name: '🇧🇩 TAKA Value',  value: `৳ ${toTaka(balance)}`,               inline: true },
          { name: '💵 USD Value',     value: `${toUSD(balance)}`,                  inline: true },
          { name: '\u200b',           value: '\u200b',                              inline: true },
          { name: '🛒 Total Spent',   value: `**${spent.toLocaleString()}** ZP`,   inline: true },
          { name: '🇧🇩 Spent TAKA',  value: `৳ ${toTaka(spent)}`,                 inline: true },
          { name: '💵 Spent USD',     value: `${toUSD(spent)}`,                   inline: true },
        )
        .setDescription('**Rate:** 1 ZP = ৳1 TAKA = $0.0070')
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm • Developer: o4u9x' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── give ──────────────────────────────────────────────────────────────────
    if (sub === 'give') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const myBal  = getBalance(interaction.user.id);

      if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot give points to yourself.', ephemeral: true });
      if (target.bot)                        return interaction.reply({ content: '❌ Cannot give points to a bot.', ephemeral: true });
      if (amount > myBal)                    return interaction.reply({ content: `❌ You only have **${myBal.toLocaleString()} ZP**. You cannot give more than you have.`, ephemeral: true });

      removeBalance(interaction.user.id, amount);
      const theirBal = addBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('💸 Zenix Points Transferred')
        .addFields(
          { name: '📤 From',       value: `<@${interaction.user.id}>`,         inline: true },
          { name: '📥 To',         value: `<@${target.id}>`,                   inline: true },
          { name: '💎 Amount',     value: `**${amount.toLocaleString()}** ZP`,  inline: true },
          { name: '🇧🇩 TAKA',     value: `৳ ${toTaka(amount)}`,               inline: true },
          { name: '💵 USD',        value: `$${toUSD(amount)}`,                  inline: true },
          { name: 'Your Balance',  value: `**${(myBal - amount).toLocaleString()}** ZP`, inline: true },
        )
        .setColor(0x3498db)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── top ───────────────────────────────────────────────────────────────────
    if (sub === 'top') {
      const lb = getLeaderboard(10);
      if (!lb.length) return interaction.reply({ content: '❌ No data yet.', ephemeral: true });

      const medals = ['🥇', '🥈', '🥉'];
      const desc = lb.map((e, i) => {
        const m = medals[i] || `**${i + 1}.**`;
        return `${m} <@${e.userId}> — **${e.balance.toLocaleString()} ZP** (৳${toTaka(e.balance)} / $${toUSD(e.balance)})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('💎 Zenix Points Leaderboard')
        .setDescription(desc)
        .setColor(0xffd700)
        .setFooter({ text: '1 ZP = 1 TAKA = $0.0070 • Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
