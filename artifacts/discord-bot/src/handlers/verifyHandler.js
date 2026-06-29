const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { getGuildVerify } = require('../utils/verifySettings');

// In-memory captcha store: userId -> { code, guildId }
const captchas = new Map();

function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Verify button clicked ──────────────────────────────────────────────────────
async function handleVerifyButton(interaction) {
  const settings = getGuildVerify(interaction.guild.id);
  if (!settings?.enabled) {
    return interaction.reply({ content: '❌ Verification is not set up on this server.', ephemeral: true });
  }

  const member = interaction.member;

  // Check if already verified
  if (member.roles.cache.has(settings.roleId)) {
    return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
  }

  // Anti-alt: check account age
  if (settings.minAgeDays > 0) {
    const ageDays = (Date.now() - interaction.user.createdTimestamp) / 86400000;
    if (ageDays < settings.minAgeDays) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Account Too New')
        .setDescription(
          `Your account must be at least **${settings.minAgeDays} day(s)** old to verify.\n` +
          `Your account is **${ageDays.toFixed(1)} day(s)** old.`
        )
        .setColor(0xe74c3c)
        .setFooter({ text: 'Powered by Zenix Realm' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // No captcha — give role immediately
  if (!settings.captcha) {
    return giveVerifiedRole(interaction, settings, null);
  }

  // Captcha mode — generate code and show modal
  const code = generateCaptcha();
  captchas.set(interaction.user.id, { code, guildId: interaction.guild.id });

  const modal = new ModalBuilder()
    .setCustomId('verify_captcha_modal')
    .setTitle(`Code: ${code}`);

  const input = new TextInputBuilder()
    .setCustomId('captcha_answer')
    .setLabel(`Type the code shown above: ${code}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter the 6-character code')
    .setMinLength(6)
    .setMaxLength(6)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

// ── Captcha modal submitted ────────────────────────────────────────────────────
async function handleVerifyCaptcha(interaction) {
  const stored = captchas.get(interaction.user.id);
  const answer = interaction.fields.getTextInputValue('captcha_answer').trim().toUpperCase();

  if (!stored) {
    return interaction.reply({ content: '❌ Captcha expired. Please click Verify again.', ephemeral: true });
  }

  if (answer !== stored.code) {
    captchas.delete(interaction.user.id);
    const embed = new EmbedBuilder()
      .setTitle('❌ Incorrect Code')
      .setDescription('The code you entered was wrong. Please click **Verify** again to get a new code.')
      .setColor(0xe74c3c)
      .setFooter({ text: 'Powered by Zenix Realm' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  captchas.delete(interaction.user.id);
  const settings = getGuildVerify(interaction.guild.id);
  if (!settings?.enabled) {
    return interaction.reply({ content: '❌ Verification is disabled.', ephemeral: true });
  }

  await giveVerifiedRole(interaction, settings, answer);
}

// ── Core: assign verified role + log ──────────────────────────────────────────
async function giveVerifiedRole(interaction, settings, captchaAnswer) {
  const member = interaction.member;
  const guild  = interaction.guild;

  try {
    await member.roles.add(settings.roleId, 'Verified via Zenix Bot');
  } catch {
    return interaction.reply({ content: '❌ Failed to assign your role. Please contact an admin.', ephemeral: true });
  }

  const successEmbed = new EmbedBuilder()
    .setTitle('✅ Verified Successfully!')
    .setDescription(`Welcome to **${guild.name}**! You now have full access.`)
    .setColor(settings.color || 0x2ecc71)
    .setFooter({ text: 'Powered by Zenix Realm' })
    .setTimestamp();

  await interaction.reply({ embeds: [successEmbed], ephemeral: true });

  // Log verification
  if (settings.logChannelId) {
    const logCh = guild.channels.cache.get(settings.logChannelId);
    if (logCh) {
      const ageDays = ((Date.now() - interaction.user.createdTimestamp) / 86400000).toFixed(1);
      const logEmbed = new EmbedBuilder()
        .setTitle('✅ Member Verified')
        .setDescription(
          `**User:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
          `**ID:** \`${interaction.user.id}\`\n` +
          `**Account Age:** ${ageDays} days\n` +
          `**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n` +
          `**Verified At:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
          `**Method:** ${captchaAnswer ? 'CAPTCHA' : 'One-click'}`
        )
        .setColor(0x2ecc71)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();
      await logCh.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }
}

module.exports = { handleVerifyButton, handleVerifyCaptcha };
