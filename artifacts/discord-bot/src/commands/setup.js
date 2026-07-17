const {
  SlashCommandBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { getGuildSettings, saveGuildSettings, resolveColor, COLOR_MAP } = require('../utils/settings');

function itemName(item) {
  return typeof item === 'string' ? item : item.name;
}

// ── Pending setup-modal map ────────────────────────────────────────────────────
// Used only for the dm-message modal (not item add anymore).
const _pendingSetup = new Map();

function _addSetupPending(data) {
  const nonce = Math.random().toString(36).slice(2, 10);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  for (const [k, v] of _pendingSetup) {
    if (v.expiresAt < Date.now()) _pendingSetup.delete(k);
  }
  _pendingSetup.set(nonce, { ...data, expiresAt });
  return nonce;
}

/**
 * Handle the modal submitted after /setup dm-message.
 * customId format: setup_dm_message_modal|<nonce>
 */
async function handleDmMessageModal(interaction) {
  const nonce   = interaction.customId.split('|')[1];
  const pending = _pendingSetup.get(nonce);

  if (!pending || pending.expiresAt < Date.now()) {
    _pendingSetup.delete(nonce);
    return interaction.reply({ content: '❌ This session expired. Please run `/setup dm-message` again.', ephemeral: true });
  }

  _pendingSetup.delete(nonce);
  const { guildId, embed, colorChoice } = pending;

  const message = interaction.fields.getTextInputValue('dm_msg_text').trim();
  if (!message) return interaction.reply({ content: '❌ Message cannot be empty.', ephemeral: true });

  const settings = getGuildSettings(guildId);
  settings.dmMessage = message;
  settings.dmEmbed   = embed;
  if (colorChoice) settings.dmColor = resolveColor(colorChoice);
  saveGuildSettings(guildId, settings);

  return interaction.reply({
    content: `✅ DM message configured.${embed ? ' Will be sent as an embed.' : ''}`,
    ephemeral: true,
  });
}

module.exports = {
  handleDmMessageModal,

  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot')
    .setDefaultMemberPermissions(0)

    // ── title ─────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('title').setDescription('Set the order embed title')
        .addStringOption(opt => opt.setName('title').setDescription('Title text').setRequired(true))
    )

    // ── dm-message ────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('dm-message').setDescription('Configure the DM sent to buyers after an order')
        .addBooleanOption(opt => opt.setName('embed').setDescription('Send DM as embed? (default: false)'))
        .addStringOption(opt =>
          opt.setName('color').setDescription('DM embed color')
            .addChoices(...Object.keys(COLOR_MAP).map(c => ({ name: c, value: c })))
        )
    )

    // ── buy-channel ───────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('buy-channel').setDescription('Set or remove the channel where /buy is allowed (tickets are always allowed)')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('The channel to allow /buy in (leave empty to remove restriction)').setRequired(false)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )

    // ── item group ────────────────────────────────────────────────────────────
    .addSubcommandGroup(group =>
      group.setName('item').setDescription('Manage shop items')

        .addSubcommand(sub =>
          sub.setName('add').setDescription('Add an item to the shop')
            .addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
            .addIntegerOption(opt =>
              opt.setName('price').setDescription('Price in Zenix Points (ZP)').setRequired(true).setMinValue(0)
            )
        )

        .addSubcommand(sub =>
          sub.setName('remove').setDescription('Remove an item from the shop')
            .addStringOption(opt =>
              opt.setName('name').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
        )

        .addSubcommand(sub =>
          sub.setName('list').setDescription('List all shop items and their prices')
        )
    ),

  // ── Autocomplete ────────────────────────────────────────────────────────────
  async autocomplete(interaction) {
    const focused  = interaction.options.getFocused().toLowerCase();
    const settings = getGuildSettings(interaction.guildId);
    const choices  = (settings.items || [])
      .filter(i => itemName(i).toLowerCase().includes(focused))
      .slice(0, 25)
      .map(i => ({ name: itemName(i), value: itemName(i) }));
    await interaction.respond(choices);
  },

  // ── Execute ─────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    const group    = interaction.options.getSubcommandGroup(false);
    const sub      = interaction.options.getSubcommand();

    // ── title ──────────────────────────────────────────────────────────────────
    if (sub === 'title') {
      settings.orderTitle = interaction.options.getString('title');
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({ content: `✅ Order title set to: **${settings.orderTitle}**`, ephemeral: true });
    }

    // ── dm-message ─────────────────────────────────────────────────────────────
    if (sub === 'dm-message') {
      const embed       = interaction.options.getBoolean('embed') ?? false;
      const colorChoice = interaction.options.getString('color');
      const nonce = _addSetupPending({ guildId: interaction.guildId, embed, colorChoice });

      const modal = new ModalBuilder()
        .setCustomId(`setup_dm_message_modal|${nonce}`)
        .setTitle('Configure Order DM Message');

      const msgInput = new TextInputBuilder()
        .setCustomId('dm_msg_text')
        .setLabel('DM message sent to buyers after an order')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Your order is confirmed! Thank you for your purchase.')
        .setRequired(true)
        .setMaxLength(1500);

      modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
      return interaction.showModal(modal);
    }

    // ── buy-channel ────────────────────────────────────────────────────────────
    if (sub === 'buy-channel') {
      const channel = interaction.options.getChannel('channel');
      if (channel) {
        settings.buyChannelId = channel.id;
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({
          content: `✅ **/buy** is now restricted to <#${channel.id}> and ticket channels.\nUsers who try to use it elsewhere will be blocked.`,
          ephemeral: true,
        });
      } else {
        delete settings.buyChannelId;
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({
          content: `✅ **/buy** channel restriction removed — it can now be used anywhere.`,
          ephemeral: true,
        });
      }
    }

    // ── item group ─────────────────────────────────────────────────────────────
    if (group === 'item') {
      if (!settings.items) settings.items = [];

      if (sub === 'add') {
        const name  = interaction.options.getString('name').trim();
        const price = interaction.options.getInteger('price');

        if (settings.items.some(i => itemName(i).toLowerCase() === name.toLowerCase())) {
          return interaction.reply({ content: `⚠️ Item \`${name}\` already exists. Remove it first to update its price.`, ephemeral: true });
        }

        settings.items.push({ name, price, stock: [] });
        saveGuildSettings(interaction.guildId, settings);

        return interaction.reply({
          content: `✅ Added **${name}** to the shop for **${price.toLocaleString()} ZP**.\n\nUse \`/setup stock add\` to load delivery codes.`,
          ephemeral: true,
        });
      }

      if (sub === 'remove') {
        const name   = interaction.options.getString('name').trim();
        const before = settings.items.length;
        settings.items = settings.items.filter(i => itemName(i).toLowerCase() !== name.toLowerCase());
        if (settings.items.length === before) return interaction.reply({ content: `❌ Item \`${name}\` not found.`, ephemeral: true });
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({ content: `✅ Removed **${name}** from the shop.`, ephemeral: true });
      }

      if (sub === 'list') {
        const items = settings.items || [];
        if (!items.length) return interaction.reply({ content: '❌ No items in the shop yet. Use `/setup item add` to add some.', ephemeral: true });
        const list = items.map((item, idx) => {
          const n     = itemName(item);
          const p     = typeof item === 'object' ? item.price : 0;
          const stock = typeof item === 'object' ? (item.stock || []).length : 0;
          return `**${idx + 1}.** ${n} — **${p.toLocaleString()} ZP** | 📦 ${stock} code${stock !== 1 ? 's' : ''} in stock`;
        }).join('\n');
        return interaction.reply({ content: `🛒 **Shop Items:**\n\n${list}`, ephemeral: true });
      }
    }

  },
};

module.exports.handleDmMessageModal = handleDmMessageModal;
