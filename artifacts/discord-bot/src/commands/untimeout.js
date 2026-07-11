const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove an active timeout from a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('The member to remove the timeout from').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for removing the timeout').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
    }
    if (!member.communicationDisabledUntil) {
      return interaction.reply({ content: 'ℹ️ That member is not currently timed out.', ephemeral: true });
    }
    if (!member.moderatable) {
      return interaction.reply({ content: '❌ I cannot modify that member — check role hierarchy.', ephemeral: true });
    }

    try {
      await member.timeout(null, `${reason} — by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('🔊 Timeout Removed')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Untimeout error:', err.message);
      await interaction.reply({ content: '❌ Failed to remove the timeout.', ephemeral: true });
    }
  },
};
