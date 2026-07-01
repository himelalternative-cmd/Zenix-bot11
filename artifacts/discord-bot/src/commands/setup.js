const {
  SlashCommandBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { getGuildSettings, saveGuildSettings, resolveColor, COLOR_MAP } = require('../utils/settings');

function itemName(item) {
  return typeof item === 'string' ? item : item.name;
}

// ── Pending setup-modal map ────────────────────────────────────────────────────
// Generic nonce store for any setup modal (item add, buy-dm, dm-message).
// Entries expire after 10 minutes to prevent memory leaks on dismissed modals.
const _pendingSetup = new Map(); // nonce → { type, ...data, expiresAt }

function _addSetupPending(data) {
  const nonce = Math.random().toString(36).slice(2, 10); // 8-char alphanumeric
  const expiresAt = Date.now() + 10 * 60 * 1000;
  // Lazy cleanup of expired entries
  for (const [k, v] of _pendingSetup) {
    if (v.expiresAt < Date.now()) _pendingSetup.delete(k);
  }
  _pendingSetup.set(nonce, { ...data, expiresAt });
  return nonce;
}

/**
 * Handle the modal submitted after /setup item add.
 * customId format: setup_item_add_modal|<nonce>
 */
async function handleSetupItemAddModal(interaction) {
  const nonce   = interaction.customId.split('|')[1];
  const pending = _pendingSetup.get(nonce);

  if (!pending || pending.expiresAt < Date.now()) {
    _pendingSetup.delete(nonce);
    return interaction.reply({ content: '❌ This item-add session has expired. Please run `/setup item add` again.', ephemeral: true });
  }

  _pendingSetup.delete(nonce);
  const { guildId, name, price } = pending;

  const dmMsg    = interaction.fields.getTextInputValue('item_dm_message').trim();
  const settings = getGuildSettings(guildId);
  if (!settings.items) settings.items = [];

  if (settings.items.some(i => itemName(i).toLowerCase() === name.toLowerCase())) {
    return interaction.reply({ content: `⚠️ Item \`${name}\` already exists.`, ephemeral: true });
  }

  const itemObj = { name, price, stock: [] };
  if (dmMsg) itemObj.dmMessage = dmMsg;

  settings.items.push(itemObj);
  saveGuildSettings(guildId, settings);

  const dmLine = dmMsg
    ? `📨 **Custom DM message saved.**\n> ${dmMsg.slice(0, 120)}${dmMsg.length > 120 ? '…' : ''}`
    : `ℹ️ No custom DM set — will use the global \`/setup buy-dm\` message.`;

  return interaction.reply({
    content: `✅ Added **${name}** to the shop for **${price.toLocaleString()} ZP**.\n${dmLine}\n\nUse \`/setup stock add\` to load delivery codes.`,
    ephemeral: true,
  });
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
  handleSetupItemAddModal,
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
    // message is now collected via a modal (supports Shift+Enter multi-line)
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
    )

    // ── stock group ───────────────────────────────────────────────────────────
    .addSubcommandGroup(group =>
      group.setName('stock').setDescription('Manage item delivery codes (auto-delivery)')

        .addSubcommand(sub =>
          sub.setName('add').setDescription('Add delivery codes to an item (separate with commas)')
            .addStringOption(opt =>
              opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
            .addStringOption(opt =>
              opt.setName('code').setDescription('Codes to add, separated by commas (e.g. KEY1, KEY2, KEY3)').setRequired(true)
            )
        )

        .addSubcommand(sub =>
          sub.setName('view').setDescription('View all codes currently in stock for an item (numbered list)')
            .addStringOption(opt =>
              opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
        )

        .addSubcommand(sub =>
          sub.setName('edit').setDescription('Replace a specific code by its number (use /setup stock view to find the number)')
            .addStringOption(opt =>
              opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
            .addIntegerOption(opt =>
              opt.setName('number').setDescription('Code number from /setup stock view').setRequired(true).setMinValue(1)
            )
            .addStringOption(opt =>
              opt.setName('code').setDescription('The new code to replace it with').setRequired(true)
            )
        )

        .addSubcommand(sub =>
          sub.setName('remove-code').setDescription('Remove a specific code by its number (use /setup stock view to find the number)')
            .addStringOption(opt =>
              opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
            .addIntegerOption(opt =>
              opt.setName('number').setDescription('Code number from /setup stock view').setRequired(true).setMinValue(1)
            )
        )

        .addSubcommand(sub =>
          sub.setName('count').setDescription('Show how many codes are left in stock for an item')
            .addStringOption(opt =>
              opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
        )

        .addSubcommand(sub =>
          sub.setName('clear').setDescription('Remove ALL remaining codes from an item\'s stock')
            .addStringOption(opt =>
              opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
            )
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

        // Show a modal to collect the per-item DM message
        const nonce = _addSetupPending({ guildId: interaction.guildId, name, price });
        const modal = new ModalBuilder()
          .setCustomId(`setup_item_add_modal|${nonce}`)
          .setTitle(`DM Message — ${name.length > 30 ? name.slice(0, 30) + '…' : name}`);

        const dmInput = new TextInputBuilder()
          .setCustomId('item_dm_message')
          .setLabel('Bot DM when buyer purchases this item')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. Thanks for buying {item}! Here is your key. Enjoy 🎁\n\nLeave blank to use the global /setup buy-dm message.')
          .setRequired(false)
          .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(dmInput));
        return interaction.showModal(modal);
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

    // ── stock group ────────────────────────────────────────────────────────────
    if (group === 'stock') {
      if (!settings.items) settings.items = [];
      const itemArg = interaction.options.getString('item').trim();
      const idx     = settings.items.findIndex(i => itemName(i).toLowerCase() === itemArg.toLowerCase());

      if (idx === -1 || typeof settings.items[idx] === 'string') {
        return interaction.reply({ content: `❌ Item \`${itemArg}\` not found. Use \`/setup item add\` first.`, ephemeral: true });
      }

      const entry = settings.items[idx];
      if (!entry.stock) entry.stock = [];

      // ── add ────────────────────────────────────────────────────────────────
      if (sub === 'add') {
        const raw   = interaction.options.getString('code');
        const codes = raw.split(',').map(c => c.trim()).filter(c => c.length > 0);
        if (!codes.length) {
          return interaction.reply({ content: '❌ No valid codes found. Separate multiple codes with commas.', ephemeral: true });
        }
        entry.stock.push(...codes);
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({
          content: `✅ Added **${codes.length}** code${codes.length !== 1 ? 's' : ''} to **${entry.name}**. Total stock: **${entry.stock.length}**.`,
          ephemeral: true,
        });
      }

      // ── view ───────────────────────────────────────────────────────────────
      if (sub === 'view') {
        if (!entry.stock.length) {
          return interaction.reply({ content: `📦 **${entry.name}** has no codes in stock.`, ephemeral: true });
        }
        // Split into chunks of 20 to avoid Discord's 2000-char limit
        const lines  = entry.stock.map((code, i) => `\`${i + 1}.\` ${code}`);
        const chunks = [];
        for (let i = 0; i < lines.length; i += 20) chunks.push(lines.slice(i, i + 20));

        const header = `📦 **${entry.name}** — ${entry.stock.length} code${entry.stock.length !== 1 ? 's' : ''} in stock:\n\n`;
        await interaction.reply({ content: header + chunks[0].join('\n'), ephemeral: true });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i].join('\n'), ephemeral: true });
        }
        return;
      }

      // ── edit ───────────────────────────────────────────────────────────────
      if (sub === 'edit') {
        const num     = interaction.options.getInteger('number');
        const newCode = interaction.options.getString('code').trim();

        if (num > entry.stock.length) {
          return interaction.reply({
            content: `❌ Number **${num}** is out of range. **${entry.name}** only has **${entry.stock.length}** code${entry.stock.length !== 1 ? 's' : ''}. Use \`/setup stock view\` to see the list.`,
            ephemeral: true,
          });
        }

        const oldCode = entry.stock[num - 1];
        entry.stock[num - 1] = newCode;
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({
          content: `✅ Code **#${num}** in **${entry.name}** updated.\n> **Before:** \`${oldCode}\`\n> **After:** \`${newCode}\``,
          ephemeral: true,
        });
      }

      // ── remove-code ────────────────────────────────────────────────────────
      if (sub === 'remove-code') {
        const num = interaction.options.getInteger('number');

        if (num > entry.stock.length) {
          return interaction.reply({
            content: `❌ Number **${num}** is out of range. **${entry.name}** only has **${entry.stock.length}** code${entry.stock.length !== 1 ? 's' : ''}. Use \`/setup stock view\` to see the list.`,
            ephemeral: true,
          });
        }

        const removed = entry.stock.splice(num - 1, 1)[0];
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({
          content: `🗑️ Removed code **#${num}** from **${entry.name}**.\n> \`${removed}\`\nRemaining stock: **${entry.stock.length}**.`,
          ephemeral: true,
        });
      }

      // ── count ──────────────────────────────────────────────────────────────
      if (sub === 'count') {
        const n = entry.stock.length;
        return interaction.reply({
          content: `📦 **${entry.name}** has **${n}** code${n !== 1 ? 's' : ''} remaining in stock.`,
          ephemeral: true,
        });
      }

      // ── clear ──────────────────────────────────────────────────────────────
      if (sub === 'clear') {
        const removed = entry.stock.length;
        entry.stock   = [];
        saveGuildSettings(interaction.guildId, settings);
        return interaction.reply({
          content: `🗑️ Cleared **${removed}** code${removed !== 1 ? 's' : ''} from **${entry.name}**.`,
          ephemeral: true,
        });
      }
    }
  },
};

module.exports.handleSetupItemAddModal = handleSetupItemAddModal;
module.exports.handleDmMessageModal    = handleDmMessageModal;
