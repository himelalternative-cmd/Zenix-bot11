const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder,
} = require('discord.js');
const { resolveUserId, isGroupMember, sendGroupPayout } = require('../utils/robloxClient');
const { recordFirstSeen, getRecord, getEligibility } = require('../utils/robuxJoinTracker');
const { getBalance, removeBalance, toTaka, toUSD } = require('../utils/zenixPoints');
const { logPurchase, getLogChannel } = require('../utils/stockHistory');

const ROBUX_TO_ZP = 0.9; // 1 Robux = 0.9 Zenix Points
const ITEM_NAME   = 'Robux';
const MODAL_ID    = 'robux_buy_modal';

function getGroupId() {
  const groupId = process.env.ROBLOX_GROUP_ID;
  if (!groupId) throw new Error('ROBLOX_GROUP_ID is not configured.');
  return groupId;
}

// ── Shared eligibility check, used by both /buy and !check ────────────────────
// Returns one of:
//   { status: 'not_found' }
//   { status: 'not_member', username }
//   { status: 'pending', username, eligibleAt }
//   { status: 'eligible', username, userId }
async function checkEligibility(rawUsername) {
  const user = await resolveUserId(rawUsername.trim());
  if (!user) return { status: 'not_found' };

  const groupId = getGroupId();
  const member  = await isGroupMember(groupId, user.id);

  if (!member) return { status: 'not_member', username: user.name };

  const record      = recordFirstSeen(user.id, user.name);
  const eligibility = getEligibility(record);

  if (!eligibility.eligible) {
    return { status: 'pending', username: user.name, eligibleAt: eligibility.eligibleAt };
  }

  return { status: 'eligible', username: user.name, userId: user.id };
}

function notEligibleMessage(username) {
  return `❌ **${username}** is not eligible for payout.`;
}

function pendingMessage(username, eligibleAt) {
  return (
    `❌ **${username}** is not eligible for payout.\n` +
    `They must be a community member for 14 days before receiving a payout.\n` +
    `Eligible at: <t:${Math.floor(eligibleAt / 1000)}:F>`
  );
}

// ── /buy → item "Robux" selected: show the username/amount modal ──────────────
function isRobuxItem(itemName) {
  return itemName.trim().toLowerCase() === ITEM_NAME.toLowerCase();
}

async function showRobuxModal(interaction) {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Buy Robux — Community Payout');

  const usernameInput = new TextInputBuilder()
    .setCustomId('roblox_username')
    .setLabel('Your Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);

  const amountInput = new TextInputBuilder()
    .setCustomId('robux_amount')
    .setLabel('Robux Amount')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`1 Robux = ${ROBUX_TO_ZP} ZP`)
    .setRequired(true)
    .setMaxLength(9);

  modal.addComponents(
    new ActionRowBuilder().addComponents(usernameInput),
    new ActionRowBuilder().addComponents(amountInput),
  );

  await interaction.showModal(modal);
}

