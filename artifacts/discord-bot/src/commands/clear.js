const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, saveGuildSettings, getSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Reset commands')
    .setDefaultMemberPermissions(0)
    .addSubcommand(sub =>
      sub.setName('order').setDescription('Reset the order count to 0')
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'order') {
      const settings = getGuildSettings(interaction.guildId);
      settings.orderCount = 0;
      saveGuildSettings(interaction.guildId, settings);

      const allSettings = getSettings();
      let totalOrders = 0;
      for (const gid of Object.keys(allSettings)) {
        totalOrders += (allSettings[gid].orderCount || 0);
      }
      client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });

      await interaction.reply({ content: '✅ Order count reset to **0**.', ephemeral: true });
    }
  },
};
