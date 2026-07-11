# Discord Order Management Bot

A Discord.js v14 bot for service-based Discord servers with order management, payment submission, and Robux ↔ BDT conversion.

## Features

- **Order Management** — Post orders with embeds, auto-DM buyers, track order counts
- **Payment Submission** — `!Pay` command with TRX ID modal and proof upload
- **Robux Converter** — `!500 BDT`, `!1000 RBX`, etc.

## Setup

### Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Your bot token from Discord Developer Portal |
| `DISCORD_APPLICATION_ID` | Your application/client ID |
| `ROBLOX_GROUP_ID` | Your Roblox community group ID, used for the Robux payout feature |
| `ROBLOX_COOKIE` | Your Roblox account's `.ROBLOSECURITY` cookie — used to send group fund payouts. Keep this secret; whoever has it can fully control your Roblox account. |
| `ROBLOX_TOTP_SECRET` | The authenticator secret key from enabling Two-Step Verification (authenticator app) on that Roblox account. Required to auto-answer the "challenge" Roblox puts on payouts. Keep this secret too. |

### Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select this repo, Railway auto-detects Node.js
4. Add environment variables in Railway dashboard:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_APPLICATION_ID`
5. Deploy — Railway will run `node src/index.js`

## Slash Commands

> All commands below require **Administrator** permission except `/chat` (requires Manage Guild).

| Command | Description |
|---|---|
| `/order` | Post a completed order to the order channel |
| `/orderid set <prefix>` | Set the order ID prefix (default: `ORDER`) |
| `/setup title <title>` | Set the order embed title |
| `/setup dm-message <msg>` | Configure auto-DM sent to buyers |
| `/setup item add <name>` | Add item to autocomplete list |
| `/setup item remove <name>` | Remove item from autocomplete list |
| `/set order channel <#channel>` | Set the channel where orders are posted |
| `/clear order` | Reset order count to 0 |
| `/add order <amount>` | Add to the order count |
| `/chat <message>` | Send a message as the bot (Manage Guild only) |

## Prefix Commands

| Command | Result |
|---|---|
| `!Pay` | Show payment methods + submission form |
| `!500 BDT` / `!1000 TK` / `!250 T` | Convert BDT → Robux |
| `!1000 RB` / `!2500 RBX` / `!500 Robux` | Convert Robux → BDT |
| `!check <RobloxUsername>` | Check whether a Roblox user is eligible for a Robux payout (must be a community group member for 14 days) |
| `!setjoin <RobloxUsername> <daysAgo>` | **Admin only.** Backdate a user's tracked join date (e.g. for members who joined before this feature existed) |

## Robux Payout (`/buy` → Robux)

- `/buy` now includes a built-in **Robux** item (no setup needed) at a fixed rate of **1 Robux = 0.9 ZP**.
- Selecting it opens a form asking for the buyer's Roblox username and the Robux amount.
- The bot checks that the Roblox user has been a member of your group (`ROBLOX_GROUP_ID`) for at least 14 days — approximated as the first time the bot ever saw them as a member (Roblox's public API doesn't expose the real join date).
- If eligible and the buyer has enough ZP, the bot sends the Robux directly via your group's funds using `ROBLOX_COOKIE`, then deducts the ZP and posts to the order channel.
- If the payout call fails for any reason, the buyer is **not charged**.
- Roblox may require **Two-Step Verification** to authorize a payout. If `ROBLOX_TOTP_SECRET` is set, the bot solves this automatically using the same authenticator code your 2FA app would generate. This relies on an undocumented Roblox flow and can occasionally fail — check the Railway logs for `[robloxClient] 2FA challenge received` / `2FA verify failed` if a payout is rejected with a challenge error.

## Color Palette

Available for all color options: `Red`, `Orange`, `Yellow`, `Green`, `Teal`, `Blue`, `Indigo`, `Purple`, `Pink`, `White`, `Black`, `Gold`, `Cyan`, `Lime`, `Blurple`

## Data Storage

Settings are stored per-guild in `data/guild-settings.json` (auto-created). This file is gitignored — Railway persists it via its filesystem as long as the service runs. For permanent persistence across redeploys, consider a Railway volume or a free database.

## Editing Payment Numbers

Open `src/handlers/payHandler.js` and find the `PAYMENT_EMBED` constant near the top — edit the numbers there.

## Editing Conversion Rate

Open `src/handlers/prefixHandler.js` and change `const CONVERSION_RATE = 0.9`.
