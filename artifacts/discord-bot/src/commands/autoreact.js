const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuildAutoReact, setChannelAutoReact } = require('../utils/autoReactSettings');

// Parse a space/comma-separated string of emojis into an array
function parseEmojis(raw) {
  return raw
    .split(/[\s,]+/)
    .map(e => e.trim())
    .filter(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoreact')
    .setDescription('Auto-react to every message posted in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    // set-channel
    .addSubcommand(sub =>
      sub.setName('set-channel')
        .setDescription('Enable auto-react in a channel with one or more emojis')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to auto-react in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('emojis')
            .setDescription('Emoji(s) to react with, space or comma separated (e.g. 👍 ❤️ 😂)')
            .setRequired(true)
        )
    )

    // remove
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Disable auto-react in a channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to remove auto-react from')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )

    // list
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all channels with auto-react enabled')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── set-channel ────────────────────────────────────────────────────────────
    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel');
      const raw     = interaction.options.getString('emojis');
      const emojis  = parseEmojis(raw);

      if (emojis.length === 0) {
        return interaction.reply({ content: '❌ No valid emojis found. Please provide at least one emoji.', ephemeral: true });
      }
      if (emojis.length > 5) {
        return interaction.reply({ content: '❌ Maximum 5 emojis per channel.', ephemeral: true });
      }

      // Quick sanity-check: try reacting to validate emojis
      // (we skip this since custom emojis from other servers fail fetch — just store and let the handler deal with it)
      setChannelAutoReact(interaction.guildId, channel.id, emojis);

      const embed = new EmbedBuilder()
        .setTitle('✅ Auto-React Enabled')
        .setDescription(`I will now react to every message in ${channel} with: ${emojis.join('  ')}`)
        .setColor(0x2ecc71)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel');
      const configs = getGuildAutoReact(interaction.guildId);

      if (!configs[channel.id]) {
        return interaction.reply({ content: `❌ Auto-react is not enabled in ${channel}.`, ephemeral: true });
      }

      setChannelAutoReact(interaction.guildId, channel.id, []);

      return interaction.reply({
        content: `✅ Auto-react disabled in ${channel}.`,
        ephemeral: true,
      });
    }

    // ── list ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const configs = getGuildAutoReact(interaction.guildId);
      const entries = Object.entries(configs);

      if (entries.length === 0) {
        return interaction.reply({ content: '📭 No channels have auto-react enabled.', ephemeral: true });
      }

      const lines = entries.map(([chId, cfg]) => `<#${chId}> — ${cfg.emojis.join('  ')}`);

      const embed = new EmbedBuilder()
        .setTitle('⚡ Auto-React Channels')
        .setDescription(lines.join('\n'))
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
