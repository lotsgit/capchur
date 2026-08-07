import { defineConfig } from "wxt";

const webOrigin = process.env.WXT_WEB_ORIGIN
    ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://capchur.io");
const e2eHostPermissions = process.env.WXT_E2E_ALL_SITES === "true" ? ["<all_urls>"] : [];

// See https://wxt.dev/api/config.html
export default defineConfig({
    targetBrowsers: ["chrome", "firefox"],
    dev: {
        server: {
            port: 3001,
        },
    },
    manifest: ({ browser, manifestVersion }) => ({
        permissions: ["activeTab", "alarms", "identity", "scripting", "storage"],
        host_permissions: [`${webOrigin}/*`, ...e2eHostPermissions],
        ...(manifestVersion === 2
            ? { optional_permissions: ["<all_urls>"] }
            : { optional_host_permissions: ["<all_urls>"] }),
        ...(browser === "firefox" ? { browser_specific_settings: {
            gecko: {
                id: "capchur@bizleader.ai",
                strict_min_version: "140.0",
                data_collection_permissions: {
                    required: [
                        "authenticationInfo",
                        "browsingActivity",
                        "personallyIdentifyingInfo",
                        "websiteActivity",
                        "websiteContent",
                    ],
                },
            },
        } } : {}),
    }),
    modules: ["@wxt-dev/module-react"],
});
