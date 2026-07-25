/**
 * Netflix code generator automation
 *
 * Flow:
 *  1. Open dailystore.me/panel?tab=orders with session cookies
 *  2. Find the first "Netflix No ADS - No VPN" order with an available code
 *  3. Redeem the code on netflixkey.xyz
 *  4. If netflixkey says the code is invalid → click "Verify And Replace" on
 *     the same dailystore order → get the replacement code → try again (once)
 *  5. Return { pcLink, mobileLink, tvLink }
 *
 * Required env vars:
 *   DAILYSTORE_SESSION_ID   – analytics_session_id cookie value
 *   DAILYSTORE_AUTH_TOKEN   – auth_token cookie value
 */

const puppeteer = require('puppeteer');

const DAILYSTORE_URL = 'https://www.dailystore.me/panel?tab=orders';
const NETFLIXKEY_URL = 'https://netflixkey.xyz';
const TIMEOUT        = 30_000;

// ── Browser launch ────────────────────────────────────────────────────────────
function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
}

// ── Cookie helper ─────────────────────────────────────────────────────────────
function buildCookies(domain) {
  return [
    {
      name:   'analytics_session_id',
      value:  process.env.DAILYSTORE_SESSION_ID || '',
      domain,
      path:   '/',
    },
    {
      name:   'auth_token',
      value:  process.env.DAILYSTORE_AUTH_TOKEN || '',
      domain,
      path:   '/',
    },
  ];
}

// ── Fetch a Netflix code (and optionally trigger Verify & Replace) ────────────
/**
 * @param {import('puppeteer').Page} page
 * @param {boolean} clickVerifyAndReplace  – if true, click the button before reading
 * @returns {Promise<{code: string, verifySelector: string|null}>}
 */
async function fetchCodeFromDailystore(page, clickVerifyAndReplace = false) {
  await page.setCookie(...buildCookies('www.dailystore.me'));
  await page.goto(DAILYSTORE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });

  // Wait for orders to render
  await page.waitForSelector('body', { timeout: TIMEOUT });
  await new Promise(r => setTimeout(r, 2000)); // let React/Vue hydrate

  // ── Locate the Netflix No ADS - No VPN order row ─────────────────────────
  // The page likely renders a list/table of orders. We search for any element
  // whose text contains both "Netflix" and "No ADS" (case-insensitive).
  const orderInfo = await page.evaluate((doClick) => {
    // Find all candidate elements
    const allEls = Array.from(document.querySelectorAll('*'));

    // Find the container that mentions Netflix + No ADS
    const container = allEls.find(el => {
      const txt = el.innerText || '';
      return (
        txt.toLowerCase().includes('netflix') &&
        txt.toLowerCase().includes('no ads') &&
        // Avoid top-level containers that wrap the whole page
        el.children.length < 30
      );
    });

    if (!container) return { error: 'ORDER_NOT_FOUND' };

    // If we need to click "Verify And Replace" first
    if (doClick) {
      // Look for a button with that text inside or near the container
      const btn = Array.from(container.querySelectorAll('button, a, [role="button"]'))
        .find(b => (b.innerText || '').toLowerCase().includes('verify'));
      if (!btn) {
        // Try searching the wider parent
        const parent = container.parentElement;
        const btnParent = parent
          ? Array.from(parent.querySelectorAll('button, a, [role="button"]'))
              .find(b => (b.innerText || '').toLowerCase().includes('verify'))
          : null;
        if (!btnParent) return { error: 'VERIFY_BTN_NOT_FOUND' };
        btnParent.click();
      } else {
        btn.click();
      }
      return { clicked: true };
    }

    // ── Extract the code ─────────────────────────────────────────────────────
    // Common patterns: a <code>, <span>, <input>, or <p> holding the key
    const codeEl =
      container.querySelector('code') ||
      container.querySelector('input[type="text"]') ||
      container.querySelector('[class*="code"]') ||
      container.querySelector('[class*="key"]') ||
      container.querySelector('[class*="token"]');

    let code = '';
    if (codeEl) {
      code = (codeEl.value || codeEl.innerText || '').trim();
    }

    // Fallback: look for a long alphanumeric string in the text nodes
    if (!code) {
      const txt = container.innerText || '';
      const match = txt.match(/[A-Z0-9]{8,}(?:[-][A-Z0-9]{4,})*/i);
      if (match) code = match[0];
    }

    if (!code) return { error: 'CODE_NOT_FOUND' };
    return { code };
  }, clickVerifyAndReplace);

  return orderInfo;
}

// ── Redeem on netflixkey.xyz and return the 3 links ──────────────────────────
/**
 * @param {import('puppeteer').Page} page
 * @param {string} code
 * @returns {Promise<{valid: boolean, pcLink?: string, mobileLink?: string, tvLink?: string}>}
 */
