/**
 * Netflix code generator automation
 *
 * Flow:
 *  1. Open dailystore.me/panel?tab=orders with session cookies (Tab A)
 *  2. Find the first "Netflix No ADS - No VPN" order → extract code
 *  3. Open netflixkey.xyz in Tab B → enter code → redeem
 *  4. If invalid → back to Tab A → click "Verify And Replace" → wait for
 *     new code → redeem again in Tab B
 *  5. Return { pcLink, mobileLink, tvLink }
 *
 * Required env vars (Railway dashboard):
 *   DAILYSTORE_SESSION_ID   – analytics_session_id cookie value
 *   DAILYSTORE_AUTH_TOKEN   – auth_token cookie value
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const DAILYSTORE_URL = 'https://www.dailystore.me/panel?tab=orders';
const NETFLIXKEY_URL = 'https://netflixkey.xyz';
const TIMEOUT        = 40_000;

// ── Browser ───────────────────────────────────────────────────────────────────
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

// ── Debug screenshot helper ───────────────────────────────────────────────────
async function dbgShot(page, label) {
  try {
    const dir  = path.join(__dirname, '../../data/debug');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${label}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`[netflixGen] screenshot → ${file}`);
  } catch (e) {
    console.warn('[netflixGen] screenshot failed:', e.message);
  }
}

// ── Cookie helper ─────────────────────────────────────────────────────────────
function buildCookies(domain) {
  return [
    { name: 'analytics_session_id', value: process.env.DAILYSTORE_SESSION_ID || '', domain, path: '/' },
    { name: 'auth_token',           value: process.env.DAILYSTORE_AUTH_TOKEN  || '', domain, path: '/' },
  ];
}

// ── Step 1: load the dailystore orders page and extract the Netflix code ──────
async function loadDailystorePage(page) {
  await page.setCookie(...buildCookies('www.dailystore.me'));
  await page.goto(DAILYSTORE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
  await new Promise(r => setTimeout(r, 3000)); // let React hydrate

  const result = await page.evaluate(() => {
    const txt = el => (el?.innerText || el?.textContent || '').trim();

    // ── Find any element that mentions both Netflix and No ADS ──────────────
    const all = Array.from(document.querySelectorAll('*'));
    const container = all.find(el => {
      const t = txt(el).toLowerCase();
      return t.includes('netflix') && t.includes('no ads') && el.children.length < 40;
    });

    if (!container) return { error: 'ORDER_NOT_FOUND' };

    // ── Extract code from the container ────────────────────────────────────
    const codeEl =
      container.querySelector('code') ||
      container.querySelector('input[type="text"]') ||
      container.querySelector('[class*="code" i]') ||
      container.querySelector('[class*="key" i]') ||
      container.querySelector('[class*="token" i]') ||
      container.querySelector('[class*="serial" i]');

    let code = codeEl ? (codeEl.value || txt(codeEl)) : '';

    if (!code) {
      // fallback: longest "word" that looks like a code (alphanum + dashes ≥ 8 chars)
      const match = txt(container).match(/[A-Z0-9]{4,}(?:[- ][A-Z0-9]{4,})*/i);
      if (match) code = match[0].replace(/ /g, '-');
    }

    if (!code) return { error: 'CODE_NOT_FOUND', html: container.innerHTML.slice(0, 500) };
    return { code: code.trim() };
  });

  return result;
}

