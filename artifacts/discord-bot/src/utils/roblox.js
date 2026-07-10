// ─── Roblox Group Payout Utility ──────────────────────────────────────────────
// Uses the account's .ROBLOSECURITY cookie (ROBLOX_COOKIE) to send Robux from
// a Group's payout funds to a member via the (unofficial) Group Payouts API.
// Automatically solves the Two-Step Verification "challenge" Roblox requires
// on sensitive money-moving requests, using an authenticator TOTP secret.
//
// NOTE: This relies on undocumented Roblox endpoints and cookie-based auth.
// It is against Roblox's Terms of Service and carries a risk of the account
// being flagged or banned. Use at your own risk.

const crypto = require('crypto');

const COOKIE       = process.env.ROBLOX_COOKIE;
const GROUP_ID      = process.env.ROBLOX_GROUP_ID;
const TOTP_SECRET   = process.env.ROBLOX_TOTP_SECRET;

function assertConfigured() {
  if (!COOKIE || !GROUP_ID) {
    throw new Error('Roblox payout is not configured (missing ROBLOX_COOKIE or ROBLOX_GROUP_ID).');
  }
}

// ── TOTP (RFC 6238) — generate a 6-digit authenticator code from the secret ───
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean    = base32.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
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

// Drift (ms) between Roblox's server clock and this container's clock, learned
// from the `Date` response header on each Roblox request. Using server time
// instead of raw local time avoids intermittent "invalid code" failures caused
// by container clock skew.
let _serverTimeDriftMs = 0;

function updateServerTimeDrift(res) {
  const dateHeader = res?.headers?.get?.('date');
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isNaN(serverMs)) {
    _serverTimeDriftMs = serverMs - Date.now();
  }
}

function generateTOTP(secretBase32, timeOffsetSteps = 0) {
  if (!secretBase32) throw new Error('ROBLOX_TOTP_SECRET is not configured.');
  const key     = base32Decode(secretBase32);
  const now     = Date.now() + _serverTimeDriftMs;
  const counter = Math.floor(now / 1000 / 30) + timeOffsetSteps;

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(0, 0);
  counterBuf.writeUInt32BE(counter, 4);

  const hmac   = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24 |
     (hmac[offset + 1] & 0xff) << 16 |
     (hmac[offset + 2] & 0xff) << 8 |
     (hmac[offset + 3] & 0xff)) % 1000000;

  return code.toString().padStart(6, '0');
}

// ── Fetch a fresh X-CSRF-TOKEN by making a request that Roblox will reject ────
async function getCsrfToken() {
  const res = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST',
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
  });
  updateServerTimeDrift(res);
  const token = res.headers.get('x-csrf-token');
  if (!token) throw new Error('Failed to obtain Roblox CSRF token — cookie may be invalid or expired.');
  return token;
}

