import { defineConfig } from "wxt";

const webOrigin = process.env.WXT_WEB_ORIGIN
    ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://capchur.io");

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
        host_permissions: [`${webOrigin}/*`],
        ...(manifestVersion === 2
            ? { optional_permissions: ["http://*/*", "https://*/*"] }
            : { optional_host_permissions: ["http://*/*", "https://*/*"] }),
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
