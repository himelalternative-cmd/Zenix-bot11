const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getWarnings, clearWarnings } = require('../utils/moderationSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View or clear a member\'s warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List a member\'s warnings')
      .addUserOption(o => o.setName('user').setDescription('The member to check').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('clear')
      .setDescription('Clear all warnings for a member')
      .addUserOption(o => o.setName('user').setDescription('The member to clear').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user');

    if (sub === 'list') {
      const warnings = getWarnings(interaction.guildId, target.id);

      if (!warnings.length) {
        return interaction.reply({ content: `ℹ️ **${target.tag}** has no warnings.`, ephemeral: true });
      }

      const description = warnings
        .map((w, i) => `**#${i + 1}** — ${w.reason}\n<@${w.moderatorId}> • <t:${Math.floor(w.timestamp / 1000)}:R>`)
        .join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings for ${target.tag}`)
        .setDescription(description)
        .setColor(0xf1c40f)
        .setFooter({ text: `Total: ${warnings.length} • Powered by Zenix Realm` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'clear') {
      const count = clearWarnings(interaction.guildId, target.id);
      return interaction.reply({
        content: count
          ? `✅ Cleared **${count}** warning(s) for **${target.tag}**.`
          : `ℹ️ **${target.tag}** had no warnings to clear.`,
        ephemeral: true,
      });
    }
  },
};
