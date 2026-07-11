// Thin wrapper around Roblox's public/authenticated web APIs.
// Uses global fetch (Node 18+).

const crypto = require('crypto');

const USERS_API  = 'https://users.roblox.com';
const GROUPS_API = 'https://groups.roblox.com';
const AUTH_API   = 'https://auth.roblox.com';
const TWOSV_API  = 'https://twostepverification.roblox.com';

let cachedCsrfToken = null;

function getCookie() {
  const cookie = process.env.ROBLOX_COOKIE;
  if (!cookie) throw new Error('ROBLOX_COOKIE is not configured.');
  return cookie.startsWith('.ROBLOSECURITY=') ? cookie : `.ROBLOSECURITY=${cookie}`;
}

// ── TOTP (RFC 6238) — generates the same 6-digit code an authenticator app
// would show, from the account's Two-Step Verification secret key. Needed to
// auto-answer the "challenge" Roblox puts on sensitive money-moving requests
// like group payouts. ──────────────────────────────────────────────────────
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Drift between Roblox's server clock and this process's clock, learned from
// the `Date` response header on every Roblox request. TOTP codes are time
// windowed (30s), so even a few seconds of container clock skew can produce a
// code that looks right locally but Roblox rejects as invalid.
let serverTimeDriftMs = 0;

function trackServerTime(res) {
  const dateHeader = res?.headers?.get?.('date');
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isNaN(serverMs)) serverTimeDriftMs = serverMs - Date.now();
}

