const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const {
  getGuildSettings,
  saveGuildSettings,
  resolveColor,
  randomDmColor,
  generateOrderId,
  COLOR_MAP,
} = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Post a completed order to the order channel')
    .setDefaultMemberPermissions(0)
    .addStringOption(opt =>
      opt.setName('handler').setDescription('Handler name').setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('buyer').setDescription('Buyer (Discord user)').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('item').setDescription('Item purchased').setRequired(true).setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('color')
        .setDescription('Embed color (saves as default)')
        .setRequired(false)
        .addChoices(...Object.keys(COLOR_MAP).map(c => ({ name: c, value: c })))
    )
    .addBooleanOption(opt =>
      opt.setName('embed').setDescription('Send as embed? (default: true)').setRequired(false)
    ),

  async autocomplete(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = (settings.items || [])
      .map(i => (typeof i === 'string' ? i : i.name))
      .filter(name => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(name => ({ name, value: name }));
    await interaction.respond(choices);
  },

  async execute(interaction, client) {
    const settings = getGuildSettings(interaction.guildId);

    const handler = interaction.options.getString('handler');
    const buyer = interaction.options.getUser('buyer');
    const item = interaction.options.getString('item');
    const colorChoice = interaction.options.getString('color');
    const useEmbed = interaction.options.getBoolean('embed') ?? true;

    // Save color if new one was picked
    if (colorChoice) {
      settings.orderColor = resolveColor(colorChoice);
    }

    const orderId = generateOrderId(settings.orderIdPrefix || 'ORDER');
    const timestamp = Math.floor(Date.now() / 1000);

    const guild = interaction.guild;
    const orderColor = settings.orderColor ?? 0x010101;

    const orderLines =
      `• Handler : ${handler}\n` +
      `• Buyer : <@${buyer.id}>\n` +
      `• Item : ${item}\n` +
      `• Order id : ${orderId}\n` +
      `• Time : <t:${timestamp}:R>`;

    const embed = new EmbedBuilder()
      .setTitle(settings.orderTitle || '▶ Order Details:')
      .setDescription(orderLines)
      .setColor(orderColor)
      .setFooter({
        text: guild.name,
        iconURL: guild.iconURL() ?? undefined,
      })
      .setTimestamp();

    // Post to order channel
    const channelId = settings.orderChannelId;
    if (!channelId) {
      await interaction.reply({ content: '❌ No order channel configured. Use `/set order channel` first.', ephemeral: true });
      return;
    }

    const orderChannel = guild.channels.cache.get(channelId);
    if (!orderChannel) {
      await interaction.reply({ content: '❌ Order channel not found. Please reconfigure it.', ephemeral: true });
      return;
    }

    if (useEmbed) {
      await orderChannel.send({ embeds: [embed] });
    } else {
      await orderChannel.send({ content: orderLines });
    }

    // Increment order count
    settings.orderCount = (settings.orderCount || 0) + 1;
    saveGuildSettings(interaction.guildId, settings);

    // Update bot status
    const allSettings = require('../utils/settings').getSettings();
    let totalOrders = 0;
    for (const gid of Object.keys(allSettings)) {
      totalOrders += (allSettings[gid].orderCount || 0);
    }
    client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });

    // DM the buyer
    if (settings.dmMessage) {
      try {
        const dmColor = settings.dmColor ?? randomDmColor();
        if (settings.dmEmbed) {
          const dmEmbed = new EmbedBuilder()
            .setDescription(
              `${settings.dmMessage}\n\n**${settings.orderTitle || '▶ Order Details:'}**\n${orderLines}`
            )
            .setColor(dmColor)
            .setFooter({
              text: guild.name,
              iconURL: guild.iconURL() ?? undefined,
            })
            .setTimestamp();
          await buyer.send({ embeds: [dmEmbed] });
        } else {
          await buyer.send({ content: settings.dmMessage, embeds: [embed] });
        }
      } catch {
        // DM failed silently
      }
    }

    await interaction.reply({ content: `✅ Order posted! Order ID: \`${orderId}\``, ephemeral: true });
  },
};
