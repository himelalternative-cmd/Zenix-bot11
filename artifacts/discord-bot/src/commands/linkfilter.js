const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getLinkFilter, saveLinkFilter } = require('../utils/linkFilterSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkfilter')
    .setDescription('Manage automatic deletion of links posted in the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('enable').setDescription('Delete non-admin messages that contain links (GIFs are still allowed)')
    )
    .addSubcommand(sub =>
      sub.setName('disable').setDescription('Stop automatically deleting links')
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check whether the link filter is on or off')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = getLinkFilter(interaction.guildId);

    if (sub === 'enable') {
      settings.enabled = true;
      saveLinkFilter(interaction.guildId, settings);
      return interaction.reply({ content: '✅ Link filter **enabled**. Non-admin messages containing links (except GIFs) will now be deleted.', ephemeral: true });
    }

    if (sub === 'disable') {
      settings.enabled = false;
      saveLinkFilter(interaction.guildId, settings);
      return interaction.reply({ content: '✅ Link filter **disabled**. Links will no longer be removed automatically.', ephemeral: true });
    }

    if (sub === 'status') {
      const embed = new EmbedBuilder()
        .setTitle('🔗 Link Filter Status')
        .setDescription(settings.enabled
          ? 'Currently **enabled** — non-admin messages with links (except GIFs) are deleted automatically.'
          : 'Currently **disabled**.')
        .setColor(settings.enabled ? 0x2ecc71 : 0xe74c3c)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