// ── Step 2: click "Verify And Replace" on the currently loaded dailystore page
async function clickVerifyAndReplace(page) {
  await dbgShot(page, 'before-verify');

  // ── Try JS click on anything that says verify / replace ─────────────────
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], span, div, li, p')
    );

    const keywords = ['verify and replace', 'verify & replace', 'verify&replace',
                      'verify', 'replace', 'refresh code', 'get new'];

    for (const kw of keywords) {
      const el = candidates.find(c =>
        (c.innerText || c.textContent || '').toLowerCase().includes(kw)
      );
      if (el) {
        // Scroll into view and click
        el.scrollIntoView();
        el.click();
        return { clicked: true, text: (el.innerText || el.textContent || '').trim().slice(0, 60) };
      }
    }

    return { clicked: false };
  });

  console.log('[netflixGen] clickVerifyAndReplace result:', clicked);

  if (!clicked.clicked) {
    // Last resort: find by puppeteer XPath
    try {
      const el = await page.$x(
        '//*[contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"verify")]'
      );
      if (el.length > 0) {
        await el[0].click();
        console.log('[netflixGen] XPath verify click succeeded');
        return { clicked: true };
      }
    } catch { /* ignore */ }

    await dbgShot(page, 'verify-not-found');
    return { clicked: false, error: 'VERIFY_BTN_NOT_FOUND' };
  }

  // Wait for page to update with new code
  await new Promise(r => setTimeout(r, 4000));
  await dbgShot(page, 'after-verify');
  return { clicked: true };
}

// ── Step 3: redeem a code on netflixkey.xyz → return links or invalid ─────────
async function redeemOnNetflixKey(page, code) {
  await page.goto(NETFLIXKEY_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
  await new Promise(r => setTimeout(r, 2000));
  await dbgShot(page, 'netflixkey-loaded');

  // ── Type the code ────────────────────────────────────────────────────────
  const inputSelectors = [
    'input[name="code"]',
    'input[placeholder*="code" i]',
    'input[placeholder*="key" i]',
    'input[placeholder*="enter" i]',
    'input[type="text"]',
    'textarea',
  ];

  let typed = false;
  for (const sel of inputSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 4000 });
      await page.click(sel, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type(sel, code, { delay: 40 });
      typed = true;
      console.log(`[netflixGen] Typed code into: ${sel}`);
      break;
    } catch { /* try next */ }
  }

  if (!typed) {
    await dbgShot(page, 'input-not-found');
    throw new Error('Could not find the code input on netflixkey.xyz');
  }

  // ── Click submit ─────────────────────────────────────────────────────────
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:not([disabled])',
    '[role="button"]',
  ];

  for (const sel of submitSelectors) {
    try {
      await page.click(sel);
      console.log(`[netflixGen] Clicked submit: ${sel}`);
      break;
    } catch { /* try next */ }
  }

  await new Promise(r => setTimeout(r, 4000));
  await dbgShot(page, 'netflixkey-result');

  // ── Parse result ─────────────────────────────────────────────────────────
  const result = await page.evaluate(() => {
    const body = document.body.innerText.toLowerCase();

    const invalid =
      body.includes('invalid') || body.includes('not valid') ||
      body.includes('expired')  || body.includes('already used') ||
      body.includes('not found');

    if (invalid) return { valid: false };

    // ── Look for 3 device links ──────────────────────────────────────────
    function findLink(...keywords) {
      for (const kw of keywords) {
        // By link text
        const byText = Array.from(document.querySelectorAll('a, button')).find(el =>
          (el.innerText || '').toLowerCase().includes(kw)
        );
        if (byText?.href) return byText.href;

        // By attribute
        const byAttr = document.querySelector(
          `a[class*="${kw}" i], a[id*="${kw}" i], a[data-device*="${kw}" i]`
        );
        if (byAttr?.href) return byAttr.href;
      }
      return null;
    }

    const pcLink     = findLink('pc', 'windows', 'desktop', 'computer', 'web');
    const mobileLink = findLink('mobile', 'android', 'phone', 'ios', 'app');
    const tvLink     = findLink('tv', 'smart', 'television', 'firestick', 'roku');

    if (pcLink || mobileLink || tvLink) {
      return { valid: true, pcLink, mobileLink, tvLink };
    }

    // ── Fallback: collect all external URLs from page ────────────────────
    const allLinks = Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(h =>
        h.startsWith('http') &&
        !h.includes('netflixkey.xyz') &&
        !h.includes('cdn') &&
        !h.includes('static') &&
        !h.includes('font') &&
        !h.includes('google')
      );

    const unique = [...new Set(allLinks)];
    if (unique.length >= 3) {
      return { valid: true, pcLink: unique[0], mobileLink: unique[1], tvLink: unique[2] };
    }
    if (unique.length > 0) {
      return { valid: true, pcLink: unique[0], mobileLink: unique[1] ?? unique[0], tvLink: unique[2] ?? unique[0] };
    }

    // Maybe the page shows text links or copy-buttons — grab visible URLs
    const urlRx  = /https?:\/\/[^\s"'<>\]]+/g;
    const inHtml = [...new Set(document.body.innerHTML.match(urlRx) || [])].filter(
      u => !u.includes('netflixkey.xyz') && !u.includes('cdn') && !u.includes('static')
    );
    if (inHtml.length >= 1) {
      return { valid: true, pcLink: inHtml[0], mobileLink: inHtml[1] ?? inHtml[0], tvLink: inHtml[2] ?? inHtml[0] };
    }

    return { valid: false, noLinks: true };
  });

  console.log('[netflixGen] Redeem result:', result);
  return result;
}

