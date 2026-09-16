import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsForm } from "./settings-form";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsForm AI notes section", () => {
  it("loads saved preferences and saves changes through the AI preferences API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings/ai-preferences") && (!init || init.method === undefined)) {
        return Response.json({ preferences: { processingMode: "online", triggerMode: "automatic", configuredAt: 1 } });
      }
      if (url.endsWith("/api/settings/ai-preferences") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ preferences: { ...body, configuredAt: 2 } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsForm email="pat@example.test" name="Pat" role="owner" />);

    const localRadio = await screen.findByRole("radio", { name: /Local in this browser/ });
    await user.click(localRadio);
    await user.click(screen.getByRole("radio", { name: "Manual" }));
    await user.click(screen.getByRole("button", { name: /Save AI preferences/ }));

    expect(await screen.findByText("AI notes preferences saved.")).toBeTruthy();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body))).toEqual({
      processingMode: "local",
      triggerMode: "manual",
    });
  });
});
