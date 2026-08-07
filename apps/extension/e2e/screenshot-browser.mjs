import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

if (!process.env.npm_execpath) throw new Error("pnpm executable path is unavailable.");
const build = spawnSync(process.execPath, [process.env.npm_execpath, "exec", "wxt", "build"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
        ...process.env,
        WXT_WEB_ORIGIN: "http://127.0.0.1:4173",
        WXT_E2E_ALL_SITES: "true",
    },
    stdio: "inherit",
});
if (build.status !== 0) throw new Error("The screenshot test extension build failed.");

const extensionRoot = resolve(fileURLToPath(new URL("../.output/chrome-mv3", import.meta.url)));
const userDataDirectory = await mkdtemp(resolve(tmpdir(), "capchur-screenshot-e2e-"));
const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(request.url === "/popup"
        ? "<!doctype html><html><head><title>Popup fixture</title></head><body><button id=popup-action>Popup action</button></body></html>"
        : "<!doctype html><html><head><title>Main fixture</title></head><body><button id=main-action>Main action</button><button id=open-popup onclick=\"window.open('/popup','fixture','popup,width=500,height=400')\">Open popup</button></body></html>");
});

await new Promise((resolveServer) => server.listen(4173, "127.0.0.1", resolveServer));
let context;
try {
    context = await chromium.launchPersistentContext(userDataDirectory, {
        channel: "chromium",
        headless: true,
        args: [
            `--disable-extensions-except=${extensionRoot}`,
            `--load-extension=${extensionRoot}`,
        ],
    });
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    const workerErrors = [];
    worker.on("console", (message) => {
        if (message.type() === "warning") workerErrors.push(message.text());
    });
    await worker.evaluate(async () => {
        const now = Date.now();
        await chrome.storage.local.set({ recordingSession: {
            id: "0198f1d0-c184-7000-8000-000000000501",
            status: "recording",
            startedAt: now,
            updatedAt: now,
            steps: [],
        } });
    });

    const mainPage = context.pages()[0] ?? await context.newPage();
    await mainPage.goto("http://127.0.0.1:4173/");
    await mainPage.getByRole("button", { name: "Main action" }).click();
    await mainPage.waitForTimeout(250);

    const popupPromise = context.waitForEvent("page");
    await mainPage.getByRole("button", { name: "Open popup" }).click();
    const popupPage = await popupPromise;
    await popupPage.waitForLoadState();
    await popupPage.getByRole("button", { name: "Popup action" }).click();

    const deadline = Date.now() + 30_000;
    let session;
    do {
        session = await worker.evaluate(async () =>
            (await chrome.storage.local.get("recordingSession")).recordingSession,
        );
        const popupStep = session?.steps?.find((step) =>
            step.description.includes("Popup action"),
        );
        if (popupStep?.screenshot?.storageKey) break;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    } while (Date.now() < deadline);

    const mainStep = session.steps.find((step) => step.description.includes("Main action"));
    const popupStep = session.steps.find((step) => step.description.includes("Popup action"));
    if (!mainStep?.screenshot?.storageKey || !popupStep?.screenshot?.storageKey) {
        const popupProbe = await worker.evaluate(async () => {
            const tab = (await chrome.tabs.query({ url: "http://127.0.0.1:4173/popup" }))[0];
            try {
                await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
                return { ok: true, tab };
            } catch (error) {
                return {
                    ok: false,
                    tab,
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        });
        throw new Error(`Packaged screenshot capture failed: ${JSON.stringify({ session, popupProbe, workerErrors })}`);
    }
    console.log("chromium: main and popup window screenshots passed");
} finally {
    await context?.close();
    await new Promise((resolveServer, reject) => server.close((error) =>
        error ? reject(error) : resolveServer(),
    ));
    await rm(userDataDirectory, { recursive: true, force: true });
}