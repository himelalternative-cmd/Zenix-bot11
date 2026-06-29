const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, saveGuildSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orderid')
    .setDescription('Manage order ID prefix')
    .setDefaultMemberPermissions(0)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set the order ID prefix')
        .addStringOption(opt =>
          opt.setName('prefix').setDescription('Prefix (e.g. SHOP)').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const prefix = interaction.options.getString('prefix').toUpperCase().trim();
      const settings = getGuildSettings(interaction.guildId);
      settings.orderIdPrefix = prefix;
      saveGuildSettings(interaction.guildId, settings);
      await interaction.reply({ content: `✅ Order ID prefix set to \`${prefix}\`. Future orders will use \`${prefix}-XXXXXXXX\`.`, ephemeral: true });
    }
  },
};
