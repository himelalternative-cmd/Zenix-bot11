const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { getGuildSettings, saveGuildSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leavevc')
    .setDescription('Make the bot leave the voice channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const connection = getVoiceConnection(interaction.guildId);

    // Clear saved VC so bot doesn't rejoin on restart
    const settings = getGuildSettings(interaction.guildId);
    delete settings.vcChannelId;
    saveGuildSettings(interaction.guildId, settings);

    if (client.vcConnections) client.vcConnections.delete(interaction.guildId);

    if (!connection) {
      return interaction.reply({ content: '❌ I\'m not in a voice channel.', ephemeral: true });
    }

    connection.destroy();
    await interaction.reply({ content: '✅ Left the voice channel.', ephemeral: true });
  },
};