// ── Modal submitted: run the whole purchase flow ───────────────────────────────
async function handleRobuxModal(interaction) {
  const username = interaction.fields.getTextInputValue('roblox_username').trim();
  const amountRaw = interaction.fields.getTextInputValue('robux_amount').trim();
  const amount = parseInt(amountRaw, 10);

  if (!username) {
    return interaction.reply({ content: '❌ Please enter a valid Roblox username.', ephemeral: true });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return interaction.reply({ content: '❌ Please enter a valid Robux amount (a positive whole number).', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let check;
  try {
    check = await checkEligibility(username);
  } catch (err) {
    console.error('[robux] Eligibility check failed:', err.message);
    return interaction.editReply({ content: '❌ Could not reach Roblox right now. Please try again in a moment.' });
  }

  if (check.status === 'not_found') {
    return interaction.editReply({ content: `❌ Roblox user \`${username}\` was not found.` });
  }
  if (check.status === 'not_member') {
    return interaction.editReply({ content: notEligibleMessage(check.username) });
  }
  if (check.status === 'pending') {
    return interaction.editReply({ content: pendingMessage(check.username, check.eligibleAt) });
  }

  // ── Eligible — check balance before attempting the payout ───────────────────
  const totalCost = Math.ceil(amount * ROBUX_TO_ZP);
  const userId    = interaction.user.id;
  const balance   = getBalance(userId);

  if (balance < totalCost) {
    const needed = totalCost - balance;
    const embed = new EmbedBuilder()
      .setTitle('❌ Insufficient Zenix Points')
      .setColor(0xe74c3c)
      .addFields(
        { name: '🎮 Roblox User',   value: check.username,                          inline: true },
        { name: '💰 Robux',         value: String(amount),                          inline: true },
        { name: '💲 Total Cost',    value: `**${totalCost.toLocaleString()} ZP**`,  inline: true },
        { name: '💎 Your Balance',  value: `**${balance.toLocaleString()} ZP**`,    inline: true },
        { name: '⚠️ Still Needed', value: `**${needed.toLocaleString()} ZP**`,     inline: true },
      )
      .setFooter({ text: 'Powered by Zenix Realm' })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Attempt the actual group payout BEFORE touching the buyer's balance ─────
  let payoutResult;
  try {
    payoutResult = await sendGroupPayout(getGroupId(), check.userId, amount);
  } catch (err) {
    console.error('[robux] Payout request failed:', err.message);
    return interaction.editReply({ content: `❌ Payout failed: ${err.message}\nYou have not been charged.` });
  }

  if (!payoutResult.success) {
    console.error('[robux] Payout rejected by Roblox:', payoutResult.error);
    return interaction.editReply({
      content: `❌ Roblox rejected the payout: ${payoutResult.error}\nYou have not been charged.`,
    });
  }

  // ── Payout succeeded — now deduct balance and record everything ────────────
  const newBalance = removeBalance(userId, totalCost);

  const successEmbed = new EmbedBuilder()
    .setTitle('✅ Robux Sent!')
    .setColor(0x2ecc71)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: '🎮 Roblox User',  value: `**${check.username}**`,                                                                    inline: true },
      { name: '💰 Robux',        value: `**${amount}**`,                                                                             inline: true },
      { name: '💲 Total Cost',   value: `**${totalCost.toLocaleString()} ZP** (৳${toTaka(totalCost)} / $${toUSD(totalCost)})`,       inline: false },
      { name: '💎 New Balance',  value: `**${newBalance.toLocaleString()} ZP** (৳${toTaka(newBalance)} / $${toUSD(newBalance)})`,    inline: false },
    )
    .setFooter({ text: `Purchased by ${interaction.user.username} • Powered by Zenix Realm` })
    .setTimestamp();

  await interaction.editReply({ embeds: [successEmbed] });

  try {
    logPurchase(interaction.guildId, {
      userId, username: interaction.user.username, item: `${ITEM_NAME} (${check.username})`, amount, totalCost, timestamp: Date.now(),
    });

    const logChannelId = getLogChannel(interaction.guildId);
    if (logChannelId) {
      const logChannel = interaction.guild.channels.cache.get(logChannelId);
      if (logChannel) {
        await logChannel.send({ embeds: [successEmbed] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[robux] Failed to log purchase:', err.message);
  }

  // ── Post to the order channel, matching the /buy convention ────────────────
  try {
    const { getGuildSettings, saveGuildSettings, generateOrderId, getSettings } = require('../utils/settings');
    const settings = getGuildSettings(interaction.guildId);
    const orderChannelId = settings.orderChannelId;

    if (orderChannelId) {
      const orderChannel = interaction.guild.channels.cache.get(orderChannelId);
      if (orderChannel) {
        const orderId   = generateOrderId(settings.orderIdPrefix || 'ORDER');
        const timestamp = Math.floor(Date.now() / 1000);

        const orderLines =
          `• Handler : Auto Buy (Community Payout)\n` +
          `• Buyer : <@${userId}>\n` +
          `• Roblox User : ${check.username}\n` +
          `• Item : Robux × ${amount}\n` +
          `• Order id : ${orderId}\n` +
          `• Time : <t:${timestamp}:R>`;

        const orderEmbed = new EmbedBuilder()
          .setTitle(settings.orderTitle || '▶ Order Details:')
          .setDescription(orderLines)
          .setColor(settings.orderColor ?? 0x010101)
          .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
          .setTimestamp();

        await orderChannel.send({ embeds: [orderEmbed] });

        settings.orderCount = (settings.orderCount || 0) + 1;
        saveGuildSettings(interaction.guildId, settings);

        const allSettings = getSettings();
        let totalOrders = 0;
        for (const gid of Object.keys(allSettings)) totalOrders += (allSettings[gid].orderCount || 0);
        interaction.client.user.setActivity(`${totalOrders} orders completed`, { type: 3 });
      }
    }
  } catch (err) {
    console.error('[robux] Failed to post to order channel:', err.message);
  }

  // ── DM confirmation ──────────────────────────────────────────────────────────
  try {
    const dmEmbed = new EmbedBuilder()
      .setDescription(
        `Thank you for your purchase!\n\n**${amount} Robux** has been sent to Roblox user **${check.username}** ` +
        `via the community group payout.\n\nIf it hasn't arrived yet, Roblox payouts can take a short while to appear.`
      )
      .setColor(0x010101)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();
    await interaction.user.send({ embeds: [dmEmbed] });
  } catch {
    // DMs disabled — the ephemeral reply above already confirmed the purchase.
  }
}

module.exports = {
  MODAL_ID,
  isRobuxItem,
  showRobuxModal,
  handleRobuxModal,
  checkEligibility,
  notEligibleMessage,
  pendingMessage,
  ROBUX_TO_ZP,
};
