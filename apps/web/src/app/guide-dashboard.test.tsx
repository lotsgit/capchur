import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuideDashboard } from "@/app/guide-dashboard";

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuideDashboard", () => {
  it("loads persisted workspace guides and links to the real editor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      version: 1,
      id: "0198f1d0-c184-7000-8000-000000000501",
      title: "Customer onboarding",
      description: "Set up a new customer.",
      introduction: "",
      branding: { name: "", accentColor: "#164c3b", logoUrl: null },
      updatedAt: 1_754_198_400_000,
      steps: [],
    }]), { status: 200, headers: { "content-type": "application/json" } })));

    render(<GuideDashboard identity={{ name: "Owner", role: "owner" }} />);

    expect(await screen.findByText("Customer onboarding")).toBeTruthy();
    expect(screen.queryByText("Publish a product update")).toBeNull();
    expect(screen.getByRole("link", { name: /Customer onboarding/ }).getAttribute("href"))
      .toBe("/?guideId=0198f1d0-c184-7000-8000-000000000501");
  });
});