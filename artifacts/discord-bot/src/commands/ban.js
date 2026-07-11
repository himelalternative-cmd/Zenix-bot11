const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('The member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban').setRequired(false))
    .addIntegerOption(o => o
      .setName('delete_messages')
      .setDescription('Delete this many days of their messages (0-7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_messages') ?? 0;

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot ban yourself.', ephemeral: true });
    }
    if (target.id === interaction.client.user.id) {
      return interaction.reply({ content: '❌ I cannot ban myself.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (member) {
      if (!member.bannable) {
        return interaction.reply({ content: '❌ I cannot ban that member — check role hierarchy.', ephemeral: true });
      }
      const modMember = interaction.member;
      if (
        modMember.id !== interaction.guild.ownerId &&
        member.roles.highest.position >= modMember.roles.highest.position
      ) {
        return interaction.reply({ content: '❌ You cannot ban a member with an equal or higher role than you.', ephemeral: true });
      }
    }

    try {
      await target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🔨 You were banned from ${interaction.guild.name}`)
            .addFields({ name: 'Reason', value: reason })
            .setColor(0x010101)
            .setTimestamp(),
        ],
      }).catch(() => {});

      await interaction.guild.members.ban(target.id, {
        deleteMessageSeconds: deleteDays * 86400,
        reason: `${reason} — by ${interaction.user.tag}`,
      });

      const embed = new EmbedBuilder()
        .setTitle('🔨 Member Banned')
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
      console.error('Ban error:', err.message);
      await interaction.reply({ content: '❌ Failed to ban that member.', ephemeral: true });
    }
  },
};
