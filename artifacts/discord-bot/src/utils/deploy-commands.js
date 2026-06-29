const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

async function registerCommands() {
  const token    = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_APPLICATION_ID;
  const guildId  = process.env.GUILD_ID;

  if (!token) {
    console.error('[Deploy] ❌ Missing DISCORD_BOT_TOKEN — commands NOT registered.');
    return;
  }
  if (!clientId) {
    console.error('[Deploy] ❌ Missing DISCORD_APPLICATION_ID — commands NOT registered.');
    return;
  }

  const commands     = [];
  const failed       = [];
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  console.log(`[Deploy] Found ${commandFiles.length} command files: ${commandFiles.join(', ')}`);

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command.data && typeof command.data.toJSON === 'function') {
        commands.push(command.data.toJSON());
        console.log(`[Deploy] ✅ Loaded: ${command.data.name}`);
      } else {
        console.warn(`[Deploy] ⚠️  Skipped ${file} — missing data or toJSON`);
      }
    } catch (err) {
      console.error(`[Deploy] ❌ Failed to load ${file}: ${err.message}`);
      failed.push(file);
    }
  }

  if (failed.length) {
    console.error(`[Deploy] ⚠️  ${failed.length} command(s) failed to load: ${failed.join(', ')}`);
  }

  if (!commands.length) {
    console.error('[Deploy] ❌ No commands loaded — skipping Discord registration.');
    return;
  }

  const rest = new REST().setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`[Deploy] Registering ${commands.length} commands to guild ${guildId} (instant)...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`[Deploy] ✅ ${commands.length} guild commands registered successfully!`);
    } else {
      console.log(`[Deploy] Registering ${commands.length} commands globally (up to 1 hour to appear)...`);
      console.log('[Deploy] 💡 Tip: Set GUILD_ID in Railway for instant registration.');
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`[Deploy] ✅ ${commands.length} global commands registered successfully!`);
    }
  } catch (err) {
    console.error('[Deploy] ❌ Discord API error during registration:', err.message);
  }
}

module.exports = { registerCommands };
