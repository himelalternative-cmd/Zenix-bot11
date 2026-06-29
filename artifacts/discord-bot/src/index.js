const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { registerCommands } = require('./utils/deploy-commands');
const { getSettings, saveSettings } = require('./utils/settings');
const { attachEvents } = require('./handlers/antinukeHandler');
const { getGuildAutoReact } = require('./utils/autoReactSettings');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,      // Required for member join/leave events
    GatewayIntentBits.GuildModeration,   // Required for ban events
  ],
});

client.commands = new Collection();
client.prefixCommands = new Collection();

// Load slash commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: ${command.data.name}`);
    }
  } catch (err) {
    console.error(`[Commands] Failed to load ${file}:`, err.message);
  }
}

// Load prefix commands
const handlersPath = path.join(__dirname, 'handlers');
const prefixFile = path.join(handlersPath, 'prefixHandler.js');
if (fs.existsSync(prefixFile)) {
  const { handlePrefix } = require(prefixFile);
  client.handlePrefix = handlePrefix;
}

// Load interaction handler
const { handleInteraction } = require('./handlers/interactionHandler');

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();

  // Auto-rejoin saved voice channels
  const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
  client.vcConnections = new Map();
  for (const [guildId, settings] of Object.entries(getSettings())) {
    if (!settings.vcChannelId) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(settings.vcChannelId);
    if (!channel) continue;
    try {
      const conn = joinVoiceChannel({
        channelId: channel.id,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });
      client.vcConnections.set(guildId, { channelId: channel.id, connection: conn });
      conn.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
            entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          setTimeout(() => {
            try {
              const newConn = joinVoiceChannel({
                channelId: channel.id, guildId,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true, selfMute: true,
              });
              client.vcConnections.set(guildId, { channelId: channel.id, connection: newConn });
            } catch {}
          }, 3_000);
        }
      });
      console.log(`Auto-rejoined VC: ${channel.name} in ${guild.name}`);
    } catch (err) {
      console.error(`Failed to rejoin VC in ${guild.name}:`, err.message);
    }
  }

  // Set bot status based on total order count across all guilds
  const allSettings = getSettings();
  let totalOrders = 0;
  for (const guildId of Object.keys(allSettings)) {
    totalOrders += (allSettings[guildId].orderCount || 0);
  }
  client.user.setActivity(`${totalOrders} orders completed`, { type: 3 }); // 3 = Watching
});

// Prevent unhandled Discord API errors from crashing the bot
client.on('error', err => console.error('Discord client error:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err?.message ?? err));

client.on('interactionCreate', async interaction => {
  try {
    await handleInteraction(client, interaction);
  } catch (err) {
    console.error('interactionCreate error:', err.message);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Auto-react
  if (message.guild) {
    const configs = getGuildAutoReact(message.guild.id);
    const channelConfig = configs[message.channel.id];
    if (channelConfig?.emojis?.length) {
      for (const emoji of channelConfig.emojis) {
        try {
          await message.react(emoji);
        } catch {
          // Invalid or unavailable emoji — skip silently
        }
      }
    }
  }

  if (client.handlePrefix) {
    await client.handlePrefix(message);
  }
});

// Attach anti-nuke event listeners
attachEvents(client);

client.login(process.env.DISCORD_BOT_TOKEN);