async function redeemOnNetflixKey(page, code) {
  await page.goto(NETFLIXKEY_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
  await new Promise(r => setTimeout(r, 1500));

  // ── Type the code into the input ─────────────────────────────────────────
  // Try common selectors for the code input
  const inputSel = [
    'input[name="code"]',
    'input[placeholder*="code" i]',
    'input[placeholder*="key" i]',
    'input[type="text"]',
    'input',
  ];

  let inputFound = false;
  for (const sel of inputSel) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel, { clickCount: 3 });
      await page.type(sel, code, { delay: 30 });
      inputFound = true;
      break;
    } catch { /* try next */ }
  }

  if (!inputFound) throw new Error('Could not find the code input on netflixkey.xyz');

  // ── Click submit / redeem button ─────────────────────────────────────────
  const btnSel = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:not([disabled])',
  ];

  for (const sel of btnSel) {
    try {
      await page.click(sel);
      break;
    } catch { /* try next */ }
  }

  await new Promise(r => setTimeout(r, 3000)); // wait for response

  // ── Check result ──────────────────────────────────────────────────────────
  const result = await page.evaluate(() => {
    const bodyText = document.body.innerText.toLowerCase();

    // Check for explicit invalid signal
    const invalid =
      bodyText.includes('invalid') ||
      bodyText.includes('not valid') ||
      bodyText.includes('expired') ||
      bodyText.includes('already used');

    if (invalid) return { valid: false };

    // ── Extract the 3 device links ────────────────────────────────────────
    // Look for links/buttons labelled PC, Mobile, TV (any case)
    const allLinks = Array.from(document.querySelectorAll('a, button'));

    function findLink(keyword) {
      // First try links with matching text
      const byText = allLinks.find(el =>
        (el.innerText || '').toLowerCase().includes(keyword.toLowerCase())
      );
      if (byText && byText.href) return byText.href;

      // Try elements with matching class or id
      const byAttr = document.querySelector(
        `[class*="${keyword}" i], [id*="${keyword}" i], [data-type*="${keyword}" i]`
      );
      if (byAttr && byAttr.href) return byAttr.href;

      return null;
    }

    const pcLink     = findLink('pc')     || findLink('windows') || findLink('computer') || findLink('desktop');
    const mobileLink = findLink('mobile') || findLink('android') || findLink('phone');
    const tvLink     = findLink('tv')     || findLink('smart tv') || findLink('television');

    if (!pcLink && !mobileLink && !tvLink) {
      // Maybe links are shown as plain text / copy buttons
      // Try to find any URLs in the page
      const urlPattern = /https?:\/\/[^\s"'<>]+/g;
      const allText    = document.body.innerHTML;
      const urls       = [...new Set(allText.match(urlPattern) || [])].filter(
        u => !u.includes('netflixkey.xyz') && !u.includes('cdn') && !u.includes('static')
      );
      if (urls.length >= 3) {
        return { valid: true, pcLink: urls[0], mobileLink: urls[1], tvLink: urls[2] };
      }
      if (urls.length > 0) {
        return { valid: true, pcLink: urls[0], mobileLink: urls[1] || urls[0], tvLink: urls[2] || urls[0] };
      }
      return { valid: false, error: 'LINKS_NOT_FOUND' };
    }

    return { valid: true, pcLink, mobileLink, tvLink };
  });

  return result;
}

// ── Main exported function ────────────────────────────────────────────────────
/**
 * Full Netflix generation flow.
 * @returns {Promise<{pcLink: string, mobileLink: string, tvLink: string}>}
 * @throws {Error} with a human-readable message if anything fails
 */
async function generateNetflix() {
  if (!process.env.DAILYSTORE_SESSION_ID || !process.env.DAILYSTORE_AUTH_TOKEN) {
    throw new Error(
      'DAILYSTORE_SESSION_ID or DAILYSTORE_AUTH_TOKEN env vars are not set. ' +
      'Add them in your Railway dashboard.'
    );
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36'
    );
    page.setDefaultTimeout(TIMEOUT);

    // ── Step 1: get a code from dailystore.me ───────────────────────────────
    const codeResult = await fetchCodeFromDailystore(page, false);

    if (codeResult.error) {
      throw new Error(
        codeResult.error === 'ORDER_NOT_FOUND'
          ? 'No Netflix No ADS - No VPN orders found in dailystore.me.'
          : `Could not extract code from dailystore.me: ${codeResult.error}`
      );
    }

    let code = codeResult.code;
    console.log(`[netflixGen] Got code: ${code}`);

    // ── Step 2: redeem on netflixkey.xyz ────────────────────────────────────
    let redeemResult = await redeemOnNetflixKey(page, code);
    console.log(`[netflixGen] Redeem result:`, redeemResult);

    // ── Step 3: if invalid → Verify & Replace → retry once ─────────────────
    if (!redeemResult.valid) {
      console.log('[netflixGen] Code invalid — triggering Verify And Replace...');

      // Navigate back to dailystore and click Verify & Replace
      const verifyResult = await fetchCodeFromDailystore(page, true);

      if (verifyResult.error) {
        throw new Error(`Code was invalid and Verify & Replace failed: ${verifyResult.error}`);
      }

      // Wait for the page to update with the new code
      await new Promise(r => setTimeout(r, 3000));

      // Fetch the replacement code
      const newCodeResult = await fetchCodeFromDailystore(page, false);
      if (newCodeResult.error || !newCodeResult.code) {
        throw new Error('Could not retrieve replacement code after Verify & Replace.');
      }

      code = newCodeResult.code;
      console.log(`[netflixGen] Replacement code: ${code}`);

      // Redeem the replacement
      redeemResult = await redeemOnNetflixKey(page, code);
      console.log(`[netflixGen] Replacement redeem result:`, redeemResult);

      if (!redeemResult.valid) {
        throw new Error(
          redeemResult.error === 'LINKS_NOT_FOUND'
            ? 'Code was redeemed but device links could not be found on netflixkey.xyz.'
            : 'Replacement code was also invalid. Please check your dailystore.me orders manually.'
        );
      }
    }

    return {
      pcLink:     redeemResult.pcLink     || '_(not found)_',
      mobileLink: redeemResult.mobileLink || '_(not found)_',
      tvLink:     redeemResult.tvLink     || '_(not found)_',
    };
  } finally {
    await browser.close();
  }
}

module.exports = { generateNetflix };
