const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const QUESTIONS = [
  ['Fight 100 duck-sized horses', 'Fight 1 horse-sized duck'],
  ['Always speak in rhymes', 'Always speak in questions'],
  ['Never use the internet again', 'Never eat your favorite food again'],
  ['Have the ability to fly', 'Have the ability to be invisible'],
  ['Know how you will die', 'Know when you will die'],
  ['Lose all your memories', 'Never make new memories'],
  ['Always be 10 minutes late', 'Always be 20 minutes early'],
  ['Have unlimited money but no friends', 'Have great friends but always be broke'],
  ['Be able to teleport', 'Be able to read minds'],
  ['Live in the past', 'Live in the future'],
  ['Never be able to use a smartphone again', 'Never be able to watch movies/TV again'],
  ['Have a rewind button for your life', 'Have a pause button for your life'],
  ['Be famous but hated', 'Be unknown but loved'],
  ['Only eat sweet foods forever', 'Only eat salty foods forever'],
  ['Be able to talk to animals', 'Be able to speak all human languages'],
  ['Always have to whisper', 'Always have to shout'],
  ['Live without music', 'Live without movies'],
  ['Have super speed', 'Have super strength'],
];

// votes: messageId -> { a: count, b: count }
const votes = new Map();

async function start(interaction) {
  const q      = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const msgKey = `${interaction.channel.id}_${Date.now()}`;

  votes.set(msgKey, { a: 0, b: 0, voters: new Set() });

  const embed = new EmbedBuilder()
    .setTitle('🎲 Would You Rather?')
    .setDescription(`**🅰️ ${q[0]}**\n\n**OR**\n\n**🅱️ ${q[1]}**`)
    .setColor(0x010101)
    .setFooter({ text: 'Vote with the buttons below! • Powered by Zenix Realm' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wyr_vote_${msgKey}_a`).setLabel(`🅰️ Option A (0)`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`wyr_vote_${msgKey}_b`).setLabel(`🅱️ Option B (0)`).setStyle(ButtonStyle.Success),
  );

  await interaction.reply({ embeds: [embed], components: [row] });

  setTimeout(() => { if (votes.has(msgKey)) votes.delete(msgKey); }, 30 * 60 * 1000);
}

async function handleButton(interaction) {
  const parts  = interaction.customId.split('_');
  const msgKey = `${parts[2]}_${parts[3]}`;
  const choice = parts[4];

  const data = votes.get(msgKey);
  if (!data) return interaction.reply({ content: '❌ This poll has expired.', ephemeral: true });

  if (data.voters.has(interaction.user.id)) {
    return interaction.reply({ content: '❌ You already voted!', ephemeral: true });
  }

  data.voters.add(interaction.user.id);
  if (choice === 'a') data.a++; else data.b++;

  const total  = data.a + data.b;
  const pctA   = total ? Math.round((data.a / total) * 100) : 0;
  const pctB   = total ? Math.round((data.b / total) * 100) : 0;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wyr_vote_${msgKey}_a`).setLabel(`🅰️ Option A (${data.a}) — ${pctA}%`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`wyr_vote_${msgKey}_b`).setLabel(`🅱️ Option B (${data.b}) — ${pctB}%`).setStyle(ButtonStyle.Success),
  );

  await interaction.update({ components: [row] });
}

module.exports = { start, handleButton };
