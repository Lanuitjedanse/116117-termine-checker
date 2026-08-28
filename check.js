const { chromium } = require("playwright");
const fetch = require("node-fetch");
const process = require("process");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const ETERM_URL = process.env.ETERM_URL;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

const QUALIFICATION_1 = process.env.REQUIRED_QUALIFICATION_1;
const QUALIFICATION_2 = process.env.REQUIRED_QUALIFICATION_2;

const STORE_FILE = path.join(__dirname, "store.json");

function loadSeen() {
  try {
    if (!fs.existsSync(STORE_FILE)) return new Set();
    const data = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(data);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    console.warn("Failed to load store.json, starting fresh:", e);
    return new Set();
  }
}

function saveSeen(set) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify([...set], null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write store.json:", e);
  }
}

async function sendPush(title, message) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
    console.log("Pushover credentials not set; skipping push. Title:", title);
    return;
  }

  const body = new URLSearchParams();
  body.append("token", PUSHOVER_TOKEN);
  body.append("user", PUSHOVER_USER);
  body.append("message", message);
  body.append("title", title);
  body.append("url", ETERM_URL);
  body.append("url_title", "Open appointments");

  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Pushover error: " + res.status + " " + text);
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRelevantAppointments(page) {
  const moreAppointmentsBtn = page.locator(
    ".wp2-terminsuche__more-termine-button",
  );

  if (await moreAppointmentsBtn.isVisible()) {
    await moreAppointmentsBtn.click();
  }

  const appointmentCards = page.locator(".wp2-terminsuche__terminprofil");

  const count = await appointmentCards.count();

  const appointments = [];

  if (count) {
    for (let i = 0; i < count; i++) {
      const card = appointmentCards.nth(i);

      const title = await card
        .locator(".wp2-terminprofil-info__anzeigename")
        .first()
        .textContent();

      const date = await page
        .locator(`#wp2-terminprofil-${i}-headline time`)
        .first()
        .textContent();

      const appointmentDate = date.split(",");

      card.locator(".wp2-terminprofil-info__anzeigename").first().click();

      const modal = await page.locator(
        ".wp2-terminprofil-details-modal__container",
      );

      await modal.waitFor({ state: "visible" });

      const qualifications = await modal
        .locator(".wp2-terminprofil-details-info-block__container")
        .filter({ hasText: "Qualifikationen" });

      await qualifications.waitFor({ state: "visible" });

      const requiredQualifications = Object.entries(process.env)
        .filter(([key]) => key.startsWith("REQUIRED_QUALIFICATION_"))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => value.trim());

      const qualificationRegex = new RegExp(
        requiredQualifications.map(escapeRegex).join("|"),
      );

      const qualificationTags = qualifications.getByText(qualificationRegex);

      const qualificationsCount = await qualificationTags.count();

      if (qualificationsCount === requiredQualifications.length) {
        appointments.push(`${appointmentDate[1].trim()} | ${title.trim()}`);
      }

      await modal.getByRole("button", { name: "Schließen" }).click();
      await modal.waitFor({ state: "hidden" });
    }
  }
  return appointments;
}

async function run() {
  const headless = process.env.HEADLESS !== "false";
  const slowMo = parseInt(process.env.PLAYWRIGHT_SLOWMO || "0", 10) || 0;
  const launchOptions = {
    headless: false,
    slowMo,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  };
  if (process.env.PROXY) launchOptions.proxy = { server: process.env.PROXY };

  const browser = await chromium.launch(launchOptions);

  const url = ETERM_URL ? ETERM_URL.replace(/^http:\/\//i, "https://") : null;
  if (!url) throw new Error("ETERM_URL not set");

  const context = await browser.newContext({
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: process.env.LOCALE || "de-DE",
    timezoneId: process.env.TIMEZONE || "Europe/Berlin",
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      "accept-language": process.env.ACCEPT_LANGUAGE || "de-DE,de;q=0.9",
    },
  });

  // Mask common automation properties before any page scripts run
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "languages", {
        get: () => ["de-DE", "de"],
      });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    } catch (e) {}
  });

  const page = await context.newPage();

  try {
    console.log("Navigating to", url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });

    // Try to dismiss common cookie/consent dialogs (best-effort)
    try {
      await page.click(".cookies-info-close", { timeout: 2000 });
    } catch (e) {}

    // Inject the user's DOM-manipulation snippet to filter out "gruppe" and click filters
    await page.evaluate(() => {
      const header = document.querySelectorAll(".ets-search-filter-header")[0];
      if (header) header.click();

      setTimeout(() => {
        const bubbles = document.querySelectorAll(
          ".ets-search-filter-distance-bubble",
        );
        if (bubbles && bubbles[2]) bubbles[2].click();
      }, 1200);
    }, 0);

    // Wait a bit for the injected actions to run and for the DOM to settle
    await page.waitForTimeout(3500);

    const seen = loadSeen();

    const appointments = await getRelevantAppointments(page);

    console.log("appointments", appointments);

    const newAppointments = appointments.filter((title) => !seen.has(title));

    console.log("Found", appointments.length, "appointments total.");
    console.log("Found", newAppointments.length, "new appointments.");

    if (newAppointments.length > 0) {
      const title = `Found ${newAppointments.length} new appointment(s)`;
      const message = newAppointments.join("\n");
      console.log("Sending notification:", message);
      await sendPush(title, message);
      console.log("Notification sent.");

      // update store and persist
      for (const title of newAppointments) seen.add(title);
      saveSeen(seen);
    }
  } catch (err) {
    console.error("Error during check:", err);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
