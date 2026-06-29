const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recordGame, addCoins, getPlayer } = require('../utils/gameStats');

const sessions = new Map();

const SUITS  = ['♠️','♥️','♦️','♣️'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const v of VALUES) deck.push({ s, v });
  return deck.sort(() => Math.random() - 0.5);
}

function cardVal(v)   { return isNaN(v) ? (v === 'A' ? 11 : 10) : parseInt(v); }
function handVal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) { total += cardVal(c.v); if (c.v === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function showHand(hand, hide = false) {
  if (hide) return `\`${hand[0].v}${hand[0].s}\` \`???\``;
  return hand.map(c => `\`${c.v}${c.s}\``).join(' ');
}

function gameRow(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bjk_hit_${userId}`).setLabel('Hit').setEmoji('🃏').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`bjk_stand_${userId}`).setLabel('Stand').setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`bjk_double_${userId}`).setLabel('Double').setEmoji('⚡').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

function buildEmbed(session, hideDealer = true) {
  const pv = handVal(session.playerHand);
  const dv = hideDealer ? cardVal(session.dealerHand[0].v) : handVal(session.dealerHand);
  return new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .addFields(
      { name: `🤖 Dealer (${hideDealer ? '?' : dv})`, value: showHand(session.dealerHand, hideDealer), inline: false },
      { name: `👤 You (${pv})`, value: showHand(session.playerHand), inline: false },
    )
    .setColor(0x010101)
    .setFooter({ text: 'Powered by Zenix Realm • Hit, Stand, or Double' });
}

async function start(interaction) {
  const userId = interaction.user.id;
  if (sessions.has(userId)) return interaction.reply({ content: '❌ You already have an active game! Finish it first.', ephemeral: true });

  const deck = newDeck();
  const session = {
    userId,
    deck,
    playerHand: [deck.pop(), deck.pop()],
    dealerHand: [deck.pop(), deck.pop()],
    doubled: false,
  };
  sessions.set(userId, session);

  const pv = handVal(session.playerHand);

  // Natural blackjack
  if (pv === 21) {
    sessions.delete(userId);
    recordGame(userId, 'win', 'blackjack');
    addCoins(userId, 150);
    const embed = buildEmbed(session, false)
      .setTitle('🃏 Blackjack — Natural Blackjack!')
      .setDescription('🏆 **Blackjack! You win! +150 coins**')
      .setColor(0x2ecc71);
    return interaction.reply({ embeds: [embed], components: [gameRow(userId, true)] });
  }

  await interaction.reply({ embeds: [buildEmbed(session)], components: [gameRow(userId)] });

  setTimeout(() => { if (sessions.has(userId)) sessions.delete(userId); }, 5 * 60 * 1000);
}

async function endGame(interaction, session, reason) {
  const userId = session.userId;
  sessions.delete(userId);

  // Dealer plays
  while (handVal(session.dealerHand) < 17) session.dealerHand.push(session.deck.pop());

  const pv = handVal(session.playerHand);
  const dv = handVal(session.dealerHand);

  let result, desc, color;
  if (reason === 'bust' || pv > 21) {
    result = 'loss'; desc = '💀 **Bust! You lose.**'; color = 0xe74c3c;
  } else if (dv > 21 || pv > dv) {
    result = 'win';  desc = '🏆 **You win! +200 coins**'; color = 0x2ecc71; addCoins(userId, 200);
  } else if (pv < dv) {
    result = 'loss'; desc = '💀 **Dealer wins. You lose.**'; color = 0xe74c3c;
  } else {
    result = 'draw'; desc = '🤝 **Push! It\'s a tie.**'; color = 0xffd700; addCoins(userId, 50);
  }

  recordGame(userId, result, 'blackjack');

  const embed = buildEmbed(session, false)
    .setTitle('🃏 Blackjack — Game Over')
    .setDescription(desc)
    .setColor(color);

  return interaction.update({ embeds: [embed], components: [gameRow(userId, true)] });
}

async function handleButton(interaction) {
  const parts  = interaction.customId.split('_');
  const action = parts[1];
  const userId = parts[2];

  if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  const session = sessions.get(userId);
  if (!session) return interaction.reply({ content: '❌ No active game. Use `/game play blackjack` to start.', ephemeral: true });

  if (action === 'hit' || action === 'double') {
    if (action === 'double') session.doubled = true;
    session.playerHand.push(session.deck.pop());

    const pv = handVal(session.playerHand);
    if (pv > 21 || action === 'double') return endGame(interaction, session, pv > 21 ? 'bust' : 'stand');

    await interaction.update({ embeds: [buildEmbed(session)], components: [gameRow(userId)] });
    return;
  }

  if (action === 'stand') return endGame(interaction, session, 'stand');
}

module.exports = { start, handleButton };
