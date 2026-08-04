import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const baseUrl = process.env.CAPCHUR_WEB_URL ?? "http://127.0.0.1:3000";
const maximumLoadMilliseconds = 4_000;
const maximumTransferredBytes = 2 * 1024 * 1024;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    const startedAt = performance.now();
    const response = await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
    const loadMilliseconds = Math.round(performance.now() - startedAt);
    if (!response?.ok()) throw new Error(`${viewport.name}: sign-in returned ${response?.status()}.`);

    const transferredBytes = await page.evaluate(() => performance.getEntriesByType("resource")
      .reduce((total, entry) => total + ("transferSize" in entry ? entry.transferSize : 0), 0));
    const horizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const accessibility = await new AxeBuilder({ page }).analyze();
    const materialViolations = accessibility.violations.filter(({ impact }) =>
      impact === "serious" || impact === "critical");

    if (browserErrors.length > 0) {
      throw new Error(`${viewport.name}: browser errors: ${browserErrors.join(" | ")}`);
    }
    if (horizontalOverflow) throw new Error(`${viewport.name}: page has horizontal overflow.`);
    if (materialViolations.length > 0) {
      const details = materialViolations.flatMap(({ id, nodes }) => nodes.map(({ target, failureSummary }) =>
        `${id} at ${target.join(" ")}: ${failureSummary}`));
      throw new Error(`${viewport.name}: Axe violations: ${details.join(" | ")}`);
    }
    if (loadMilliseconds > maximumLoadMilliseconds) {
      throw new Error(`${viewport.name}: ${loadMilliseconds}ms exceeds the ${maximumLoadMilliseconds}ms load budget.`);
    }
    if (transferredBytes > maximumTransferredBytes) {
      throw new Error(`${viewport.name}: ${transferredBytes} bytes exceeds the ${maximumTransferredBytes}-byte transfer budget.`);
    }

    console.log(`${viewport.name}: Axe, overflow, browser errors, and performance passed (${loadMilliseconds}ms, ${transferredBytes} bytes)`);
    await context.close();
  }
} finally {
  await browser.close();
}