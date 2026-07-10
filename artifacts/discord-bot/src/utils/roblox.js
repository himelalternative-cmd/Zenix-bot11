// ─── Roblox Group Payout Utility ──────────────────────────────────────────────
// Uses the account's .ROBLOSECURITY cookie (ROBLOX_COOKIE) to send Robux from
// a Group's payout funds to a member via the (unofficial) Group Payouts API.
//
// NOTE: This relies on an undocumented Roblox endpoint and cookie-based auth.
// It is against Roblox's Terms of Service and carries a risk of the account
// being flagged or banned. Use at your own risk.

const COOKIE   = process.env.ROBLOX_COOKIE;
const GROUP_ID = process.env.ROBLOX_GROUP_ID;

function assertConfigured() {
  if (!COOKIE || !GROUP_ID) {
    throw new Error('Roblox payout is not configured (missing ROBLOX_COOKIE or ROBLOX_GROUP_ID).');
  }
}

// ── Fetch a fresh X-CSRF-TOKEN by making a request that Roblox will reject ────
async function getCsrfToken() {
  const res = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST',
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
  });
  const token = res.headers.get('x-csrf-token');
  if (!token) throw new Error('Failed to obtain Roblox CSRF token — cookie may be invalid or expired.');
  return token;
}

// ── Resolve a Roblox username → userId ─────────────────────────────────────────
async function getUserIdByUsername(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });
  const data = await res.json().catch(() => null);
  const match = data?.data?.[0];
  if (!match) return null;
  return { userId: match.id, username: match.name, displayName: match.displayName };
}

// ── Check the group's available payout funds ────────────────────────────────
async function getGroupFunds() {
  assertConfigured();
  const res = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/currency`, {
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch group funds (HTTP ${res.status}).`);
  const data = await res.json();
  return data.robux ?? 0;
}

// ── Send a Robux payout to a specific userId ────────────────────────────────
async function payoutRobux(userId, amount) {
  assertConfigured();
  const csrfToken = await getCsrfToken();

  const res = await fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/payouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken,
      Cookie: `.ROBLOSECURITY=${COOKIE}`,
    },
    body: JSON.stringify({
      PayoutType: 'FixedAmount',
      Recipients: [{ recipientId: userId, recipientType: 'User', amount }],
    }),
  });

  if (res.status === 200 || res.status === 204) {
    return { success: true };
  }

  let errMsg = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    errMsg = body?.errors?.[0]?.message || body?.message || errMsg;
  } catch {}
  return { success: false, error: errMsg };
}

module.exports = {
  getUserIdByUsername,
  getGroupFunds,
  payoutRobux,
  isConfigured: () => Boolean(COOKIE && GROUP_ID),
};
