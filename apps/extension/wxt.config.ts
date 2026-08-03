import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    dev: {
        server: {
            port: 3001,
        },
    },
    manifest: {
        permissions: ["activeTab", "storage"],
    },
    modules: ["@wxt-dev/module-react"],
});
