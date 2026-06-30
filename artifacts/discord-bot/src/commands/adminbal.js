const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getBalance, setBalance, addBalance, removeBalance, toTaka, toUSD } = require('../utils/zenixPoints');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminbal')
    .setDescription('Manage user Zenix Points balances [Admin only]')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // ── add ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add Zenix Points to a user')
      .addUserOption(o => o.setName('user').setDescription('User to give points to').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount of Zenix Points to add').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for adding points').setRequired(false))
    )

    // ── remove ────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove Zenix Points from a user')
      .addUserOption(o => o.setName('user').setDescription('User to remove points from').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount of Zenix Points to remove').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for removing points').setRequired(false))
    )

    // ── set ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('set')
      .setDescription("Set a user's Zenix Points to an exact amount")
      .addUserOption(o => o.setName('user').setDescription('User to set points for').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('New balance amount').setMinValue(0).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── add ───────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (target.bot) return interaction.reply({ content: '❌ Cannot give points to a bot.', ephemeral: true });

      const newBal = addBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('✅ Zenix Points Added')
        .addFields(
          { name: '👤 User',        value: `<@${target.id}>`,                   inline: true },
          { name: '➕ Added',       value: `**+${amount.toLocaleString()}** ZP`, inline: true },
          { name: '💎 New Balance', value: `**${newBal.toLocaleString()}** ZP`,  inline: true },
          { name: '🇧🇩 TAKA',      value: `৳ ${toTaka(newBal)}`,                inline: true },
          { name: '💵 USD',         value: `$${toUSD(newBal)}`,                  inline: true },
          { name: '📝 Reason',      value: reason,                               inline: false },
        )
        .setColor(0x2ecc71)
        .setFooter({ text: `Added by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const target  = interaction.options.getUser('user');
      const amount  = interaction.options.getInteger('amount');
      const reason  = interaction.options.getString('reason') || 'No reason provided';

      if (target.bot) return interaction.reply({ content: '❌ Cannot remove points from a bot.', ephemeral: true });

      const current = getBalance(target.id);

      if (amount > current) {
        return interaction.reply({
          content: `❌ <@${target.id}> only has **${current.toLocaleString()} ZP**. Cannot remove more than available.`,
          ephemeral: true,
        });
      }

      const newBal = removeBalance(target.id, amount);

      const embed = new EmbedBuilder()
        .setTitle('✅ Zenix Points Removed')
        .addFields(
          { name: '👤 User',        value: `<@${target.id}>`,                   inline: true },
          { name: '➖ Removed',     value: `**-${amount.toLocaleString()}** ZP`, inline: true },
          { name: '💎 New Balance', value: `**${newBal.toLocaleString()}** ZP`,  inline: true },
          { name: '🇧🇩 TAKA',      value: `৳ ${toTaka(newBal)}`,                inline: true },
          { name: '💵 USD',         value: `$${toUSD(newBal)}`,                  inline: true },
          { name: '📝 Reason',      value: reason,                               inline: false },
        )
        .setColor(0xe74c3c)
        .setFooter({ text: `Removed by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── set ───────────────────────────────────────────────────────────────────
    if (sub === 'set') {
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
          { name: '💵 USD',         value: `$${toUSD(newBal)}`,                 inline: true },
        )
        .setColor(0x9b59b6)
        .setFooter({ text: `Set by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
