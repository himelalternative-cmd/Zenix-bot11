const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addWarning } = require('../utils/moderationSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('The member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot warn yourself.', ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: '❌ You cannot warn a bot.', ephemeral: true });
    }

    const warnings = addWarning(interaction.guildId, target.id, {
      reason,
      moderatorId: interaction.user.id,
    });

    await target.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`⚠️ You were warned in ${interaction.guild.name}`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: `${warnings.length}` },
          )
          .setColor(0xf1c40f)
          .setTimestamp(),
      ],
    }).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Member Warned')
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Total Warnings', value: `${warnings.length}`, inline: true },
        { name: 'Reason', value: reason },
      )
      .setColor(0xf1c40f)
      .setFooter({ text: 'Powered by Zenix Realm' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
