const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { getGuildSettings, saveGuildSettings, resolveColor, COLOR_MAP } = require('../utils/settings');

function itemName(item) {
  return typeof item === 'string' ? item : item.name;
}

module.exports = {
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
        .addStringOption(opt => opt.setName('message').setDescription('DM message text').setRequired(true))
        .addBooleanOption(opt => opt.setName('embed').setDescription('Send DM as embed? (default: false)'))
        .addStringOption(opt =>
          opt.setName('color').setDescription('DM embed color')
            .addChoices(...Object.keys(COLOR_MAP).map(c => ({ name: c, value: c })))
        )
    )

    // ── buy-dm ────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('buy-dm').setDescription('Set the DM header sent to buyers after a shop purchase')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Header text. Use {item}, {amount}, {price} as placeholders.')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('footer')
            .setDescription('Footer text shown below the keys (e.g. "Enjoy! Please Vouch 🎁")')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('color').setDescription('Embed color')
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
      const message     = interaction.options.getString('message');
      const embed       = interaction.options.getBoolean('embed') ?? false;
      const colorChoice = interaction.options.getString('color');
      settings.dmMessage = message;
      settings.dmEmbed   = embed;
      if (colorChoice) settings.dmColor = resolveColor(colorChoice);
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({ content: `✅ DM message configured.${embed ? ' Will be sent as an embed.' : ''}`, ephemeral: true });
    }

    // ── buy-dm ─────────────────────────────────────────────────────────────────
    if (sub === 'buy-dm') {
      const message     = interaction.options.getString('message');
      const footer      = interaction.options.getString('footer');
      const colorChoice = interaction.options.getString('color');
      settings.buyDmMessage = message;
      if (footer      !== null) settings.buyDmFooter = footer;
      if (colorChoice !== null) settings.buyDmColor  = resolveColor(colorChoice);
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({
        content: [
          `✅ Buy DM header set.`,
          `> **Header:** ${message}`,
          footer ? `> **Footer:** ${footer}` : '',
          ``,
          `Placeholders: \`{item}\` \`{amount}\` \`{price}\``,
        ].filter(Boolean).join('\n'),
        ephemeral: true,
      });
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
        return interaction.reply({ content: `✅ Added **${name}** to the shop for **${price.toLocaleString()} ZP**.\nUse \`/setup stock add\` to load delivery codes.`, ephemeral: true });
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
