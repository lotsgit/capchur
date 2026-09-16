import { describe, expect, it } from "vitest";

import {
    redactSensitiveText,
    sanitizeIntroductionInput,
    sanitizeStepNotesInput,
} from "./index";

describe("redactSensitiveText", () => {
    it("redacts secrets, credentials, emails, and query-string values", () => {
        expect(redactSensitiveText("token=abcdefghijklmnopqrstuvwx1234")).toBe("[REDACTED]");
        expect(redactSensitiveText("password: hunter2hunter2")).toContain("[REDACTED]");
        expect(redactSensitiveText("contact jane.doe@example.com")).toBe("contact [REDACTED]");
        expect(redactSensitiveText("https://x.test/a?token=abc&next=/home")).toContain("[REDACTED]");
    });

    it("truncates to the requested max length", () => {
        expect(redactSensitiveText("a".repeat(1_000), 10)).toHaveLength(10);
    });
});

describe("sanitizeStepNotesInput", () => {
    it("redacts every text field independently", () => {
        const sanitized = sanitizeStepNotesInput({
            consent: true,
            stepTitle: "Enter card number 4111111111111111",
            description: "Type your password: hunter2hunter2",
            section: "Billing token=abcdefghijklmnopqrstuvwx",
            existingNotes: null,
        });

        expect(sanitized.stepTitle).toContain("[REDACTED]");
        expect(sanitized.description).toContain("[REDACTED]");
        expect(sanitized.section).toContain("[REDACTED]");
        expect(sanitized.existingNotes).toBeNull();
    });
});

describe("sanitizeIntroductionInput", () => {
    it("bounds the step list to 50 entries and redacts each field", () => {
        const steps = Array.from({ length: 60 }, (_, index) => ({
            title: `Step ${index}`,
            section: null,
            description: "contact jane.doe@example.com for help",
        }));

        const sanitized = sanitizeIntroductionInput({
            consent: true,
            guideTitle: "Reset a password",
            existingIntroduction: "",
            steps,
        });

        expect(sanitized.steps).toHaveLength(50);
        expect(sanitized.steps[0].description).toBe("contact [REDACTED] for help");
    });
});
