const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { getGuildSettings, saveGuildSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Server configuration')
    .setDefaultMemberPermissions(0)
    .addSubcommandGroup(group =>
      group
        .setName('order')
        .setDescription('Order settings')
        .addSubcommand(sub =>
          sub
            .setName('channel')
            .setDescription('Set which channel orders are posted to')
            .addChannelOption(opt =>
              opt
                .setName('channel')
                .setDescription('The order channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'order' && sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      const settings = getGuildSettings(interaction.guildId);
      settings.orderChannelId = channel.id;
      saveGuildSettings(interaction.guildId, settings);
      await interaction.reply({ content: `✅ Order channel set to ${channel}.`, ephemeral: true });
    }
  },
};
