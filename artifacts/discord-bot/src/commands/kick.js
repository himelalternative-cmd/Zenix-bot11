const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('The member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the kick').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot kick yourself.', ephemeral: true });
    }
    if (target.id === interaction.client.user.id) {
      return interaction.reply({ content: '❌ I cannot kick myself.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
    }
    if (!member.kickable) {
      return interaction.reply({ content: '❌ I cannot kick that member — check role hierarchy.', ephemeral: true });
    }

    const modMember = interaction.member;
    if (
      modMember.id !== interaction.guild.ownerId &&
      member.roles.highest.position >= modMember.roles.highest.position
    ) {
      return interaction.reply({ content: '❌ You cannot kick a member with an equal or higher role than you.', ephemeral: true });
    }

    try {
      await target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`👢 You were kicked from ${interaction.guild.name}`)
            .addFields({ name: 'Reason', value: reason })
            .setColor(0x010101)
            .setTimestamp(),
        ],
      }).catch(() => {});

      await member.kick(`${reason} — by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('👢 Member Kicked')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kick error:', err.message);
      await interaction.reply({ content: '❌ Failed to kick that member.', ephemeral: true });
    }
  },
};
