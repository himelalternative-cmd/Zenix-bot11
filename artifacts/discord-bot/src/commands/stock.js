const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, saveGuildSettings } = require('../utils/settings');

function itemName(item) {
  return typeof item === 'string' ? item : item.name;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Manage item delivery codes (auto-delivery)')
    .setDefaultMemberPermissions(0)

    // ── add ───────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Add delivery codes to an item (separate with commas)')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('code').setDescription('Codes to add, separated by commas (e.g. KEY1, KEY2, KEY3)').setRequired(true)
        )
    )

    // ── view ──────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('view').setDescription('View all codes currently in stock for an item (numbered list)')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
        )
    )

    // ── edit ──────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('edit').setDescription('Replace a specific code by its number (use /stock view to find the number)')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption(opt =>
          opt.setName('number').setDescription('Code number from /stock view').setRequired(true).setMinValue(1)
        )
        .addStringOption(opt =>
          opt.setName('code').setDescription('The new code to replace it with').setRequired(true)
        )
    )

    // ── remove-code ───────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('remove-code').setDescription('Remove a specific code by its number (use /stock view to find the number)')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption(opt =>
          opt.setName('number').setDescription('Code number from /stock view').setRequired(true).setMinValue(1)
        )
    )

    // ── count ─────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('count').setDescription('Show how many codes are left in stock for an item')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
        )
    )

    // ── clear ─────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('clear').setDescription('Remove ALL remaining codes from an item\'s stock')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)
        )
    ),

  // ── Autocomplete ─────────────────────────────────────────────────────────────
  async autocomplete(interaction) {
    const focused  = interaction.options.getFocused().toLowerCase();
    const settings = getGuildSettings(interaction.guildId);
    const choices  = (settings.items || [])
      .filter(i => itemName(i).toLowerCase().includes(focused))
      .slice(0, 25)
      .map(i => ({ name: itemName(i), value: itemName(i) }));
    await interaction.respond(choices);
  },

  // ── Execute ───────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    const sub      = interaction.options.getSubcommand();

    if (!settings.items) settings.items = [];
    const itemArg = interaction.options.getString('item').trim();
    const idx     = settings.items.findIndex(i => itemName(i).toLowerCase() === itemArg.toLowerCase());

    if (idx === -1 || typeof settings.items[idx] === 'string') {
      return interaction.reply({ content: `❌ Item \`${itemArg}\` not found. Use \`/setup item add\` first.`, ephemeral: true });
    }

    const entry = settings.items[idx];
    if (!entry.stock) entry.stock = [];

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

    if (sub === 'view') {
      if (!entry.stock.length) {
        return interaction.reply({ content: `📦 **${entry.name}** has no codes in stock.`, ephemeral: true });
      }
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

    if (sub === 'edit') {
      const num     = interaction.options.getInteger('number');
      const newCode = interaction.options.getString('code').trim();

      if (num > entry.stock.length) {
        return interaction.reply({
          content: `❌ Number **${num}** is out of range. **${entry.name}** only has **${entry.stock.length}** code${entry.stock.length !== 1 ? 's' : ''}. Use \`/stock view\` to see the list.`,
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

    if (sub === 'remove-code') {
      const num = interaction.options.getInteger('number');

      if (num > entry.stock.length) {
        return interaction.reply({
          content: `❌ Number **${num}** is out of range. **${entry.name}** only has **${entry.stock.length}** code${entry.stock.length !== 1 ? 's' : ''}. Use \`/stock view\` to see the list.`,
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

    if (sub === 'count') {
      const n = entry.stock.length;
      return interaction.reply({
        content: `📦 **${entry.name}** has **${n}** code${n !== 1 ? 's' : ''} remaining in stock.`,
        ephemeral: true,
      });
    }

    if (sub === 'clear') {
      const removed = entry.stock.length;
      entry.stock   = [];
      saveGuildSettings(interaction.guildId, settings);
      return interaction.reply({
        content: `🗑️ Cleared **${removed}** code${removed !== 1 ? 's' : ''} from **${entry.name}**.`,
        ephemeral: true,
      });
    }
  },
};