// ── Main export ───────────────────────────────────────────────────────────────
async function generateNetflix() {
  if (!process.env.DAILYSTORE_SESSION_ID || !process.env.DAILYSTORE_AUTH_TOKEN) {
    throw new Error(
      'DAILYSTORE_SESSION_ID or DAILYSTORE_AUTH_TOKEN env vars are not set. ' +
      'Add them in your Railway dashboard.'
    );
  }

  const browser = await launchBrowser();
  try {
    // Two tabs: A = dailystore, B = netflixkey
    const pageA = await browser.newPage();
    const pageB = await browser.newPage();

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
               'AppleWebKit/537.36 (KHTML, like Gecko) ' +
               'Chrome/120.0.0.0 Safari/537.36';
    await pageA.setUserAgent(ua);
    await pageB.setUserAgent(ua);
    pageA.setDefaultTimeout(TIMEOUT);
    pageB.setDefaultTimeout(TIMEOUT);

    // ── 1. Get code from dailystore (Tab A) ─────────────────────────────────
    const step1 = await loadDailystorePage(pageA);
    if (step1.error) {
      throw new Error(
        step1.error === 'ORDER_NOT_FOUND'
          ? 'No Netflix No ADS - No VPN orders found on dailystore.me.'
          : `Could not extract code from dailystore.me: ${step1.error}`
      );
    }

    let code = step1.code;
    console.log(`[netflixGen] Got code: ${code}`);

    // ── 2. Redeem on netflixkey (Tab B) ─────────────────────────────────────
    let redeemResult = await redeemOnNetflixKey(pageB, code);

    // ── 3. If invalid: Verify & Replace on Tab A → get new code → retry ─────
    if (!redeemResult.valid) {
      console.log('[netflixGen] Code invalid — clicking Verify And Replace...');

      // Tab A is still on dailystore — click the button there
      const verifyResult = await clickVerifyAndReplace(pageA);
      if (!verifyResult.clicked) {
        throw new Error(`Code was invalid and Verify & Replace failed: ${verifyResult.error}`);
      }

      // Reload the dailystore page to pick up the new replacement code
      const step2reload = await loadDailystorePage(pageA);
      if (step2reload.error || !step2reload.code) {
        throw new Error('Could not retrieve replacement code after Verify & Replace.');
      }

      code = step2reload.code;
      console.log(`[netflixGen] Replacement code: ${code}`);

      redeemResult = await redeemOnNetflixKey(pageB, code);

      if (!redeemResult.valid) {
        if (redeemResult.noLinks) {
          throw new Error('Code redeemed but no device links found on netflixkey.xyz. Check the debug screenshots.');
        }
        throw new Error('Replacement code was also invalid. Please check your dailystore.me orders manually.');
      }
    }

    if (redeemResult.noLinks) {
      throw new Error('Code redeemed but no device links found. Check the debug screenshots in data/debug/.');
    }

    return {
      pcLink:     redeemResult.pcLink     || null,
      mobileLink: redeemResult.mobileLink || null,
      tvLink:     redeemResult.tvLink     || null,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { generateNetflix };
