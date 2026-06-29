const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('messagecount')
    .setDescription('Count the total number of messages in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The channel to count messages in (default: current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    // Counting can take a while — defer so we don't time out
    await interaction.deferReply();

    let total = 0;
    let lastId = null;

    try {
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) break;

        total += batch.size;
        lastId = batch.last().id;

        // Update the user every 1000 messages so they know it's still running
        if (total % 1000 === 0) {
          await interaction.editReply({
            content: `⏳ Counting... **${total.toLocaleString()}** messages so far in ${channel}`,
          });
        }

        if (batch.size < 100) break;
      }
    } catch (err) {
      console.error('[messagecount] Error fetching messages:', err.message);
      return interaction.editReply({
        content: `❌ Failed to count messages in ${channel}. Make sure I have permission to read that channel's message history.`,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Message Count')
      .setDescription(`Total messages in ${channel}: **${total.toLocaleString()}**`)
      .addFields(
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Total Messages', value: total.toLocaleString(), inline: true },
      )
      .setColor(0x010101)
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
