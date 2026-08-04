import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, firefox } from "playwright";

const extensionRoot = fileURLToPath(new URL("../", import.meta.url));
const requestedBrowser = process.argv[2];
const targets = [
    { name: "chromium", launcher: chromium, bundle: "chrome-mv3" },
    { name: "edge", launcher: chromium, channel: "msedge", bundle: "chrome-mv3" },
    { name: "firefox", launcher: firefox, bundle: "firefox-mv2" },
].filter(({ name }) => !requestedBrowser || name === requestedBrowser);

if (targets.length === 0) {
    throw new Error(`Unknown browser target: ${requestedBrowser}`);
}

const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
        <html><head><title>Capture fixture</title></head><body>
            <button id="initial">Initial action</button>
            <label for="name">Display name</label>
            <input id="name" value="Private value">
            <label for="team">Team</label>
            <select id="team"><option>Alpha</option><option>Private option</option></select>
            <form aria-label="Profile" onsubmit="event.preventDefault()"><button type="submit">Save profile</button></form>
            <input id="password" type="password" value="do-not-capture">
            <canvas id="canvas" width="100" height="50"></canvas>
            <div id="shadow-host"></div>
            <script>
                const root = document.querySelector('#shadow-host').attachShadow({ mode: 'open' });
                root.innerHTML = '<button id="shadow-action">Shadow action</button>';
            </script>
        </body></html>`);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Fixture server did not start.");
const fixtureUrl = `http://127.0.0.1:${address.port}/start`;

try {
    for (const target of targets) {
        const browser = await target.launcher.launch({
            headless: true,
            ...(target.channel ? { channel: target.channel } : {}),
        });
        try {
            const page = await browser.newPage();
            const pageErrors = [];
            page.on("pageerror", (error) => pageErrors.push(error.message));
            await page.addInitScript(() => {
                globalThis.__capchurMessages = [];
                const runtime = {
                    id: "capchur-e2e",
                    sendMessage: async (message) => {
                        globalThis.__capchurMessages.push(message);
                    },
                };
                Object.defineProperty(globalThis, "browser", {
                    configurable: true,
                    value: { runtime },
                });
                Object.defineProperty(globalThis, "chrome", {
                    configurable: true,
                    value: { runtime },
                });
            });
            await page.goto(fixtureUrl);
            const contentScript = await readFile(
                `${extensionRoot}.output/${target.bundle}/content-scripts/content.js`,
                "utf8",
            );
            await page.addScriptTag({ content: contentScript });
            await page.waitForFunction(() => Boolean(globalThis.__capchurClickCaptureInstalledV1));

            await page.click("#initial");
            await page.locator("#name").evaluate((input) => {
                input.value = "Updated private value";
            });
            await page.locator("#name").dispatchEvent("change");
            await page.selectOption("#team", "Private option");
            await page.locator("form").dispatchEvent("submit");
            await page.locator("#shadow-host").evaluate((host) =>
                host.shadowRoot.querySelector("button").click(),
            );
            await page.locator("#password").dispatchEvent("change");
            await page.click("#canvas");
            await page.evaluate(() => {
                history.pushState({}, "", "/spa-route");
                const button = document.createElement("button");
                button.id = "delayed";
                button.textContent = "Delayed action";
                document.body.append(button);
                button.click();
            });

            const messages = await page.evaluate(() => globalThis.__capchurMessages);
            const actions = messages.map(({ type }) => type);
            const serialized = JSON.stringify(messages);
            const expected = [
                "capture.click",
                "capture.input",
                "capture.select",
                "capture.submit",
                "capture.click",
                "capture.click",
            ];
            if (JSON.stringify(actions) !== JSON.stringify(expected)) {
                const descriptions = messages.map(({ capture }) => capture.description);
                const state = await page.evaluate(() => ({
                    installed: Boolean(globalThis.__capchurClickCaptureInstalledV1),
                    runtimeId: globalThis.browser?.runtime?.id,
                    secureContext: globalThis.isSecureContext,
                }));
                throw new Error(`${target.name}: unexpected actions ${JSON.stringify(actions)} ${JSON.stringify(descriptions)} state=${JSON.stringify(state)} errors=${JSON.stringify(pageErrors)}`);
            }
            if (!messages.at(-1)?.capture?.url.endsWith("/spa-route")) {
                throw new Error(`${target.name}: SPA URL was not captured.`);
            }
            for (const privateValue of ["Private value", "Updated private value", "Private option", "do-not-capture"]) {
                if (serialized.includes(privateValue)) {
                    throw new Error(`${target.name}: private field value entered the capture payload.`);
                }
            }
            console.log(`${target.name}: capture E2E passed`);
        } finally {
            await browser.close();
        }
    }
} finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}