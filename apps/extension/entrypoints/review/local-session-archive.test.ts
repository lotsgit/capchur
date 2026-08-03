import { describe, expect, it } from 'vitest';

import type { RecordingSession } from '../../utils/contracts';
import {
    createLocalSessionArchive,
    parseLocalSessionArchive,
    restoreLocalSessionScreenshots,
} from './local-session-archive';

const sessionId = '0198f1d0-c184-7000-8000-000000000002';
const stepId = '0198f1d0-c184-7000-8000-000000000003';
const storageKey = `screenshots/${sessionId}/${stepId}`;
const session: RecordingSession = {
    id: sessionId,
    status: 'stopped',
    startedAt: 100,
    updatedAt: 200,
    steps: [{
        id: stepId,
        sessionId,
        sequence: 0,
        action: 'click',
        timestamp: 150,
        url: 'https://example.com/settings',
        pageTitle: 'Settings',
        description: 'Click the Save button',
        element: { tagName: 'button', accessibleName: 'Save', selectors: ['#save'] },
        viewport: {
            width: 1280,
            height: 720,
            scrollX: 0,
            scrollY: 0,
            devicePixelRatio: 1,
            zoom: 1,
            visualViewport: {
                width: 1280,
                height: 720,
                offsetLeft: 0,
                offsetTop: 0,
                scale: 1,
            },
        },
        screenshot: {
            id: stepId,
            mimeType: 'image/png',
            width: 1280,
            height: 720,
            capturedAt: 160,
            storageKey,
        },
        highlight: {
            rect: { x: 10, y: 20, width: 100, height: 40 },
            coordinateSpace: 'screenshot-pixels',
            hidden: false,
        },
    }],
};

describe('local session archives', () => {
    it('exports, parses, and restores screenshot pixels with session metadata', async () => {
        const archive = await createLocalSessionArchive(
            session,
            async () => new Blob(['png'], { type: 'image/png' }),
            () => 300,
        );
        const parsed = parseLocalSessionArchive(JSON.stringify(archive));
        const restored: Array<{ storageKey: string; dataUrl: string }> = [];
        await restoreLocalSessionScreenshots(parsed, async (key, dataUrl) => {
            restored.push({ storageKey: key, dataUrl });
        });

        expect(parsed).toMatchObject({ exportedAt: 300, session });
        expect(restored).toEqual([{
            storageKey,
            dataUrl: 'data:image/png;base64,cG5n',
        }]);
    });

    it('rejects archives with missing, extra, or invalid screenshot data', () => {
        const baseArchive = {
            version: 1,
            exportedAt: 300,
            session,
            screenshots: [],
        };

        expect(() => parseLocalSessionArchive(JSON.stringify(baseArchive)))
            .toThrow('exact screenshot set');
        expect(() => parseLocalSessionArchive('{broken'))
            .toThrow('not valid JSON');
    });
});
