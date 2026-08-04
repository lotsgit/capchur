import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CollaborationPanel } from "@/app/collaboration-panel";

const guideId = "0198f1d0-c184-7000-8000-000000000601";
const shareId = "0198f1d0-c184-7000-8000-000000000602";
const commentId = "0198f1d0-c184-7000-8000-000000000603";

function responseFor(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (url.endsWith("/access")) {
    return Response.json({ visibility: method === "PUT" ? "workspace" : "private" });
  }
  if (url.endsWith("/shares") && method === "POST") {
    return Response.json({
      id: shareId,
      guideId,
      createdAt: 100,
      expiresAt: null,
      revokedAt: null,
      token: "created-private-link-token-with-thirty-two-characters",
    }, { status: 201 });
  }
  if (url.endsWith("/shares")) return Response.json([]);
  if (url.endsWith("/comments") && method === "POST") {
    return Response.json({
      id: commentId,
      guideId,
      userId: "owner-user",
      authorName: "Owner",
      body: "Ready for review.",
      createdAt: 200,
    }, { status: 201 });
  }
  if (url.endsWith("/comments")) return Response.json([]);
  if (url.endsWith("/revisions") || url.endsWith("/audit")) return Response.json([]);
  return Response.json({ error: "unexpected request" }, { status: 500 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CollaborationPanel", () => {
  it("loads on demand and supports access, link, and comment controls", async () => {
    const fetchMock = vi.fn(responseFor);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <CollaborationPanel
        guideId={guideId}
        role="owner"
        revision={100}
        onRestore={vi.fn()}
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Share" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Private" }).getAttribute("aria-pressed")).toBe("true"));

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    expect(await screen.findByText("Access updated")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create private link" }));
    expect(await screen.findByLabelText("Created share link")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /Comments/ }));
    const comment = await screen.findByLabelText("Add comment");
    await user.type(comment, "Ready for review.");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(await screen.findByText("Ready for review.")).toBeTruthy();
  });
});
