const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const { COLOR_MAP, resolveColor } = require('../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Send a message to this channel as the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('message').setDescription('Message content').setRequired(true)
    )
    .addBooleanOption(opt =>
      opt.setName('embed').setDescription('Send as embed? (default: false)').setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('color')
        .setDescription('Embed color (preset)')
        .setRequired(false)
        .addChoices(...Object.keys(COLOR_MAP).map(c => ({ name: c, value: c })))
    )
    .addStringOption(opt =>
      opt.setName('hex').setDescription('Custom hex color (e.g. #ff5733)').setRequired(false)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const useEmbed = interaction.options.getBoolean('embed') ?? false;
    const colorChoice = interaction.options.getString('color');
    const hex = interaction.options.getString('hex');

    // Defer and delete the slash command invocation (ephemeral ack)
    await interaction.deferReply({ ephemeral: true });

    let color = 0x5865f2;
    if (hex) {
      const parsed = parseInt(hex.replace('#', ''), 16);
      if (!isNaN(parsed)) color = parsed;
    } else if (colorChoice) {
      color = resolveColor(colorChoice);
    }

    if (useEmbed) {
      const embed = new EmbedBuilder()
        .setDescription(message)
        .setColor(color);
      await interaction.channel.send({ embeds: [embed] });
    } else {
      await interaction.channel.send({ content: message });
    }

    await interaction.editReply({ content: '✅ Message sent.' });
  },
};
