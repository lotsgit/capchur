"use client";

import { Check, Clock3, Copy, History, Link2, MessageSquare, RotateCcw, Share2, X } from "lucide-react";
import { useCallback, useState } from "react";

import {
  GuideAccessSchema,
  GuideAuditEventSchema,
  GuideCommentSchema,
  GuideRevisionSchema,
  GuideSchema,
  GuideShareCreatedSchema,
  GuideShareSchema,
  type Guide,
  type GuideAccess,
  type GuideAuditEvent,
  type GuideComment,
  type GuideRevision,
  type GuideShare,
} from "@/lib/contracts";

type CollaborationTab = "share" | "comments" | "history";

async function parseResponse<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  if (!response.ok) throw new Error("Collaboration request failed");
  return parse(await response.json());
}

export function CollaborationPanel({
  guideId,
  role,
  revision,
  onRestore,
}: {
  guideId: string;
  role: "owner" | "member";
  revision: number;
  onRestore: (guide: Guide) => void;
}) {
  const [tab, setTab] = useState<CollaborationTab | null>(null);
  const [access, setAccess] = useState<GuideAccess | null>(null);
  const [shares, setShares] = useState<GuideShare[]>([]);
  const [comments, setComments] = useState<GuideComment[]>([]);
  const [revisions, setRevisions] = useState<GuideRevision[]>([]);
  const [audit, setAudit] = useState<GuideAuditEvent[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const base = `/api/guides/${encodeURIComponent(guideId)}`;
      const [accessResponse, commentsResponse, revisionsResponse] = await Promise.all([
        fetch(`${base}/access`),
        fetch(`${base}/comments`),
        fetch(`${base}/revisions`),
      ]);
      setAccess(await parseResponse(accessResponse, (value) => GuideAccessSchema.parse(value)));
      setComments(await parseResponse(commentsResponse, (value) => GuideCommentSchema.array().parse(value)));
      setRevisions(await parseResponse(revisionsResponse, (value) => GuideRevisionSchema.array().parse(value)));
      if (role === "owner") {
        const [sharesResponse, auditResponse] = await Promise.all([
          fetch(`${base}/shares`),
          fetch(`${base}/audit`),
        ]);
        setShares(await parseResponse(sharesResponse, (value) => GuideShareSchema.array().parse(value)));
        setAudit(await parseResponse(auditResponse, (value) => GuideAuditEventSchema.array().parse(value)));
      }
      setMessage(null);
    } catch {
      setMessage("Collaboration details unavailable");
    }
  }, [guideId, role]);

  function openTab(nextTab: CollaborationTab) {
    setTab(nextTab);
    void loadData();
  }

  async function updateVisibility(visibility: GuideAccess["visibility"]) {
    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}/access`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      setAccess(await parseResponse(response, (value) => GuideAccessSchema.parse(value)));
      setMessage("Access updated");
    } catch {
      setMessage("Access could not be updated");
    }
  }

  async function createLink() {
    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresAt: null }),
      });
      const share = await parseResponse(response, (value) => GuideShareCreatedSchema.parse(value));
      setShares((current) => [share, ...current]);
      setCreatedLink(`${window.location.origin}/shared/${encodeURIComponent(share.token)}`);
      setMessage("Private link created");
    } catch {
      setMessage("Link could not be created");
    }
  }

  async function revokeLink(shareId: string) {
    try {
      const response = await fetch(
        `/api/guides/${encodeURIComponent(guideId)}/shares/${encodeURIComponent(shareId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Revoke failed");
      setShares((current) => current.map((share) =>
        share.id === shareId ? { ...share, revokedAt: Date.now() } : share,
      ));
      setCreatedLink(null);
      setMessage("Link revoked");
    } catch {
      setMessage("Link could not be revoked");
    }
  }

  async function addComment() {
    if (!commentBody.trim()) return;
    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: commentBody }),
      });
      const comment = await parseResponse(response, (value) => GuideCommentSchema.parse(value));
      setComments((current) => [...current, comment]);
      setCommentBody("");
      setMessage("Comment added");
    } catch {
      setMessage("Comment could not be added");
    }
  }

  async function restoreRevision(revisionId: string) {
    try {
      const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revisionId, updatedAt: revision }),
      });
      if (response.status === 409) {
        setMessage("Conflict: reload before restoring");
        return;
      }
      const restored = await parseResponse(response, (value) => GuideSchema.parse(value));
      onRestore(restored);
      setMessage("Revision restored");
      await loadData();
    } catch {
      setMessage("Revision could not be restored");
    }
  }

  return (
    <section className="collaboration-panel" aria-labelledby="collaboration-heading">
      <div className="collaboration-heading">
        <div><p className="eyebrow">Team workflow</p><h2 id="collaboration-heading">Collaboration</h2></div>
        {message && <span role="status">{message}</span>}
      </div>
      <div className="collaboration-tabs" role="tablist" aria-label="Collaboration views">
        <button type="button" role="tab" aria-selected={tab === "share"} onClick={() => openTab("share")}><Share2 size={15} /> Share</button>
        <button type="button" role="tab" aria-selected={tab === "comments"} onClick={() => openTab("comments")}><MessageSquare size={15} /> Comments <span>{comments.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => openTab("history")}><History size={15} /> History</button>
      </div>

      {tab === "share" && (
        <div className="collaboration-content" role="tabpanel">
          <div className="access-control" aria-label="Guide access">
            <button type="button" disabled={role !== "owner"} aria-pressed={access?.visibility === "private"} onClick={() => { void updateVisibility("private"); }}>Private</button>
            <button type="button" disabled={role !== "owner"} aria-pressed={access?.visibility === "workspace"} onClick={() => { void updateVisibility("workspace"); }}>Workspace</button>
          </div>
          {role === "owner" && <button className="secondary-command" type="button" onClick={() => { void createLink(); }}><Link2 size={15} /> Create private link</button>}
          {createdLink && (
            <div className="created-link"><input readOnly value={createdLink} aria-label="Created share link" /><button type="button" title="Copy link" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(createdLink); setMessage("Link copied"); }}><Copy size={15} /></button></div>
          )}
          {shares.length > 0 && <ul className="collaboration-list">{shares.map((share) => (
            <li key={share.id}><span><Link2 size={14} /><strong>{share.revokedAt ? "Revoked link" : "Active private link"}</strong><small>{new Date(share.createdAt).toLocaleString()}</small></span>{!share.revokedAt && <button type="button" title="Revoke link" aria-label="Revoke link" onClick={() => { void revokeLink(share.id); }}><X size={15} /></button>}</li>
          ))}</ul>}
          {role === "owner" && audit.length > 0 && <div className="audit-strip"><Clock3 size={14} /><span>{audit.length} sensitive actions recorded</span></div>}
        </div>
      )}

      {tab === "comments" && (
        <div className="collaboration-content" role="tabpanel">
          <label htmlFor="new-comment">Add comment</label>
          <textarea id="new-comment" rows={3} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} />
          <button className="secondary-command" type="button" disabled={!commentBody.trim()} onClick={() => { void addComment(); }}><Check size={15} /> Comment</button>
          {comments.length === 0 ? <p className="collaboration-empty">No comments yet.</p> : <ul className="comment-list">{comments.map((comment) => <li key={comment.id}><strong>{comment.authorName}</strong><time dateTime={new Date(comment.createdAt).toISOString()}>{new Date(comment.createdAt).toLocaleString()}</time><p>{comment.body}</p></li>)}</ul>}
        </div>
      )}

      {tab === "history" && (
        <div className="collaboration-content" role="tabpanel">
          {revisions.length === 0 ? <p className="collaboration-empty">Version history begins after the first saved change.</p> : <ol className="collaboration-list">{revisions.map((saved) => (
            <li key={saved.id}><span><History size={14} /><strong>{saved.guide.title}</strong><small>{new Date(saved.createdAt).toLocaleString()}</small></span>{role === "owner" && saved.guide.updatedAt !== revision && <button type="button" title="Restore revision" aria-label={`Restore ${saved.guide.title}`} onClick={() => { void restoreRevision(saved.id); }}><RotateCcw size={15} /></button>}</li>
          ))}</ol>}
        </div>
      )}
    </section>
  );
}
