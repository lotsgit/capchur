import {
    CONTRACT_VERSION,
    LocalSessionArchiveSchema,
    type LocalSessionArchive,
    type RecordingSession,
} from '../../utils/contracts';

type LoadScreenshot = (storageKey: string) => Promise<Blob | null>;
type SaveScreenshot = (storageKey: string, dataUrl: string) => Promise<void>;

export async function createLocalSessionArchive(
    session: RecordingSession,
    loadScreenshot: LoadScreenshot,
    now: () => number = Date.now,
): Promise<LocalSessionArchive> {
    const screenshots = await Promise.all(
        getScreenshotKeys(session).map(async (storageKey) => {
            const image = await loadScreenshot(storageKey);
            if (!image) {
                throw new Error(`Screenshot data is missing for ${storageKey}.`);
            }
            return { storageKey, dataUrl: await blobToDataUrl(image) };
        }),
    );

    return LocalSessionArchiveSchema.parse({
        version: CONTRACT_VERSION,
        exportedAt: now(),
        session,
        screenshots,
    });
}

export function parseLocalSessionArchive(json: string): LocalSessionArchive {
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        throw new Error('The selected file is not valid JSON.');
    }

    const result = LocalSessionArchiveSchema.safeParse(value);
    if (!result.success) {
        throw new Error('The selected file is not a valid Capchur session archive.');
    }

    const expectedKeys = getScreenshotKeys(result.data.session);
    const suppliedKeys = result.data.screenshots.map(({ storageKey }) => storageKey);
    const hasExactScreenshotSet = suppliedKeys.length === expectedKeys.length
        && new Set(suppliedKeys).size === expectedKeys.length
        && suppliedKeys.every((storageKey) => expectedKeys.includes(storageKey));
    if (!hasExactScreenshotSet) {
        throw new Error('The session archive does not contain its exact screenshot set.');
    }

    return result.data;
}

export async function restoreLocalSessionScreenshots(
    archive: LocalSessionArchive,
    saveScreenshot: SaveScreenshot,
): Promise<void> {
    for (const screenshot of archive.screenshots) {
        await saveScreenshot(screenshot.storageKey, screenshot.dataUrl);
    }
}

function getScreenshotKeys(session: RecordingSession): string[] {
    return session.steps.flatMap((step) =>
        step.screenshot?.storageKey ? [step.screenshot.storageKey] : [],
    );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 32_768;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:image/png;base64,${btoa(binary)}`;
}
