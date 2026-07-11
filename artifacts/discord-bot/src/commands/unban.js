const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('user_id').setDescription('The ID of the user to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the unban').setRequired(false)),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const bans = await interaction.guild.bans.fetch().catch(() => null);
    if (!bans?.has(userId)) {
      return interaction.reply({ content: '❌ That user is not banned.', ephemeral: true });
    }

    try {
      await interaction.guild.members.unban(userId, `${reason} — by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('✅ Member Unbanned')
        .addFields(
          { name: 'User ID', value: userId, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unban error:', err.message);
      await interaction.reply({ content: '❌ Failed to unban that user.', ephemeral: true });
    }
  },
};
