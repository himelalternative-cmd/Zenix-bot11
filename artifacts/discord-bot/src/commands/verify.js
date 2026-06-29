const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getGuildVerify, saveGuildVerify, clearGuildVerify } = require('../utils/verifySettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Set up the verification system')
      .addChannelOption(o => o.setName('channel').setDescription('Verification channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to give upon verification').setRequired(true))
      .addChannelOption(o => o.setName('log_channel').setDescription('Log channel for verifications').addChannelTypes(ChannelType.GuildText).setRequired(false))
      .addBooleanOption(o => o.setName('captcha').setDescription('Enable CAPTCHA verification (default: false)').setRequired(false))
      .addIntegerOption(o => o.setName('min_age_days').setDescription('Minimum account age in days (0 = no limit)').setMinValue(0).setMaxValue(30).setRequired(false))
    )
    .addSubcommand(s => s.setName('panel').setDescription('Post the verification panel to the configured channel'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the verification system'))
    .addSubcommand(s => s.setName('config').setDescription('View current verification configuration')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── setup ──────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const channel    = interaction.options.getChannel('channel');
      const role       = interaction.options.getRole('role');
      const logChannel = interaction.options.getChannel('log_channel');
      const captcha    = interaction.options.getBoolean('captcha') ?? false;
      const minAge     = interaction.options.getInteger('min_age_days') ?? 0;

      saveGuildVerify(interaction.guild.id, {
        enabled:      true,
        channelId:    channel.id,
        roleId:       role.id,
        logChannelId: logChannel?.id || null,
        captcha,
        minAgeDays:   minAge,
        color:        0x010101,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Verification Setup Complete')
        .addFields(
          { name: 'Channel',      value: `<#${channel.id}>`,         inline: true },
          { name: 'Role',         value: `<@&${role.id}>`,           inline: true },
          { name: 'Log Channel',  value: logChannel ? `<#${logChannel.id}>` : 'None', inline: true },
          { name: 'CAPTCHA',      value: captcha ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Min Age',      value: minAge > 0 ? `${minAge} day(s)` : 'No limit', inline: true },
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'Run /verify panel to post the panel.' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── panel ──────────────────────────────────────────────────────────────────
    if (sub === 'panel') {
      const settings = getGuildVerify(interaction.guild.id);
      if (!settings?.enabled) {
        return interaction.reply({ content: '❌ Verification is not set up. Run `/verify setup` first.', ephemeral: true });
      }

      const ch = interaction.guild.channels.cache.get(settings.channelId);
      if (!ch) {
        return interaction.reply({ content: '❌ Verification channel not found. Run `/verify setup` again.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Server Verification')
        .setDescription(
          'Click the button below to verify yourself and gain access to the server.\n\n' +
          (settings.captcha ? '🔒 **CAPTCHA** verification is required.\n' : '') +
          (settings.minAgeDays > 0 ? `📅 Your account must be at least **${settings.minAgeDays} day(s)** old.\n` : '')
        )
        .setColor(settings.color || 0x010101)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_btn')
          .setLabel('Verify')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
      );

      await ch.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `✅ Verification panel posted in <#${ch.id}>.`, ephemeral: true });
    }

    // ── disable ────────────────────────────────────────────────────────────────
    if (sub === 'disable') {
      clearGuildVerify(interaction.guild.id);
      return interaction.reply({ content: '✅ Verification system disabled.', ephemeral: true });
    }

    // ── config ─────────────────────────────────────────────────────────────────
    if (sub === 'config') {
      const settings = getGuildVerify(interaction.guild.id);
      if (!settings?.enabled) {
        return interaction.reply({ content: '❌ Verification is not configured on this server.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Verification Config')
        .addFields(
          { name: 'Status',       value: '✅ Enabled',                         inline: true },
          { name: 'Channel',      value: `<#${settings.channelId}>`,           inline: true },
          { name: 'Role',         value: `<@&${settings.roleId}>`,             inline: true },
          { name: 'Log Channel',  value: settings.logChannelId ? `<#${settings.logChannelId}>` : 'None', inline: true },
          { name: 'CAPTCHA',      value: settings.captcha ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Min Age',      value: settings.minAgeDays > 0 ? `${settings.minAgeDays} day(s)` : 'No limit', inline: true },
        )
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
