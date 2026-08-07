import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensionOutput = resolve(root, "apps/extension/.output");
const maximumUnpackedBytes = 5 * 1024 * 1024;
const expectedPermissions = ["activeTab", "alarms", "identity", "scripting", "storage"];
const productionOrigin = process.env.WXT_WEB_ORIGIN;
const requiredDocuments = [
  "SECURITY_THREAT_MODEL.md",
  "OPERATIONS_RUNBOOK.md",
  "PRIVACY_POLICY.md",
  "STORE_LISTING.md",
  "RELEASE_CHECKLIST.md",
];
const requiredArchives = [
  "capchurextension-0.1.0-chrome.zip",
  "capchurextension-0.1.0-firefox.zip",
  "capchurextension-0.1.0-sources.zip",
];

if (!productionOrigin?.startsWith("https://")) {
  throw new Error("WXT_WEB_ORIGIN must be the production HTTPS origin used to build release packages.");
}

async function directoryBytes(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.reduce(async (totalPromise, entry) => {
    const total = await totalPromise;
    const path = resolve(directory, entry.name);
    return total + (entry.isDirectory() ? await directoryBytes(path) : (await stat(path)).size);
  }, Promise.resolve(0));
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return files.flat();
}

async function verifyBundle(bundle, manifestVersion) {
  const directory = resolve(extensionOutput, bundle);
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  const permissions = [...(manifest.permissions ?? [])].sort();
  const hostPermissions = manifestVersion === 2
    ? manifest.permissions.filter((permission) => permission.includes("://"))
    : manifest.host_permissions;
  const optionalOrigins = manifestVersion === 2
    ? manifest.optional_permissions
    : manifest.optional_host_permissions;

  if (manifest.manifest_version !== manifestVersion) {
    throw new Error(`${bundle}: expected manifest version ${manifestVersion}.`);
  }
  if (manifest.version !== "0.1.0") {
    throw new Error(`${bundle}: expected release version 0.1.0, received ${manifest.version}.`);
  }
  if (!expectedPermissions.every((permission) => permissions.includes(permission))) {
    throw new Error(`${bundle}: required least-privilege permissions are incomplete.`);
  }
  if (hostPermissions.length !== 1 || hostPermissions[0] !== `${productionOrigin}/*`) {
    throw new Error(`${bundle}: release host permission must be limited to ${productionOrigin}/*.`);
  }
  if (JSON.stringify(optionalOrigins) !== JSON.stringify(["http://*/*", "https://*/*"])) {
    throw new Error(`${bundle}: optional page origins changed unexpectedly.`);
  }

  const bytes = await directoryBytes(directory);
  if (bytes > maximumUnpackedBytes) {
    throw new Error(`${bundle}: ${bytes} bytes exceeds the ${maximumUnpackedBytes}-byte budget.`);
  }

  const scripts = (await filesBelow(directory)).filter((path) => path.endsWith(".js"));
  for (const script of scripts) {
    const source = await readFile(script, "utf8");
    if (source.includes("http://localhost") || source.includes("http://127.0.0.1")) {
      throw new Error(`${bundle}: development origin found in ${script}.`);
    }
    const withoutReviewedZodProbe = source.replace("Function(``)", "");
    if (/\b(?:eval|Function)\s*\(/.test(withoutReviewedZodProbe)) {
      throw new Error(`${bundle}: unreviewed dynamic execution found in ${script}.`);
    }
  }

  console.log(`${bundle}: manifest, permissions, bundle safety, and size budget passed (${bytes} bytes)`);
}

for (const document of requiredDocuments) {
  await stat(resolve(root, "docs", document));
}

const extensionSources = (await Promise.all([
  filesBelow(resolve(root, "apps/extension/entrypoints")),
  filesBelow(resolve(root, "apps/extension/utils")),
])).flat().filter((path) => /\.[cm]?[jt]sx?$/.test(path) && !path.endsWith(".test.ts"));
for (const sourcePath of extensionSources) {
  const source = await readFile(sourcePath, "utf8");
  if (/dangerouslySetInnerHTML|\b(?:eval|Function)\s*\(/.test(source)) {
    throw new Error(`Unsafe application source found in ${sourcePath}.`);
  }
}

await verifyBundle("chrome-mv3", 3);
await verifyBundle("firefox-mv2", 2);

for (const archive of requiredArchives) {
  const bytes = await readFile(resolve(extensionOutput, archive));
  console.log(`${archive}: sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
}