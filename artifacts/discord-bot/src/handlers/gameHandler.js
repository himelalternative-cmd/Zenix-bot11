// Central router for all mini-game interactions.
// Reads the customId prefix and delegates to the correct game module.

const ttt        = require('../games/tictactoe');
const rps        = require('../games/rps');
const blackjack  = require('../games/blackjack');
const trivia     = require('../games/trivia');
const hangman    = require('../games/hangman');
const coinflip   = require('../games/coinflip');
const wyr        = require('../games/wyr');
const guessnumber = require('../games/guessnumber');

async function handleGameInteraction(interaction) {
  try {
    // ── Buttons ─────────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('ttt_'))    return ttt.handleButton(interaction);
      if (id.startsWith('rps_'))    return rps.handleButton(interaction);
      if (id.startsWith('bjk_'))    return blackjack.handleButton(interaction);
      if (id.startsWith('trv_'))    return trivia.handleButton(interaction);
      if (id.startsWith('hng_') && !id.includes('modal')) return hangman.handleButton(interaction);
      if (id.startsWith('cf_'))     return coinflip.handleButton(interaction);
      if (id.startsWith('wyr_'))    return wyr.handleButton(interaction);
      if (id.startsWith('gn_') && !id.includes('modal'))  return guessnumber.handleButton(interaction);
    }

    // ── Modals ──────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith('hng_modal_')) return hangman.handleModal(interaction);
      if (id.startsWith('gn_modal_'))  return guessnumber.handleModal(interaction);
    }
  } catch (err) {
    console.error('[GameHandler] Error:', err);
    const reply = { content: '❌ An error occurred in the game. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

// Check if a customId belongs to the games system
function isGameInteraction(customId) {
  return ['ttt_','rps_','bjk_','trv_','hng_','cf_','wyr_','gn_'].some(p => customId.startsWith(p));
}

module.exports = { handleGameInteraction, isGameInteraction };
