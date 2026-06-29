const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { getPlayer, getRank, claimDaily, getLeaderboard } = require('../utils/gameStats');

const ttt        = require('../games/tictactoe');
const rps        = require('../games/rps');
const blackjack  = require('../games/blackjack');
const trivia     = require('../games/trivia');
const hangman    = require('../games/hangman');
const coinflip   = require('../games/coinflip');
const wyr        = require('../games/wyr');
const guessnumber = require('../games/guessnumber');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Game commands — play, profile, leaderboard, daily')
    // ── play ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('play')
      .setDescription('Start a mini game')
      .addStringOption(o => o
        .setName('game')
        .setDescription('Which game to play')
        .setRequired(true)
        .addChoices(
          { name: '❌ Tic Tac Toe',       value: 'tictactoe'   },
          { name: '🪨 Rock Paper Scissors', value: 'rps'         },
          { name: '🎯 Guess The Number',   value: 'guessnumber' },
          { name: '🃏 Blackjack',          value: 'blackjack'   },
          { name: '💰 Coin Flip',          value: 'coinflip'    },
          { name: '❓ Trivia',             value: 'trivia'      },
          { name: '🎯 Hangman',            value: 'hangman'     },
          { name: '🎲 Would You Rather',   value: 'wyr'         },
        )
      )
      .addUserOption(o => o.setName('opponent').setDescription('Opponent (for multiplayer games)').setRequired(false))
      .addStringOption(o => o
        .setName('difficulty')
        .setDescription('Difficulty (for applicable games)')
        .addChoices(
          { name: 'Easy',   value: 'easy'   },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard',   value: 'hard'   },
        )
        .setRequired(false)
      )
      .addStringOption(o => o
        .setName('mode')
        .setDescription('Game mode')
        .addChoices(
          { name: 'vs Bot',    value: 'bot' },
          { name: 'vs Player', value: 'pvp' },
        )
        .setRequired(false)
      )
      .addStringOption(o => o
        .setName('category')
        .setDescription('Category (for Trivia / Hangman)')
        .addChoices(
          { name: 'Gaming',   value: 'gaming'  },
          { name: 'Anime',    value: 'anime'   },
          { name: 'Science',  value: 'science' },
          { name: 'History',  value: 'history' },
          { name: 'Discord',  value: 'discord' },
          { name: 'General',  value: 'general' },
          { name: 'Movies',   value: 'movies'  },
          { name: 'Countries',value: 'countries'},
          { name: 'Animals',  value: 'animals' },
          { name: 'Food',     value: 'food'    },
          { name: 'Games (words)', value: 'games' },
          { name: 'All',      value: 'all'     },
        )
        .setRequired(false)
      )
      .addStringOption(o => o
        .setName('side')
        .setDescription('Your side (Coin Flip)')
        .addChoices(
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' },
        )
        .setRequired(false)
      )
    )
    // ── profile ────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('profile')
      .setDescription('View your game profile and stats')
      .addUserOption(o => o.setName('user').setDescription('User to view (default: yourself)').setRequired(false))
    )
    // ── leaderboard ────────────────────────────────────────────────────────────
    .addSubcommand(s => s.setName('leaderboard').setDescription('View the top players leaderboard'))
    // ── daily ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s.setName('daily').setDescription('Claim your daily coin reward')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── daily ──────────────────────────────────────────────────────────────────
    if (sub === 'daily') {
      const result = claimDaily(interaction.user.id);
      if (!result.success) {
        const h = Math.floor(result.remaining / 3600000);
        const m = Math.floor((result.remaining % 3600000) / 60000);
        return interaction.reply({
          content: `⏱️ You've already claimed your daily! Come back in **${h}h ${m}m**.`,
          ephemeral: true,
        });
      }
      const embed = new EmbedBuilder()
        .setTitle('🎁 Daily Reward Claimed!')
        .setDescription(
          `**+${result.coins} coins** (${result.bonus > 0 ? `+${result.bonus} streak bonus` : 'no streak bonus'})\n` +
          `**+${result.xp} XP**\n\n` +
          `🔥 **Streak:** ${result.streak} day${result.streak !== 1 ? 's' : ''}\n` +
          `${result.streak >= 7 ? '🎊 Week streak bonus active!' : `${7 - result.streak} days until week streak!`}`
        )
        .setColor(0xffd700)
        .setFooter({ text: 'Powered by Zenix Realm' });
      return interaction.reply({ embeds: [embed] });
    }

    // ── profile ────────────────────────────────────────────────────────────────
    if (sub === 'profile') {
      const target = interaction.options.getUser('user') || interaction.user;
      const p      = getPlayer(target.id);
      const rank   = getRank(p.level);
      const xpNeeded = p.level * 150;
      const bar    = Math.round((p.xp / xpNeeded) * 10);

      const embed = new EmbedBuilder()
        .setTitle(`${rank.emoji} ${target.username}'s Profile`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '🏅 Rank',      value: `${rank.emoji} ${rank.name}`,                      inline: true },
          { name: '⭐ Level',     value: `${p.level}`,                                        inline: true },
          { name: '💰 Coins',     value: `${p.coins.toLocaleString()}`,                      inline: true },
          { name: '✨ XP',        value: `${p.xp}/${xpNeeded} ${'█'.repeat(bar)}${'░'.repeat(10 - bar)}`, inline: false },
          { name: '🎮 Games Played', value: `${p.stats.gamesPlayed}`,                        inline: true },
          { name: '🏆 Wins',      value: `${p.stats.gamesWon}`,                             inline: true },
          { name: '💀 Losses',    value: `${p.stats.gamesLost}`,                            inline: true },
          { name: '🤝 Draws',     value: `${p.stats.gamesDraw}`,                            inline: true },
          { name: '📊 Win Rate',  value: p.stats.gamesPlayed > 0
            ? `${Math.round((p.stats.gamesWon / p.stats.gamesPlayed) * 100)}%`
            : '—',                                                                            inline: true },
          { name: '🔥 Daily Streak', value: `${p.streak || 0} days`,                        inline: true },
        )
        .setColor(rank.color)
        .setFooter({ text: 'Powered by Zenix Realm • Developer: o4u9x' });

      return interaction.reply({ embeds: [embed] });
    }

    // ── leaderboard ────────────────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const lb = getLeaderboard(10);
      if (!lb.length) return interaction.reply({ content: '❌ No players yet. Play some games first!', ephemeral: true });

      const desc = lb.map((p, i) => {
        const rank   = getRank(p.level);
        const medal  = ['🥇','🥈','🥉'][i] || `**${i + 1}.**`;
        return `${medal} <@${p.userId}> — ${rank.emoji} Lvl ${p.level} • ${p.coins.toLocaleString()} coins • ${p.stats.gamesWon}W`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('🏆 Zenix Games Leaderboard')
        .setDescription(desc)
        .setColor(0xffd700)
        .setFooter({ text: 'Ranked by Level → XP • Powered by Zenix Realm' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── play ───────────────────────────────────────────────────────────────────
    if (sub === 'play') {
      const game       = interaction.options.getString('game');
      const opponent   = interaction.options.getUser('opponent');
      const difficulty = interaction.options.getString('difficulty') || 'medium';
      const mode       = interaction.options.getString('mode') || 'bot';
      const category   = interaction.options.getString('category') || 'all';
      const side       = interaction.options.getString('side') || (Math.random() < 0.5 ? 'heads' : 'tails');

      switch (game) {
        case 'tictactoe':
          if (!opponent) return interaction.reply({ content: '❌ Tic Tac Toe requires an `opponent` option.', ephemeral: true });
          return ttt.startChallenge(interaction, opponent);

        case 'rps':
          if (mode === 'pvp') {
            if (!opponent) return interaction.reply({ content: '❌ PvP mode requires an `opponent` option.', ephemeral: true });
            return rps.startVsPlayer(interaction, opponent);
          }
          return rps.startVsBot(interaction);

        case 'guessnumber':
          return guessnumber.start(interaction, difficulty);

        case 'blackjack':
          return blackjack.start(interaction);

        case 'coinflip':
          return coinflip.start(interaction, side);

        case 'trivia':
          return trivia.start(interaction, category);

        case 'hangman':
          return hangman.start(interaction, category);

        case 'wyr':
          return wyr.start(interaction);

        default:
          return interaction.reply({ content: '❌ Unknown game.', ephemeral: true });
      }
    }
  },
};
