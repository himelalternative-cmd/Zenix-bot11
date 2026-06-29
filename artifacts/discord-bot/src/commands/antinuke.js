const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { getAntinuke, saveAntinuke } = require('../utils/antinukeSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Anti-nuke protection system')
    .setDefaultMemberPermissions(0)
    .addSubcommand(s => s.setName('enable').setDescription('Enable the anti-nuke system'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the anti-nuke system'))
    .addSubcommand(s => s
      .setName('config')
      .setDescription('Configure anti-nuke settings')
      .addStringOption(o => o
        .setName('punishment')
        .setDescription('Punishment for nukers')
        .addChoices(
          { name: 'Kick',    value: 'kick' },
          { name: 'Ban',     value: 'ban' },
          { name: 'Strip Roles', value: 'strip' },
          { name: 'Timeout 24h', value: 'timeout' },
        )
        .setRequired(false)
      )
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel to send anti-nuke logs').setRequired(false))
      .addBooleanOption(o => o.setName('recovery').setDescription('Auto-restore deleted channels/roles').setRequired(false))
    )
    .addSubcommandGroup(g => g
      .setName('whitelist')
      .setDescription('Manage the whitelist')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('Add a user or role to the whitelist')
        .addUserOption(o => o.setName('user').setDescription('User to whitelist').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Role to whitelist').setRequired(false))
      )
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('Remove a user or role from the whitelist')
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(false))
      )
      .addSubcommand(s => s.setName('list').setDescription('View the whitelist'))
    ),

  async execute(interaction) {
    const sub   = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const guild = interaction.guild;
    const settings = getAntinuke(guild.id);

    // ── enable ─────────────────────────────────────────────────────────────────
    if (sub === 'enable') {
      settings.enabled = true;
      saveAntinuke(guild.id, settings);
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Anti-Nuke Enabled')
        .setDescription('Your server is now protected against nuke attacks.')
        .setColor(0x2ecc71)
        .setFooter({ text: 'Powered by Zenix Realm' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── disable ────────────────────────────────────────────────────────────────
    if (sub === 'disable') {
      settings.enabled = false;
      saveAntinuke(guild.id, settings);
      return interaction.reply({ content: '✅ Anti-nuke system disabled.', ephemeral: true });
    }

    // ── config ─────────────────────────────────────────────────────────────────
    if (sub === 'config') {
      const punishment = interaction.options.getString('punishment');
      const logChannel = interaction.options.getChannel('log_channel');
      const recovery   = interaction.options.getBoolean('recovery');

      if (punishment)           settings.punishment    = punishment;
      if (logChannel)           settings.logChannelId  = logChannel.id;
      if (recovery !== null)    settings.recovery      = recovery;

      saveAntinuke(guild.id, settings);

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Anti-Nuke Config')
        .addFields(
          { name: 'Status',      value: settings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Punishment',  value: settings.punishment,  inline: true },
          { name: 'Log Channel', value: settings.logChannelId ? `<#${settings.logChannelId}>` : 'None', inline: true },
          { name: 'Recovery',    value: settings.recovery ? '✅ On' : '❌ Off', inline: true },
          { name: 'Thresholds',  value:
            `Channel Delete: **${settings.thresholds.channelDelete}**/10s\n` +
            `Role Delete: **${settings.thresholds.roleDelete}**/10s\n` +
            `Mass Ban: **${settings.thresholds.ban}**/10s\n` +
            `Mass Kick: **${settings.thresholds.kick}**/10s\n` +
            `Webhook Spam: **${settings.thresholds.webhookCreate}**/10s`
          },
        )
        .setColor(0x010101)
        .setFooter({ text: 'Powered by Zenix Realm • Developer: o4u9x' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── whitelist ──────────────────────────────────────────────────────────────
    if (group === 'whitelist') {
      if (sub === 'add') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        if (!user && !role) return interaction.reply({ content: '❌ Provide a user or role.', ephemeral: true });

        if (user && !settings.whitelist.users.includes(user.id)) settings.whitelist.users.push(user.id);
        if (role && !settings.whitelist.roles.includes(role.id)) settings.whitelist.roles.push(role.id);
        saveAntinuke(guild.id, settings);

        return interaction.reply({
          content: `✅ Added ${user ? `<@${user.id}>` : ''} ${role ? `<@&${role.id}>` : ''} to the whitelist.`,
          ephemeral: true,
        });
      }

      if (sub === 'remove') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        if (!user && !role) return interaction.reply({ content: '❌ Provide a user or role.', ephemeral: true });

        if (user) settings.whitelist.users = settings.whitelist.users.filter(id => id !== user.id);
        if (role) settings.whitelist.roles = settings.whitelist.roles.filter(id => id !== role.id);
        saveAntinuke(guild.id, settings);

        return interaction.reply({
          content: `✅ Removed ${user ? `<@${user.id}>` : ''} ${role ? `<@&${role.id}>` : ''} from the whitelist.`,
          ephemeral: true,
        });
      }

      if (sub === 'list') {
        const users = settings.whitelist.users.map(id => `<@${id}>`).join(', ') || 'None';
        const roles = settings.whitelist.roles.map(id => `<@&${id}>`).join(', ') || 'None';

        const embed = new EmbedBuilder()
          .setTitle('🛡️ Anti-Nuke Whitelist')
          .addFields(
            { name: '👤 Whitelisted Users', value: users },
            { name: '🏷️ Whitelisted Roles', value: roles },
          )
          .setColor(0x010101)
          .setFooter({ text: 'Powered by Zenix Realm • Developer: o4u9x' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },
};
