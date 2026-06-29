const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getBalance, setBalance, addBalance, removeBalance, toTaka, toUSD, getLeaderboard } = require('../utils/zenixPoints');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Manage Zenix Points (1 point = 1 TAKA = $0.0070)')

    // ── view ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View Zenix Points balance')
      .addUserOption(o => o.setName('user').setDescription('User to check (default: yourself)').setRequired(false))
    )

    // ── add ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add Zenix Points to a user [Admin only]')
      .addUserOption(o => o.setName('user').setDescription('User to give points to').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount of Zenix Points to add').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for adding points').setRequired(false))
    )

    // ── remove ────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove Zenix Points from a user [Admin only]')
      .addUserOption(o => o.setName('user').setDescription('User to remove points from').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount of Zenix Points to remove').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for removing points').setRequired(false))
    )

    // ── set ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a user\'s Zenix Points to an exact amount [Admin only]')
      .addUserOption(o => o.setName('user').setDescription('User to set points for').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('New balance amount').setMinValue(0).setRequired(true))
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

      const embed = new EmbedBuilder()
        .setTitle('💎 Zenix Points Balance')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '👤 User',          value: `<@${target.id}>`,             inline: true },
          { name: '💎 Zenix Points',  value: `**${balance.toLocaleString()}** ZP`, inline: true },
          { name: '\u200b',           value: '\u200b',                       inline: true },
          { name: '🇧🇩 TAKA Value',   value: `৳ ${toTaka(balance)}`,        inline: true },
          { name: '💵 USD Value',     value: `$${toUSD(balance)}`,           inline: true },
          { name: '\u200b',           value: '\u200b',                       inline: true },
        )
        .setDescription('**Rate:** 1 ZP = ৳1 TAKA = $0.0070')
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm • Developer: o4u9x' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── add (Admin only) ──────────────────────────────────────────────────────
    if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only administrators can add Zenix Points.', ephemeral: true });
      }

      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (target.bot) return interaction.reply({ content: '❌ Cannot give points to a bot.', ephemeral: true });

      const newBal = addBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('✅ Zenix Points Added')
        .addFields(
          { name: '👤 User',         value: `<@${target.id}>`,                    inline: true },
          { name: '➕ Added',        value: `**+${amount.toLocaleString()}** ZP`,  inline: true },
          { name: '💎 New Balance',  value: `**${newBal.toLocaleString()}** ZP`,   inline: true },
          { name: '🇧🇩 TAKA',       value: `৳ ${toTaka(newBal)}`,                 inline: true },
          { name: '💵 USD',         value: `$${toUSD(newBal)}`,                    inline: true },
          { name: '📝 Reason',      value: reason,                                 inline: false },
        )
        .setColor(0x2ecc71)
        .setFooter({ text: `Added by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── remove (Admin only) ───────────────────────────────────────────────────
    if (sub === 'remove') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only administrators can remove Zenix Points.', ephemeral: true });
      }

      const target  = interaction.options.getUser('user');
      const amount  = interaction.options.getInteger('amount');
      const reason  = interaction.options.getString('reason') || 'No reason provided';
      const current = getBalance(target.id);

      if (amount > current) {
        return interaction.reply({ content: `❌ <@${target.id}> only has **${current.toLocaleString()} ZP**. Cannot remove more than available.`, ephemeral: true });
      }

      const newBal = removeBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('✅ Zenix Points Removed')
        .addFields(
          { name: '👤 User',        value: `<@${target.id}>`,                    inline: true },
          { name: '➖ Removed',     value: `**-${amount.toLocaleString()}** ZP`,  inline: true },
          { name: '💎 New Balance', value: `**${newBal.toLocaleString()}** ZP`,   inline: true },
          { name: '🇧🇩 TAKA',      value: `৳ ${toTaka(newBal)}`,                 inline: true },
          { name: '💵 USD',        value: `$${toUSD(newBal)}`,                    inline: true },
          { name: '📝 Reason',     value: reason,                                 inline: false },
        )
        .setColor(0xe74c3c)
        .setFooter({ text: `Removed by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── set (Admin only) ──────────────────────────────────────────────────────
    if (sub === 'set') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only administrators can set Zenix Points.', ephemeral: true });
      }

      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      if (target.bot) return interaction.reply({ content: '❌ Cannot set points for a bot.', ephemeral: true });

      const newBal = setBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('✅ Zenix Points Set')
        .addFields(
          { name: '👤 User',        value: `<@${target.id}>`,                  inline: true },
          { name: '💎 New Balance', value: `**${newBal.toLocaleString()}** ZP`, inline: true },
          { name: '🇧🇩 TAKA',      value: `৳ ${toTaka(newBal)}`,               inline: true },
          { name: '💵 USD',        value: `$${toUSD(newBal)}`,                  inline: true },
        )
        .setColor(0x9b59b6)
        .setFooter({ text: `Set by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── give ──────────────────────────────────────────────────────────────────
    if (sub === 'give') {
      const target  = interaction.options.getUser('user');
      const amount  = interaction.options.getInteger('amount');
      const myBal   = getBalance(interaction.user.id);

      if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot give points to yourself.', ephemeral: true });
      if (target.bot) return interaction.reply({ content: '❌ Cannot give points to a bot.', ephemeral: true });
      if (amount > myBal) return interaction.reply({ content: `❌ You only have **${myBal.toLocaleString()} ZP**. You cannot give more than you have.`, ephemeral: true });

      removeBalance(interaction.user.id, amount);
      const theirBal = addBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('💸 Zenix Points Transferred')
        .addFields(
          { name: '📤 From',       value: `<@${interaction.user.id}>`,          inline: true },
          { name: '📥 To',         value: `<@${target.id}>`,                    inline: true },
          { name: '💎 Amount',     value: `**${amount.toLocaleString()}** ZP`,  inline: true },
          { name: '🇧🇩 TAKA',     value: `৳ ${toTaka(amount)}`,                inline: true },
          { name: '💵 USD',       value: `$${toUSD(amount)}`,                   inline: true },
          { name: 'Your Balance', value: `**${(myBal - amount).toLocaleString()}** ZP`, inline: true },
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

      const medals = ['🥇','🥈','🥉'];
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
