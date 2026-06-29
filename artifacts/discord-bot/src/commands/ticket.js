const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Send the ticket panel to this channel')
    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Create Ticket')
      .setDescription(
        'Do not open the ticket just for fun, otherwise you will either get mute for ' +
        '24 hours or you will get banned.\n\n' +
        'If you do not reply after creating the ticket, you will get a mute for 2 days.'
      )
      .setColor(0x010101)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('Select a category')
      .addOptions(
        { label: 'Claim Reward',  value: 'claim_reward',  emoji: '🎁' },
        { label: 'Report',        value: 'report',        emoji: '❗' },
        { label: 'Buy Something', value: 'buy_something', emoji: '🪙' },
        { label: 'Others',        value: 'others',        emoji: '✨' }
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Use channel.send so the panel is persistent (not tied to interaction token)
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Ticket panel posted!', ephemeral: true });
  },
};
