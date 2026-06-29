const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildSettings, saveGuildSettings, getSettings, generateOrderId } = require('../utils/settings');
const { getBalance, removeBalance, toTaka, toUSD } = require('../utils/zenixPoints');
const { logPurchase, getLogChannel } = require('../utils/stockHistory');

function itemName(item) {
  return typeof item === 'string' ? item : item.name;
}

function itemPrice(item) {
  return typeof item === 'object' && item.price != null ? item.price : null;
}

function itemStock(item) {
  return typeof item === 'object' && Array.isArray(item.stock) ? item.stock : [];
}

function fillPlaceholders(template, name, amount, price) {
  return template
    .replace(/\{item\}/gi,   name)
    .replace(/\{amount\}/gi, String(amount))
    .replace(/\{price\}/gi,  price.toLocaleString() + ' ZP');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop using your Zenix Points')
    .addStringOption(opt =>
      opt.setName('item').setDescription('The item you want to buy').setRequired(true).setAutocomplete(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('How many to buy (default: 1)').setRequired(false).setMinValue(1).setMaxValue(10)
    ),

  async autocomplete(interaction) {
    const focused  = interaction.options.getFocused().toLowerCase();
    const settings = getGuildSettings(interaction.guildId);
    const items    = (settings.items || []).filter(i => typeof i === 'object' && i.price != null);
    const choices  = items
      .filter(i => i.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(i => {
        const stockCount = (i.stock || []).length;
        const label      = stockCount > 0
          ? `${i.name}  —  ${i.price.toLocaleString()} ZP  (${stockCount} in stock)`
          : `${i.name}  —  ${i.price.toLocaleString()} ZP  (out of stock)`;
        return { name: label, value: i.name };
      });
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    const items    = settings.items || [];
    const chosen   = interaction.options.getString('item').trim();
    const amount   = interaction.options.getInteger('amount') ?? 1;

    // ── Find item ────────────────────────────────────────────────────────────
    const idx = items.findIndex(i => itemName(i).toLowerCase() === chosen.toLowerCase());
    if (idx === -1) {
      return interaction.reply({
        content: `❌ Item **${chosen}** not found in the shop. Use \`/setup item list\` to see available items.`,
        ephemeral: true,
      });
    }

    const itemEntry = items[idx];
    const name      = itemName(itemEntry);
    const price     = itemPrice(itemEntry);

    if (price === null) {
      return interaction.reply({
        content: `❌ **${name}** has no price set. Ask an admin to re-add it with \`/setup item add\`.`,
        ephemeral: true,
      });
    }

    // ── Check stock ──────────────────────────────────────────────────────────
    const stock = itemStock(itemEntry);
    if (stock.length < amount) {
      return interaction.reply({
        content: `❌ **${name}** only has **${stock.length}** code${stock.length !== 1 ? 's' : ''} left in stock. You requested **${amount}**.`,
        ephemeral: true,
      });
    }

    // ── Check balance ────────────────────────────────────────────────────────
    const totalCost = price * amount;
    const userId    = interaction.user.id;
    const balance   = getBalance(userId);

    if (balance < totalCost) {
      const needed = totalCost - balance;
      const embed  = new EmbedBuilder()
        .setTitle('❌ Insufficient Zenix Points')
        .setColor(0xe74c3c)
        .addFields(
          { name: '🛒 Item',           value: name,                                       inline: true },
          { name: '🔢 Amount',         value: String(amount),                              inline: true },
          { name: '💲 Total Cost',     value: `**${totalCost.toLocaleString()} ZP**`,     inline: true },
          { name: '💎 Your Balance',   value: `**${balance.toLocaleString()} ZP**`,       inline: true },
          { name: '⚠️ Still Needed',  value: `**${needed.toLocaleString()} ZP**`,        inline: true },
          { name: '\u200b',            value: '\u200b',                                    inline: true },
        )
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Deduct balance & pop codes ────────────────────────────────────────────
    const newBalance = removeBalance(userId, totalCost);
    const delivered  = stock.splice(0, amount);   // take from front of queue
    settings.items[idx] = itemEntry;              // write back
    saveGuildSettings(interaction.guildId, settings);

    // ── Public success embed ──────────────────────────────────────────────────
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Purchase Successful!')
      .setColor(0x2ecc71)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '🛒 Item',          value: `**${name}**`,                                                                      inline: true },
        { name: '🔢 Amount',        value: `**${amount}**`,                                                                     inline: true },
        { name: '💲 Total Cost',    value: `**${totalCost.toLocaleString()} ZP** (৳${toTaka(totalCost)} / $${toUSD(totalCost)})`, inline: false },
        { name: '💎 New Balance',   value: `**${newBalance.toLocaleString()} ZP** (৳${toTaka(newBalance)} / $${toUSD(newBalance)})`, inline: false },
      )
      .setFooter({ text: `Purchased by ${interaction.user.username} • Powered by Zenix Realm` })
      .setTimestamp();

    await interaction.reply({ embeds: [successEmbed] });

    // ── Log purchase to stock history ─────────────────────────────────────────
    try {
      logPurchase(interaction.guildId, {
        userId:    userId,
        username:  interaction.user.username,
        item:      name,
        amount,
        totalCost,
        timestamp: Date.now(),
      });

      // Post to the private log channel if one is configured
      const logChannelId = getLogChannel(interaction.guildId);
      if (logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🛒 New Auto-Buy Purchase')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
              { name: 'User',       value: `<@${userId}> (${interaction.user.username})`, inline: true },
              { name: 'Item',       value: `**${name}**`,                                  inline: true },
              { name: 'Amount',     value: `**${amount}**`,                                inline: true },
              { name: 'Total Cost', value: `**${totalCost.toLocaleString()} ZP** (৳${toTaka(totalCost)} / ${toUSD(totalCost)})`, inline: false },
              { name: 'New Balance',value: `**${newBalance.toLocaleString()} ZP**`,        inline: false },
            )
            .setColor(0x2ecc71)
            .setFooter({ text: `Powered by Zenix Realm • ${interaction.guild.name}` })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (err) {
      console.error('[stockhistory] Failed to log purchase:', err.message);
    }

    // ── Post to order channel ─────────────────────────────────────────────────
    try {
      const orderChannelId = settings.orderChannelId;
      if (orderChannelId) {
        const orderChannel = interaction.guild.channels.cache.get(orderChannelId);
        if (orderChannel) {
          const orderId    = generateOrderId(settings.orderIdPrefix || 'ORDER');
          const timestamp  = Math.floor(Date.now() / 1000);
          const orderColor = settings.orderColor ?? 0x010101;

          const orderLines =
            `• Handler : Auto Buy\n` +
            `• Buyer : <@${userId}>\n` +
            `• Item : ${name}${amount > 1 ? ` × ${amount}` : ''}\n` +
            `• Order id : ${orderId}\n` +
            `• Time : <t:${timestamp}:R>`;

          const orderEmbed = new EmbedBuilder()
            .setTitle(settings.orderTitle || '▶ Order Details:')
            .setDescription(orderLines)
            .setColor(orderColor)
            .setFooter({
              text: interaction.guild.name,
              iconURL: interaction.guild.iconURL() ?? undefined,
            })
            .setTimestamp();

          await orderChannel.send({ embeds: [orderEmbed] });

          // Increment order count & update bot status
          settings.orderCount = (settings.orderCount || 0) + 1;
          saveGuildSettings(interaction.guildId, settings);

          const allSettings = getSettings();
          let totalOrders = 0;
          for (const gid of Object.keys(allSettings)) {
            totalOrders += (allSettings[gid].orderCount || 0);
          }
          interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });
        }
      }
    } catch (err) {
      console.error('[buy] Failed to post to order channel:', err.message);
    }

    // ── Auto-delivery DM ──────────────────────────────────────────────────────
    try {
      const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      // Build the key list
      const keyLines = delivered.map((code, i) => `Key ${i + 1} - ${code}`).join('\n');

      // Header line from admin config (or a sensible default)
      const headerTemplate = settings.buyDmMessage || `Thank You For Your Purchase!\nHere is your {amount} {item}`;
      const headerText     = fillPlaceholders(headerTemplate, name, amount, totalCost);

      // Footer line from admin config (or default)
      const footerText = settings.buyDmFooter || 'Enjoy! Please Vouch if everything is ok. 🎁';

      const dmBody = [
        headerText,
        '',
        DIVIDER,
        '',
        keyLines,
        '',
        DIVIDER,
        '',
        footerText,
      ].join('\n');

      const dmColor = settings.buyDmColor ?? 0x010101;

      const dmEmbed = new EmbedBuilder()
        .setDescription(dmBody)
        .setColor(dmColor)
        .setFooter({
          text: interaction.guild.name,
          iconURL: interaction.guild.iconURL() ?? undefined,
        })
        .setTimestamp();

      await interaction.user.send({ embeds: [dmEmbed] });
    } catch {
      // DMs disabled — purchase already succeeded, codes already deducted.
      // Optionally send an ephemeral follow-up so the user can see their keys.
      const keyLines = delivered.map((code, i) => `Key ${i + 1} - ${code}`).join('\n');
      await interaction.followUp({
        content: `⚠️ I couldn't DM you — your DMs may be disabled. Here are your codes:\n\`\`\`\n${keyLines}\n\`\`\``,
        ephemeral: true,
      }).catch(() => {});
    }
  },
};
