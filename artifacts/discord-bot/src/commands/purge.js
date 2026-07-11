const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o
      .setName('amount')
      .setDescription('Number of messages to delete (1-100)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
    )
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false)),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const filtered = user ? messages.filter(m => m.author.id === user.id) : messages;
      const toDelete = [...filtered.values()].slice(0, amount);

      if (!toDelete.length) {
        return interaction.editReply({ content: 'ℹ️ No matching messages found to delete.' });
      }

      const deleted = await interaction.channel.bulkDelete(toDelete, true);

      await interaction.editReply({
        content: `🧹 Deleted **${deleted.size}** message(s)${user ? ` from **${user.tag}**` : ''}.`,
      });
    } catch (err) {
      console.error('Purge error:', err.message);
      await interaction.editReply({
        content: '❌ Failed to delete messages. Note: Discord only allows bulk-deleting messages younger than 14 days.',
      });
    }
  },
};
