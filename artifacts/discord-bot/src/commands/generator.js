const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, saveGuildSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generator')
    .setDescription('Generator system configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup(group =>
      group
        .setName('role')
        .setDescription('Role settings for the generator')
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('Set which role is allowed to use /generate')
            .addRoleOption(opt =>
              opt
                .setName('role')
                .setDescription('The role that can use /generate')
                .setRequired(true)
            )
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();

    if (group === 'role' && sub === 'set') {
      const role     = interaction.options.getRole('role');
      const settings = getGuildSettings(interaction.guildId);
      settings.generatorRoleId = role.id;
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({
        content: `✅ Generator access set to **${role.name}**.\nMembers with that role can now use \`/generate\`.`,
        ephemeral: true,
      });
    }
  },
};
