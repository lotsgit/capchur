import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    dev: {
        server: {
            port: 3001,
        },
    },
    manifest: {
        permissions: ["activeTab", "alarms", "identity", "scripting", "storage"],
        host_permissions: [`${process.env.WXT_WEB_ORIGIN ?? "http://localhost:3000"}/*`],
        optional_host_permissions: ["http://*/*", "https://*/*"],
    },
    modules: ["@wxt-dev/module-react"],
});
