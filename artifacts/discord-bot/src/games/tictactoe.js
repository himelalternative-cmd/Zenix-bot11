const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recordGame } = require('../utils/gameStats');

// Active games: messageId -> game state
const games = new Map();

const EMPTY = '⬜', X = '❌', O = '⭕';

function makeBoard() { return Array(9).fill(EMPTY); }

function checkWinner(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,c,d] of lines) if (b[a] !== EMPTY && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.includes(EMPTY) ? null : 'draw';
}

function buildRows(board, gameId, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const cell = board[i];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_move_${gameId}_${i}`)
          .setLabel(cell === EMPTY ? '\u200b' : cell)
          .setEmoji(cell === EMPTY ? '⬜' : (cell === X ? '❌' : '⭕'))
          .setStyle(cell === X ? ButtonStyle.Danger : cell === O ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(disabled || cell !== EMPTY)
      );
    }
    rows.push(row);
  }
  return rows;
}

function buildEmbed(game) {
  const currentUser = game.currentTurn === X ? game.player1 : game.player2;
  return new EmbedBuilder()
    .setTitle('🎮 Tic Tac Toe')
    .setDescription(
      `**${game.player1.username}** ❌ vs ⭕ **${game.player2.username}**\n\n` +
      `🎯 **Turn:** <@${currentUser.id}> (${game.currentTurn})`
    )
    .setColor(0x010101)
    .setFooter({ text: 'Powered by Zenix Realm • 5 min timeout' });
}

// Start a challenge (send accept/decline to opponent)
async function startChallenge(interaction, opponent) {
  if (opponent.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot challenge yourself.', ephemeral: true });
  if (opponent.bot) return interaction.reply({ content: '❌ You cannot challenge a bot.', ephemeral: true });

  const gameId = `${interaction.channel.id}_${Date.now()}`;

  const embed = new EmbedBuilder()
    .setTitle('⚔️ Tic Tac Toe Challenge')
    .setDescription(
      `<@${interaction.user.id}> has challenged <@${opponent.id}> to **Tic Tac Toe**!\n\n` +
      `<@${opponent.id}>, do you accept?`
    )
    .setColor(0x010101)
    .setFooter({ text: 'This challenge expires in 60 seconds.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ttt_accept_${gameId}_${interaction.user.id}_${opponent.id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ttt_decline_${gameId}_${interaction.user.id}_${opponent.id}`).setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row] });

  // Auto-expire challenge
  setTimeout(async () => {
    if (!games.has(gameId)) {
      const msg = await interaction.fetchReply().catch(() => null);
      if (msg) await msg.edit({ content: '⏱️ Challenge expired.', embeds: [], components: [] }).catch(() => {});
    }
  }, 60000);
}

// Handle button interactions
async function handleButton(interaction) {
  const parts = interaction.customId.split('_');

  // ttt_accept / ttt_decline
  // customId: ttt_accept_{channelId}_{timestamp}_{challengerId}_{opponentId}
  // gameId contains one underscore (channelId_timestamp), so parse from the end
  if (parts[1] === 'accept' || parts[1] === 'decline') {
    const opponent   = parts[parts.length - 1];
    const challenger = parts[parts.length - 2];
    const gameId     = parts.slice(2, -2).join('_');

    if (interaction.user.id !== opponent) {
      return interaction.reply({ content: '❌ This challenge is not for you.', ephemeral: true });
    }

    if (parts[1] === 'decline') {
      return interaction.update({ content: `❌ <@${opponent}> declined the challenge.`, embeds: [], components: [] });
    }

    // Start game
    const game = {
      player1: await interaction.guild.members.fetch(challenger).then(m => m.user),
      player2: interaction.user,
      board: makeBoard(),
      currentTurn: X,
      gameId,
    };
    games.set(gameId, game);

    const timeout = setTimeout(async () => {
      if (games.has(gameId)) {
        games.delete(gameId);
        await interaction.message.edit({ content: '⏱️ Game timed out.', embeds: [], components: [] }).catch(() => {});
      }
    }, 5 * 60 * 1000);

    game.timeout = timeout;

    await interaction.update({ embeds: [buildEmbed(game)], components: buildRows(game.board, gameId) });
    return;
  }

  // ttt_move
  // customId: ttt_move_{channelId}_{timestamp}_{index}
  if (parts[1] === 'move') {
    const index  = parseInt(parts[parts.length - 1]);
    const gameId = parts.slice(2, -1).join('_');
    const game   = games.get(gameId);

    if (!game) return interaction.reply({ content: '❌ Game not found.', ephemeral: true });

    const expectedPlayer = game.currentTurn === X ? game.player1.id : game.player2.id;
    if (interaction.user.id !== expectedPlayer) {
      return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
    }

    game.board[index] = game.currentTurn;
    const result      = checkWinner(game.board);

    if (result) {
      games.delete(gameId);
      clearTimeout(game.timeout);

      let desc, winner, loser;
      if (result === 'draw') {
        desc   = '🤝 **It\'s a draw!** Well played both!';
        recordGame(game.player1.id, 'draw', 'tictactoe');
        recordGame(game.player2.id, 'draw', 'tictactoe');
      } else {
        winner = result === X ? game.player1 : game.player2;
        loser  = result === X ? game.player2 : game.player1;
        desc   = `🏆 **<@${winner.id}> wins!** GG!`;
        recordGame(winner.id, 'win',  'tictactoe');
        recordGame(loser.id,  'loss', 'tictactoe');
      }

      const endEmbed = new EmbedBuilder()
        .setTitle('🎮 Tic Tac Toe — Game Over')
        .setDescription(`**${game.player1.username}** ❌ vs ⭕ **${game.player2.username}**\n\n${desc}`)
        .setColor(result === 'draw' ? 0xffd700 : 0x2ecc71)
        .setFooter({ text: 'Powered by Zenix Realm' });

      return interaction.update({ embeds: [endEmbed], components: buildRows(game.board, gameId, true) });
    }

    game.currentTurn = game.currentTurn === X ? O : X;
    await interaction.update({ embeds: [buildEmbed(game)], components: buildRows(game.board, gameId) });
  }
}

module.exports = { startChallenge, handleButton };
