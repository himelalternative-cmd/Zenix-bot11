const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { generateNetflix } = require('../utils/netflixGen');

// ── Per-user cooldown (5 seconds) ─────────────────────────────────────────────
const cooldowns = new Map(); // userId -> last-used timestamp (ms)
const COOLDOWN_MS = 90_000; // 1.5 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generate a service account link')
    .addStringOption(opt =>
      opt
        .setName('service')
        .setDescription('Which service to generate')
        .setRequired(true)
        .addChoices({ name: 'NETFLIX', value: 'netflix' })
    ),

  async execute(interaction) {
    // ── Cooldown check ────────────────────────────────────────────────────────
    const userId   = interaction.user.id;
    const lastUsed = cooldowns.get(userId) ?? 0;
    const remaining = COOLDOWN_MS - (Date.now() - lastUsed);

    if (remaining > 0) {
      return interaction.reply({
        content: `⏳ You're on cooldown! Please wait **${(remaining / 1000).toFixed(1)}s** before using this again.`,
        ephemeral: true,
      });
    }

    // ── Set cooldown immediately ──────────────────────────────────────────────
    cooldowns.set(userId, Date.now());

    // ── Defer reply (automation takes a few seconds) ──────────────────────────
    await interaction.deferReply({ ephemeral: true });

    const service = interaction.options.getString('service');

    try {
      let links;

      if (service === 'netflix') {
        links = await generateNetflix();
      }

      // ── DM the user with the 3 links ────────────────────────────────────────
      const dmEmbed = new EmbedBuilder()
        .setTitle('🎬 Netflix — Your Access Links')
        .setDescription('Here are your **3 device links**. Each link is for a different device.')
        .setColor(0xe50914) // Netflix red
        .addFields(
          {
            name: '🖥️ For PC',
            value: links.pcLink ? `[Click here](${links.pcLink})\n\`${links.pcLink}\`` : '_Not available_',
            inline: false,
          },
          {
            name: '📱 For Mobile',
            value: links.mobileLink ? `[Click here](${links.mobileLink})\n\`${links.mobileLink}\`` : '_Not available_',
            inline: false,
          },
          {
            name: '📺 For TV',
            value: links.tvLink ? `[Click here](${links.tvLink})\n\`${links.tvLink}\`` : '_Not available_',
            inline: false,
          },
        )
        .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/1280px-Netflix_2015_logo.svg.png')
        .setFooter({ text: `${interaction.guild.name} • Generator`, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp();

      try {
        await interaction.user.send({ embeds: [dmEmbed] });
        await interaction.editReply({
          content: '✅ Your Netflix links have been sent to your **DMs**!',
        });
      } catch {
        // DMs closed — send ephemerally in channel instead
        await interaction.editReply({
          content: '⚠️ I couldn\'t DM you (your DMs may be closed). Here are your links:',
          embeds: [dmEmbed],
        });
      }
    } catch (err) {
      console.error('[generate] Netflix generation failed:', err.message);

      // Reset cooldown on failure so they can retry
      cooldowns.delete(userId);

      await interaction.editReply({
        content: `❌ Generation failed: ${err.message}`,
      });
    }
  },
};