function generateTotp(secretBase32, stepOffset = 0) {
  const key = base32Decode(secretBase32);
  const nowMs = Date.now() + serverTimeDriftMs;
  const counter = Math.floor(nowMs / 1000 / 30) + stepOffset;

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(0, 0);
  counterBuf.writeUInt32BE(counter, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;

  return code.toString().padStart(6, '0');
}

let cachedAuthUserId = null;
async function getAuthenticatedUserId() {
  if (cachedAuthUserId) return cachedAuthUserId;
  const res = await fetch(`${USERS_API}/v1/users/authenticated`, {
    headers: { Cookie: getCookie() },
  });
  if (!res.ok) throw new Error(`Could not identify the Roblox payout account (HTTP ${res.status}). Cookie may be invalid/expired.`);
  const data = await res.json();
  cachedAuthUserId = data.id;
  return cachedAuthUserId;
}

// ── Solve a "twostepverification" challenge using the account's authenticator
// TOTP secret. Returns the base64 `rblx-challenge-metadata` value to send on
// the retried request. ─────────────────────────────────────────────────────
//
// Roblox's challenge metadata carries TWO different ids and they are NOT
// interchangeable:
//   - metadata.genericChallengeId  — the outer/session id (matches the
//     rblx-challenge-id response header). Used at the transport layer only.
//   - metadata.challengeId         — the inner, per-challenge UUID. This is
//     the one the authenticator "verify" call actually expects; passing the
//     generic/header id here is what produces "Invalid challenge ID".
// metadata.userId identifies which account must complete the challenge —
// prefer it over a separately-fetched authenticated-user id, since it's
// exactly what Roblox told us this challenge is for.
async function solveTwoStepChallenge({ headerChallengeId, actionType, csrfToken, originalMetadata }) {
  const totpSecret = process.env.ROBLOX_TOTP_SECRET;
  if (!totpSecret) {
    throw new Error('Roblox is asking for Two-Step Verification but ROBLOX_TOTP_SECRET is not configured.');
  }

  const innerChallengeId = originalMetadata?.challengeId || headerChallengeId;
  const targetUserId = originalMetadata?.userId || (await getAuthenticatedUserId());
  const resolvedActionType = actionType || 'Generic';

  // The code is time-windowed and Roblox's challenges are typically single-use,
  // so try the current 30s step first and only fall back to adjacent steps if
  // that's rejected (covers small clock drift even after syncing to the server).
  let lastError = null;
  for (const stepOffset of [0, -1, 1]) {
    const code = generateTotp(totpSecret, stepOffset);

    const verifyRes = await fetch(
      `${TWOSV_API}/v1/users/${targetUserId}/challenges/authenticator/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Cookie: getCookie(),
        },
        body: JSON.stringify({ challengeId: innerChallengeId, actionType: resolvedActionType, code }),
      }
    );
    trackServerTime(verifyRes);

    if (verifyRes.ok) {
      const verifyData = await verifyRes.json();
      const verificationToken = verifyData?.verificationToken;
      if (!verificationToken) {
        lastError = new Error('Roblox accepted the 2FA code but returned no verification token.');
        continue;
      }

      // Roblox's retry expects the FULL original metadata object back, with
      // only verificationToken/rememberDevice added — the ids and actionType
      // it already contains (challengeId, genericChallengeId, userId, ...)
      // must be preserved as-is, not overwritten with the outer header id.
      const metadataObj = {
        ...(originalMetadata || {}),
        verificationToken,
        rememberDevice: false,
      };
      return Buffer.from(JSON.stringify(metadataObj)).toString('base64');
    }

    const errBody = await verifyRes.json().catch(() => null);
    console.error(
      `[robloxClient] 2FA verify failed (step offset ${stepOffset}, HTTP ${verifyRes.status}):`,
      JSON.stringify(errBody)
    );
    lastError = new Error(errBody?.errors?.[0]?.message || `2FA verification failed (HTTP ${verifyRes.status}).`);
  }

  throw lastError;
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

async function robloxAuthedRequest(url, options = {}, { retryCsrf = true, retryChallenge = true } = {}) {
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
  trackServerTime(res);

  if (res.status === 403) {
    const challengeId = res.headers.get('rblx-challenge-id');
    const challengeType = res.headers.get('rblx-challenge-type');
    const rawChallengeMetadata = res.headers.get('rblx-challenge-metadata');

    // Roblox is asking for Two-Step Verification on this request.
    if (challengeId && challengeType === 'twostepverification' && retryChallenge) {
      let decodedMetadata = null;
      let actionType = 'Generic';
      if (rawChallengeMetadata) {
        try {
          decodedMetadata = JSON.parse(Buffer.from(rawChallengeMetadata, 'base64').toString('utf8'));
          if (decodedMetadata?.actionType) actionType = decodedMetadata.actionType;
        } catch (err) {
          console.error('[robloxClient] Failed to decode rblx-challenge-metadata:', err.message);
        }
      }

      console.log('[robloxClient] 2FA challenge received:', {
        challengeId,
        challengeType,
        actionType,
        decodedMetadata,
      });

      const freshCsrf = res.headers.get('x-csrf-token');
      if (freshCsrf) cachedCsrfToken = freshCsrf;

      const challengeMetadata = await solveTwoStepChallenge({
        headerChallengeId: challengeId,
        actionType,
        csrfToken: cachedCsrfToken,
        originalMetadata: decodedMetadata,
      });

      // The payout endpoint tracks challenges by the SPECIFIC inner id
      // (decodedMetadata.challengeId), not the generic session id from the
      // header — using the generic id here is what produced "Challenge
      // failed to authorize request" on the previous attempt.
      const retryChallengeId = decodedMetadata?.challengeId || challengeId;

      console.log('[robloxClient] Retrying with solved challenge:', {
        retryChallengeIdHeader: retryChallengeId,
        challengeMetadataDecoded: JSON.parse(Buffer.from(challengeMetadata, 'base64').toString('utf8')),
      });

      const retryRes = await robloxAuthedRequest(
        url,
        {
          ...options,
          headers: {
            ...(options.headers || {}),
            'rblx-challenge-id': retryChallengeId,
            'rblx-challenge-type': 'twostepverification',
            'rblx-challenge-metadata': challengeMetadata,
          },
        },
        { retryCsrf, retryChallenge: false }
      );

      if (!retryRes.ok) {
        const retryBody = await retryRes.clone().json().catch(() => null);
        console.error(
          `[robloxClient] Retry after solved challenge still failed (HTTP ${retryRes.status}):`,
          JSON.stringify(retryBody)
        );
      }

      return retryRes;
    }

    // Plain CSRF token expiry/rotation — refresh once and retry.
    if (retryCsrf) {
      cachedCsrfToken = null;
      await fetchCsrfToken();
      return robloxAuthedRequest(url, options, { retryCsrf: false, retryChallenge });
    }
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
