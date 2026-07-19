const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handlePayCommand } = require('./payHandler');
const { handleRbxAccCommand, handleIggCommand } = require('./rbxHandler');
const { getOwnerByChannel, removeTicket } = require('../utils/tickets');
const { isTicketDone } = require('./ticketHandler');

const CONVERSION_RATE = 0.9; // 1 Robux = 0.9 BDT

async function handlePrefix(message) {
  const content = message.content.trim();

  // !close — close the current ticket channel (admin only)
  if (/^!close$/i.test(content)) {
    const channel = message.channel;
    const guild   = message.guild;
    const member  = message.member;

    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: '❌ Only administrators can close tickets.' });
    }

    const ownerId = getOwnerByChannel(channel.id);
    if (!ownerId) {
      return message.reply({ content: '❌ This channel is not a ticket.' });
    }

    // Lock channel — remove send perms from everyone & ticket owner
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
    await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true, SendMessages: false }).catch(() => {});

    // Disable the Close button on the original ticket embed if present
    try {
      const msgs = await channel.messages.fetch({ limit: 20 });
      const original = msgs.find(m =>
        m.author.id === guild.members.me.id &&
        m.components.some(row => row.components.some(c => c.customId === 'ticket_close'))
      );
      if (original) {
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setEmoji('📌').setStyle(ButtonStyle.Primary).setDisabled(false),
          new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary).setDisabled(false),
          new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setEmoji('🗑').setStyle(ButtonStyle.Danger).setDisabled(false),
          new ButtonBuilder().setCustomId('ticket_done').setLabel('Mark as Done').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(false)
        );
        await original.edit({ components: [disabledRow] }).catch(() => {});
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setTitle('🔒 Ticket Closed')
      .setDescription(
        `Closed by <@${message.author.id}>.\n\n` +
        `Use 🗑 **Delete** to remove this ticket or 📄 **Transcript** to save the log.`
      )
      .setColor(0xe74c3c)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // !dlt — permanently delete the current ticket channel (admin only)
  if (/^!dlt$/i.test(content)) {
    const channel = message.channel;
    const member  = message.member;

    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: '❌ Only administrators can delete tickets.' });
    }

    const ownerId = getOwnerByChannel(channel.id);
    if (!ownerId) {
      return message.reply({ content: '❌ This channel is not a ticket.' });
    }

    removeTicket(ownerId);

    const embed = new EmbedBuilder()
      .setTitle('🗑 Deleting Ticket')
      .setDescription(`This ticket will be deleted in **3 seconds**.\nDeleted by <@${message.author.id}>.`)
      .setColor(0xe74c3c)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    setTimeout(() => channel.delete().catch(() => {}), 3000);
    return;
  }

  // !rbxacc — send the Robux purchase embed (admin only)
  if (/^!rbxacc$/i.test(content)) {
    await handleRbxAccCommand(message);
    return;
  }

  // !igg — send the In-Game Gifting embed (admin only)
  if (/^!igg$/i.test(content)) {
    await handleIggCommand(message);
    return;
  }

  // !Pay command — optional amount: !pay  |  !pay 500  |  !pay $500  |  !pay 500BDT
  if (/^!pay(\s|$)/i.test(content)) {
    // Don't show the Submit Payment button if this ticket is already marked as done
    if (isTicketDone(message.channel.id)) {
      return message.reply({ content: '❌ This ticket has been marked as done. No further payment submissions are accepted.' });
    }
    const amountRaw = content.replace(/^!pay\s*/i, '').trim() || null;
    await handlePayCommand(message, amountRaw);
    return;
  }

  // Robux conversion: !<amount> BDT|TK|T  or  !<amount> RB|RBX|Robux
  const match = content.match(/^!(\d+(?:\.\d+)?)\s+(\S+)$/i);
  if (!match) return;

  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // BDT → Robux
  if (['bdt', 'tk', 't'].includes(unit)) {
    const robux = (amount / CONVERSION_RATE).toFixed(2);
    const embed = new EmbedBuilder()
      .setTitle('💱 Robux Conversion')
      .setDescription(`With **${amount} BDT** You Can Buy **${robux} Robux**`)
      .setColor(0x5865f2)
      .setFooter({ text: `Rate: 1 Robux = ${CONVERSION_RATE} BDT` })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }

  // Robux → BDT
  if (['rb', 'rbx', 'robux'].includes(unit)) {
    const bdt = (amount * CONVERSION_RATE).toFixed(2);
    const embed = new EmbedBuilder()
      .setTitle('💱 Robux Conversion')
      .setDescription(`**${amount} Robux** Will Cost You **${bdt} TAKA**`)
      .setColor(0x5865f2)
      .setFooter({ text: `Rate: 1 Robux = ${CONVERSION_RATE} BDT` })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }

  // Detect if they tried a conversion but used wrong unit
  if (/^!\d+(?:\.\d+)?/.test(content)) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Invalid Format')
      .setDescription(
        '**BDT → Robux:**\n`!500 BDT` · `!1000 TK` · `!250 T`\n\n' +
        '**Robux → BDT:**\n`!1000 RB` · `!2500 RBX` · `!500 Robux`'
      )
      .setColor(0xe74c3c)
      .setTimestamp();
    await message.reply({ embeds: [errorEmbed] });
  }
}

module.exports = { handlePrefix };
