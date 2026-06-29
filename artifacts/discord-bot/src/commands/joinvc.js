const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { getGuildSettings, saveGuildSettings } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('joinvc')
    .setDescription('Make the bot join a voice channel and stay 24/7')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The voice channel to join')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const channel = interaction.options.getChannel('channel');

    if (!channel.joinable) {
      return interaction.reply({ content: '❌ I don\'t have permission to join that channel.', ephemeral: true });
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    // Save to settings so bot re-joins on restart
    const settings = getGuildSettings(interaction.guildId);
    settings.vcChannelId = channel.id;
    saveGuildSettings(interaction.guildId, settings);

    // Store connection on client for auto-reconnect
    if (!client.vcConnections) client.vcConnections = new Map();
    client.vcConnections.set(interaction.guildId, { channelId: channel.id, connection });

    // Auto-reconnect if kicked/disconnected
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        // Truly disconnected — reconnect after short delay
        setTimeout(() => {
          try {
            const newConn = joinVoiceChannel({
              channelId: channel.id,
              guildId: interaction.guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
              selfDeaf: true,
              selfMute: true,
            });
            client.vcConnections.set(interaction.guildId, { channelId: channel.id, connection: newConn });
          } catch {}
        }, 3_000);
      }
    });

    await interaction.reply({
      content: `✅ Joined **${channel.name}** and will stay 24/7.\nUse \`/leavevc\` to disconnect.`,
      ephemeral: true,
    });
  },
};
