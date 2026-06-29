const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getLogChannel, setLogChannel, getHistory, clearHistory } = require('../utils/stockHistory');
const { toTaka, toUSD } = require('../utils/zenixPoints');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stockhistory')
    .setDescription('Track and view auto-buy purchase history')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // set-channel
    .addSubcommand(sub =>
      sub.setName('set-channel')
        .setDescription('Set the private channel where every purchase is logged')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Private channel to send purchase logs to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )

    // view
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View purchase history')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Filter by a specific user (optional)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('page')
            .setDescription('Page number (default: 1)')
            .setMinValue(1)
            .setRequired(false)
        )
    )

    // clear
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Clear all purchase history for this server')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── set-channel ────────────────────────────────────────────────────────────
    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel');
      setLogChannel(interaction.guildId, channel.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Stock History Channel Set')
        .setDescription(`Every auto-buy purchase will now be logged privately in ${channel}.`)
        .setColor(0x2ecc71)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── view ───────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const filterUser = interaction.options.getUser('user');
      const page       = interaction.options.getInteger('page') ?? 1;
      const perPage    = 10;

      const { entries, total } = getHistory(interaction.guildId, {
        page,
        perPage,
        userId: filterUser?.id ?? null,
      });

      if (total === 0) {
        const msg = filterUser
          ? `📭 No purchases found for <@${filterUser.id}>.`
          : '📭 No purchase history yet. Once users buy items with `/buy`, they will show up here.';
        return interaction.reply({ content: msg, ephemeral: true });
      }

      const totalPages = Math.ceil(total / perPage);

      const lines = entries.map((e, i) => {
        const num  = (page - 1) * perPage + i + 1;
        const time = `<t:${Math.floor(e.timestamp / 1000)}:R>`;
        return (
          `**#${num}** <@${e.userId}> (**${e.username}**)\n` +
          `┣ Item: **${e.item}** × ${e.amount}\n` +
          `┣ Cost: **${e.totalCost.toLocaleString()} ZP** (৳${toTaka(e.totalCost)} / $${toUSD(e.totalCost)})\n` +
          `┗ ${time}`
        );
      });

      const embed = new EmbedBuilder()
        .setTitle(`🛒 Stock Purchase History${filterUser ? ` — ${filterUser.username}` : ''}`)
        .setDescription(lines.join('\n\n'))
        .setColor(0x010101)
        .setFooter({ text: `Page ${page}/${totalPages} • ${total} total purchase${total !== 1 ? 's' : ''} • Powered by Zenix Realm` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── clear ──────────────────────────────────────────────────────────────────
    if (sub === 'clear') {
      clearHistory(interaction.guildId);
      return interaction.reply({ content: '🗑️ Purchase history cleared.', ephemeral: true });
    }
  },
};