// ── Get the authenticated account's own userId (needed for 2FA challenge API) ─
let _cachedAuthUserId = null;
async function getAuthenticatedUserId() {
  if (_cachedAuthUserId) return _cachedAuthUserId;
  const res = await fetch('https://users.roblox.com/v1/users/authenticated', {
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch authenticated user (HTTP ${res.status}). Cookie may be invalid/expired.`);
  const data = await res.json();
  _cachedAuthUserId = data.id;
  return data.id;
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
  const res = await fetch(`https://economy.roblox.com/v1/groups/${GROUP_ID}/currency`, {
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch group funds (HTTP ${res.status}). ${bodyText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.robux ?? 0;
}

// ── Solve a Two-Step Verification "challenge" using the authenticator TOTP ────
// Returns the base64 `rblx-challenge-metadata` continuation header value.
async function solveTwoStepChallenge(challengeId, csrfToken, actionType) {
  if (!TOTP_SECRET) {
    throw new Error('2FA challenge required but ROBLOX_TOTP_SECRET is not configured.');
  }

  const authUserId = await getAuthenticatedUserId();
  const resolvedActionType = actionType || 'Generic';

  // With server-time-synced generation this should match on the first try —
  // each challenge is likely single-use, so wrong guesses can burn it. Only
  // fall back to adjacent time-steps if the primary code is rejected.
  const attempts = [0, -1, 1];
  let lastErr = null;

  for (const offset of attempts) {
    const code = generateTOTP(TOTP_SECRET, offset);
    console.log(
      `[roblox] Generated TOTP code for offset ${offset}: ${code} ` +
      `(compare this to your authenticator app at the same moment — if it never matches, ` +
      `ROBLOX_TOTP_SECRET is wrong)`
    );
    const verifyRes = await fetch(
      `https://twostepverification.roblox.com/v1/users/${authUserId}/challenges/authenticator/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Cookie: `.ROBLOSECURITY=${COOKIE}`,
        },
        body: JSON.stringify({ challengeId, actionType: resolvedActionType, code }),
      }
    );

    if (verifyRes.ok) {
      const verifyData = await verifyRes.json();
      console.log(`[roblox] Verify response (offset ${offset}, HTTP ${verifyRes.status}):`, JSON.stringify(verifyData));
      const verificationToken = verifyData.verificationToken;
      if (!verificationToken) {
        lastErr = new Error('2FA verification succeeded but no verificationToken was returned.');
        continue;
      }

      // NOTE: deliberately NOT calling apis.roblox.com/challenge/v1/continue.
      // Every variation tried (inner id, outer id, body fields, headers)
      // returned a 403/404 generic error, meaning that endpoint does not
      // apply to this challenge. The verificationToken from this verify
      // call is embedded directly into the retry's metadata header, which
      // is the flow documented for group-payout twostepverification
      // challenges specifically (as opposed to "chef"-wrapped challenges).
      const challengeMetadata = Buffer.from(JSON.stringify({
        verificationToken,
        rememberDevice: false,
        challengeId,
        actionType: resolvedActionType,
      })).toString('base64');

      return challengeMetadata;
    }

    const errBody = await verifyRes.json().catch(() => null);
    console.log(`[roblox] Verify FAILED (offset ${offset}, HTTP ${verifyRes.status}):`, JSON.stringify(errBody));
    lastErr = new Error(errBody?.errors?.[0]?.message || `2FA verification failed (HTTP ${verifyRes.status}).`);
  }

  throw lastErr;
}

// ── Send a Robux payout to a specific userId (auto-solves 2FA challenge) ──────
async function payoutRobux(userId, amount) {
  assertConfigured();
  let csrfToken = await getCsrfToken();

  const doPayoutRequest = async (extraHeaders = {}) => {
    return fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        PayoutType: 'FixedAmount',
        Recipients: [{ recipientId: userId, recipientType: 'User', amount }],
      }),
    });
  };

  let res = await doPayoutRequest();

  // ── Handle Roblox's Two-Step Verification "challenge" flow ──────────────
  if (res.status === 403) {
    const headerChallengeId = res.headers.get('rblx-challenge-id');
    const challengeType     = res.headers.get('rblx-challenge-type');
    const rawChallengeMeta  = res.headers.get('rblx-challenge-metadata');

    if (headerChallengeId && challengeType === 'twostepverification') {
      try {
        // CSRF token may rotate on a 403 — refresh from this response if present.
        const freshCsrf = res.headers.get('x-csrf-token');
        if (freshCsrf) csrfToken = freshCsrf;

        // Decode the challenge metadata Roblox sent — it can contain its OWN
        // challengeId (which may differ subtly from the header value) plus the
        // actionType/userId this specific challenge was issued for. Using the
        // header's challengeId alone is what caused "Invalid challenge ID".
        let actionType = 'Generic';
        let effectiveChallengeId = headerChallengeId;
        let decodedMeta = null;
        if (rawChallengeMeta) {
          try {
            decodedMeta = JSON.parse(Buffer.from(rawChallengeMeta, 'base64').toString('utf8'));
            if (decodedMeta?.actionType) actionType = decodedMeta.actionType;
            if (decodedMeta?.challengeId) effectiveChallengeId = decodedMeta.challengeId;
          } catch {}
        }

        console.log('[roblox] 2FA challenge received:', {
          headerChallengeId,
          challengeType,
          decodedMeta,
          effectiveChallengeId,
          actionType,
        });

        // Verify succeeds using the INNER challenge id, and the retry must
        // stay consistent with whichever id was actually verified — Roblox
        // rejects the retry ("Challenge failed to authorize request") if the
        // rblx-challenge-id header doesn't match the id embedded in the
        // metadata that was just verified. Use the inner id for BOTH.
        const challengeMetadata = await solveTwoStepChallenge(effectiveChallengeId, csrfToken, actionType);

        res = await doPayoutRequest({
          'rblx-challenge-id': effectiveChallengeId,
          'rblx-challenge-type': 'twostepverification',
          'rblx-challenge-metadata': challengeMetadata,
        });
      } catch (err) {
        return { success: false, error: `2FA challenge failed: ${err.message}` };
      }
    }
  }

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
