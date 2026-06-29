const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, saveGuildSettings, getSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add to counts')
    .setDefaultMemberPermissions(0)
    .addSubcommand(sub =>
      sub
        .setName('order')
        .setDescription('Add a number to the order count')
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1)
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'order') {
      const amount = interaction.options.getInteger('amount');
      const settings = getGuildSettings(interaction.guildId);
      settings.orderCount = (settings.orderCount || 0) + amount;
      saveGuildSettings(interaction.guildId, settings);

      const allSettings = getSettings();
      let totalOrders = 0;
      for (const gid of Object.keys(allSettings)) {
        totalOrders += (allSettings[gid].orderCount || 0);
      }
      client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });

      await interaction.reply({
        content: `✅ Added **${amount}** to the order count. New count: **${settings.orderCount}**`,
        ephemeral: true,
      });
    }
  },
};
