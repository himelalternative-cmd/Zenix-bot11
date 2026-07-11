const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const UNIT_MS = {
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
};

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord's hard cap: 28 days

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member for a set duration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('The member to timeout').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration amount').setRequired(true).setMinValue(1))
    .addStringOption(o => o
      .setName('unit')
      .setDescription('Duration unit')
      .setRequired(true)
      .addChoices(
        { name: 'Minutes', value: 'minutes' },
        { name: 'Hours', value: 'hours' },
        { name: 'Days', value: 'days' },
      )
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason for the timeout').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('duration');
    const unit = interaction.options.getString('unit');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot timeout yourself.', ephemeral: true });
    }
    if (target.id === interaction.client.user.id) {
      return interaction.reply({ content: '❌ I cannot timeout myself.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
    }
    if (!member.moderatable) {
      return interaction.reply({ content: '❌ I cannot timeout that member — check role hierarchy.', ephemeral: true });
    }

    const modMember = interaction.member;
    if (
      modMember.id !== interaction.guild.ownerId &&
      member.roles.highest.position >= modMember.roles.highest.position
    ) {
      return interaction.reply({ content: '❌ You cannot timeout a member with an equal or higher role than you.', ephemeral: true });
    }

    let durationMs = amount * UNIT_MS[unit];
    if (durationMs > MAX_TIMEOUT_MS) {
      durationMs = MAX_TIMEOUT_MS;
    }

    try {
      await member.timeout(durationMs, `${reason} — by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('🔇 Member Timed Out')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Duration', value: `${amount} ${unit}`, inline: true },
          { name: 'Reason', value: reason },
        )
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Timeout error:', err.message);
      await interaction.reply({ content: '❌ Failed to timeout that member.', ephemeral: true });
    }
  },
};
