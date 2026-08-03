const DATABASE_NAME = "capchur-capture";
const DATABASE_VERSION = 1;
const SCREENSHOT_STORE = "screenshots";

export interface ScreenshotStorage {
    save(storageKey: string, dataUrl: string): Promise<void>;
    load(storageKey: string): Promise<Blob | null>;
    delete(storageKey: string): Promise<void>;
    clear(): Promise<void>;
}

export function createScreenshotStorage(): ScreenshotStorage {
    let databasePromise: Promise<IDBDatabase> | undefined;
    const getDatabase = () => {
        databasePromise ??= openDatabase();
        return databasePromise;
    };

    return {
        async save(storageKey, dataUrl) {
            const database = await getDatabase();
            const transaction = database.transaction(SCREENSHOT_STORE, "readwrite");
            transaction.objectStore(SCREENSHOT_STORE).put(dataUrlToBlob(dataUrl), storageKey);
            await transactionComplete(transaction);
        },
        async load(storageKey) {
            const database = await getDatabase();
            const transaction = database.transaction(SCREENSHOT_STORE, "readonly");
            const value = await requestResult(
                transaction.objectStore(SCREENSHOT_STORE).get(storageKey),
            );
            await transactionComplete(transaction);
            return value instanceof Blob ? value : null;
        },
        async delete(storageKey) {
            const database = await getDatabase();
            const transaction = database.transaction(SCREENSHOT_STORE, "readwrite");
            transaction.objectStore(SCREENSHOT_STORE).delete(storageKey);
            await transactionComplete(transaction);
        },
        async clear() {
            const database = await getDatabase();
            const transaction = database.transaction(SCREENSHOT_STORE, "readwrite");
            transaction.objectStore(SCREENSHOT_STORE).clear();
            await transactionComplete(transaction);
        },
    };
}

function requestResult(request: IDBRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(
            request.error ?? new Error("Screenshot storage request failed."),
        );
    });
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(SCREENSHOT_STORE)) {
                request.result.createObjectStore(SCREENSHOT_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Screenshot storage failed to open."));
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(
            transaction.error ?? new Error("Screenshot storage transaction failed."),
        );
        transaction.onabort = () => reject(
            transaction.error ?? new Error("Screenshot storage transaction was aborted."),
        );
    });
}

function dataUrlToBlob(dataUrl: string): Blob {
    const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const encodedImage = match?.[2];
    if (!encodedImage) {
        throw new Error("Only PNG screenshot data URLs can be stored.");
    }

    const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
}