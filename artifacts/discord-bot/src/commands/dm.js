const {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('direct-message')
    .setDescription('Send a DM to a user as the bot')
    .setDefaultMemberPermissions(0)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to DM')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');

    if (target.bot) {
      return interaction.reply({ content: '❌ Cannot DM a bot.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`dm_modal:${target.id}`)
      .setTitle(`DM → ${target.username}`);

    const msgInput = new TextInputBuilder()
      .setCustomId('dm_message')
      .setLabel('Message')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Type your message here. Shift + Enter = new line.')
      .setRequired(true)
      .setMaxLength(2000);

    modal.addComponents(new ActionRowBuilder().addComponents(msgInput));

    await interaction.showModal(modal);
  },
};
