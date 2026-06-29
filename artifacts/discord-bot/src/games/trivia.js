const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recordGame } = require('../utils/gameStats');

const sessions = new Map();

// Question bank — format: { q, options: [correct, ...wrong], cat }
const QUESTIONS = [
  // Gaming
  { q:'What game popularized the "battle royale" genre on PC?', options:['PlayerUnknown\'s Battlegrounds','Fortnite','Apex Legends','Call of Duty'], cat:'gaming' },
  { q:'In Minecraft, what material is the strongest?', options:['Netherite','Diamond','Obsidian','Iron'], cat:'gaming' },
  { q:'What year was Roblox founded?', options:['2004','2006','2008','2002'], cat:'gaming' },
  { q:'In Among Us, what is the maximum number of impostors?', options:['3','2','4','1'], cat:'gaming' },
  { q:'What does "GG" stand for in gaming?', options:['Good Game','Great Goal','Good Going','Grand Game'], cat:'gaming' },
  // Anime
  { q:'What is the name of the main character in Naruto?', options:['Naruto Uzumaki','Sasuke Uchiha','Sakura Haruno','Kakashi Hatake'], cat:'anime' },
  { q:'In Dragon Ball Z, what is Goku\'s home planet?', options:['Planet Vegeta','Planet Namek','Earth','Planet Frieza'], cat:'anime' },
  { q:'Which anime features the Survey Corps?', options:['Attack on Titan','Demon Slayer','My Hero Academia','One Piece'], cat:'anime' },
  // Science
  { q:'What is the chemical symbol for gold?', options:['Au','Ag','Fe','Cu'], cat:'science' },
  { q:'How many planets are in our solar system?', options:['8','9','7','10'], cat:'science' },
  { q:'What is the speed of light (approx)?', options:['300,000 km/s','150,000 km/s','500,000 km/s','200,000 km/s'], cat:'science' },
  // History
  { q:'In what year did World War II end?', options:['1945','1944','1946','1943'], cat:'history' },
  { q:'Who was the first US President?', options:['George Washington','Abraham Lincoln','Thomas Jefferson','John Adams'], cat:'history' },
  { q:'The Great Wall of China was primarily built during which dynasty?', options:['Ming','Qing','Han','Tang'], cat:'history' },
  // Discord
  { q:'In what year was Discord launched?', options:['2015','2014','2016','2017'], cat:'discord' },
  { q:'What programming language is Discord\'s desktop app built with?', options:['Electron/JS','Python','Java','C++'], cat:'discord' },
  // General
  { q:'What is the capital of France?', options:['Paris','London','Berlin','Rome'], cat:'general' },
  { q:'How many sides does a hexagon have?', options:['6','5','7','8'], cat:'general' },
  { q:'What is the largest ocean on Earth?', options:['Pacific','Atlantic','Indian','Arctic'], cat:'general' },
  { q:'What language is spoken in Brazil?', options:['Portuguese','Spanish','English','French'], cat:'general' },
];

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

async function start(interaction, category) {
  const pool = category === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.cat === category);
  if (!pool.length) return interaction.reply({ content: '❌ No questions for that category.', ephemeral: true });

  const q       = pool[Math.floor(Math.random() * pool.length)];
  const correct = q.options[0];
  const choices = shuffle(q.options);
  const gameId  = `${interaction.user.id}_${Date.now()}`;

  sessions.set(gameId, { userId: interaction.user.id, correct, question: q.q });

  const letters = ['A','B','C','D'];
  const row = new ActionRowBuilder();
  choices.forEach((opt, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`trv_answer_${gameId}_${opt === correct ? 'correct' : 'wrong'}`)
        .setLabel(`${letters[i]}. ${opt}`)
        .setStyle(ButtonStyle.Secondary)
    );
  });

  const embed = new EmbedBuilder()
    .setTitle('❓ Trivia')
    .setDescription(`**${q.q}**`)
    .setColor(0x010101)
    .setFooter({ text: `Category: ${q.cat} • 20 seconds to answer` });

  await interaction.reply({ embeds: [embed], components: [row] });

  // Auto-expire
  setTimeout(async () => {
    if (sessions.has(gameId)) {
      sessions.delete(gameId);
      const msg = await interaction.fetchReply().catch(() => null);
      if (msg) {
        const expEmbed = EmbedBuilder.from(msg.embeds[0]).setColor(0xe74c3c)
          .setFooter({ text: `⏱️ Time's up! Correct answer: ${correct}` });
        await msg.edit({ embeds: [expEmbed], components: [] }).catch(() => {});
      }
    }
  }, 20000);
}

async function handleButton(interaction) {
  const parts  = interaction.customId.split('_');
  const gameId = parts[2];
  const result = parts[3]; // correct or wrong

  const session = sessions.get(gameId);
  if (!session) return interaction.reply({ content: '❌ This trivia has expired.', ephemeral: true });

  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ This is not your trivia question!', ephemeral: true });
  }

  sessions.delete(gameId);
  const isCorrect = result === 'correct';
  recordGame(session.userId, isCorrect ? 'win' : 'loss', 'trivia');

  const embed = new EmbedBuilder()
    .setTitle(`❓ Trivia — ${isCorrect ? '✅ Correct!' : '❌ Wrong!'}`)
    .setDescription(
      `**${session.question}**\n\n` +
      (isCorrect ? '🏆 **You got it! +200 coins, +50 XP**' : `💀 **Wrong!** The answer was: **${session.correct}**`)
    )
    .setColor(isCorrect ? 0x2ecc71 : 0xe74c3c)
    .setFooter({ text: 'Powered by Zenix Realm' });

  await interaction.update({ embeds: [embed], components: [] });
}

module.exports = { start, handleButton };
