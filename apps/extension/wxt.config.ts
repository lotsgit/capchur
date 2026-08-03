import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    dev: {
        server: {
            port: 3001,
        },
    },
    manifest: {
        permissions: ["activeTab", "scripting", "storage"],
        optional_host_permissions: ["http://*/*", "https://*/*"],
    },
    modules: ["@wxt-dev/module-react"],
});
