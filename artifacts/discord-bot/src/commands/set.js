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
            .setDescription('Set which channel completed orders are logged to')
            .addChannelOption(opt =>
              opt
                .setName('channel')
                .setDescription('The order log channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('pending')
        .setDescription('Set the private channel where pending Robux orders appear for admin confirmation')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('The private pending-orders channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('botcmd')
        .setDescription('Set the bot-commands channel where members can use !buy robux outside tickets')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('The bot commands channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();

    if (group === 'order' && sub === 'channel') {
      const channel  = interaction.options.getChannel('channel');
      const settings = getGuildSettings(interaction.guildId);
      settings.orderChannelId = channel.id;
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({ content: `✅ Order log channel set to ${channel}.`, ephemeral: true });
    }

    if (sub === 'pending') {
      const channel  = interaction.options.getChannel('channel');
      const settings = getGuildSettings(interaction.guildId);
      settings.pendingChannelId = channel.id;
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({
        content: `✅ Pending orders channel set to ${channel}.\nAll new \`!buy robux\` orders will appear here for admin confirmation.`,
        ephemeral: true,
      });
    }

    if (sub === 'botcmd') {
      const channel  = interaction.options.getChannel('channel');
      const settings = getGuildSettings(interaction.guildId);
      settings.botCmdChannelId = channel.id;
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({
        content: `✅ Bot commands channel set to ${channel}.\nMembers can now use \`!buy robux\` there (as well as inside tickets).`,
        ephemeral: true,
      });
    }
  },
};
