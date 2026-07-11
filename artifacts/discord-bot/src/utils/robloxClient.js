// Thin wrapper around Roblox's public/authenticated web APIs.
// Uses global fetch (Node 18+).

const USERS_API  = 'https://users.roblox.com';
const GROUPS_API = 'https://groups.roblox.com';
const AUTH_API   = 'https://auth.roblox.com';

let cachedCsrfToken = null;

function getCookie() {
  const cookie = process.env.ROBLOX_COOKIE;
  if (!cookie) throw new Error('ROBLOX_COOKIE is not configured.');
  return cookie.startsWith('.ROBLOSECURITY=') ? cookie : `.ROBLOSECURITY=${cookie}`;
}

// ── Resolve a Roblox username -> { id, name, displayName } ────────────────────
async function resolveUserId(username) {
  const res = await fetch(`${USERS_API}/v1/usernames/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });

  if (!res.ok) throw new Error(`Roblox username lookup failed (${res.status}).`);

  const json = await res.json();
  const entry = json?.data?.[0];
  if (!entry) return null;

  return { id: entry.id, name: entry.name, displayName: entry.displayName };
}

// ── Check whether a userId is currently a member of groupId ───────────────────
async function isGroupMember(groupId, userId) {
  const res = await fetch(`${GROUPS_API}/v1/users/${userId}/groups/roles`);
  if (!res.ok) throw new Error(`Roblox group membership lookup failed (${res.status}).`);

  const json = await res.json();
  const membership = (json?.data ?? []).find(g => String(g.group?.id) === String(groupId));
  return Boolean(membership);
}

// ── CSRF token handling (required for POST requests) ───────────────────────────
async function fetchCsrfToken() {
  const res = await fetch(`${AUTH_API}/v2/logout`, {
    method: 'POST',
    headers: { Cookie: getCookie() },
  });
  const token = res.headers.get('x-csrf-token');
  if (!token) throw new Error('Could not obtain Roblox CSRF token — the account cookie may be invalid or expired.');
  cachedCsrfToken = token;
  return token;
}

async function robloxAuthedRequest(url, options = {}, retry = true) {
  const token = cachedCsrfToken || (await fetchCsrfToken());

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Cookie: getCookie(),
      'X-CSRF-TOKEN': token,
      'Content-Type': 'application/json',
    },
  });

  // CSRF token expired/rotated — refresh once and retry.
  if (res.status === 403 && retry) {
    cachedCsrfToken = null;
    await fetchCsrfToken();
    return robloxAuthedRequest(url, options, false);
  }

  return res;
}

// ── Send a group funds payout to a single user ─────────────────────────────────
async function sendGroupPayout(groupId, userId, robuxAmount) {
  const res = await robloxAuthedRequest(`${GROUPS_API}/v1/groups/${groupId}/payouts`, {
    method: 'POST',
    body: JSON.stringify({
      PayoutType: 'FixedAmount',
      Recipients: [{ recipientId: userId, recipientType: 'User', amount: robuxAmount }],
    }),
  });

  if (res.ok) return { success: true };

  let message = `Roblox payout failed (HTTP ${res.status}).`;
  try {
    const errJson = await res.json();
    if (errJson?.errors?.[0]?.message) message = errJson.errors[0].message;
  } catch {
    // ignore parse failure, use generic message
  }
  return { success: false, error: message, status: res.status };
}

module.exports = { resolveUserId, isGroupMember, sendGroupPayout };
