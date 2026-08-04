import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GuideSchema } from "@capchur/contracts";

import { getCollaborationApi } from "@/server/runtime";

function sharedMediaSource(source: string, token: string): string {
  const url = new URL(source, "http://capchur.local");
  const objectKey = url.searchParams.get("objectKey");
  return objectKey
    ? `/api/shared/${encodeURIComponent(token)}/image?objectKey=${encodeURIComponent(objectKey)}`
    : source;
}

export default async function SharedGuidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const response = await (await getCollaborationApi()).sharedGuide(
    new Request(`http://capchur.local/api/shared/${encodeURIComponent(token)}`),
    token,
  );
  if (!response.ok) notFound();
  const guide = GuideSchema.parse(await response.json());

  return (
    <main className="shared-guide">
      <header>
        <Link className="shared-brand" href="/">C</Link>
        <span>Shared guide</span>
      </header>
      <article>
        <div className="shared-guide-title">
          {guide.branding.name && <p className="eyebrow">{guide.branding.name}</p>}
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
          {guide.introduction && <p>{guide.introduction}</p>}
        </div>
        <ol>
          {guide.steps.map((step, index) => (
            <li key={step.id}>
              <div className="shared-step-heading"><span>{String(index + 1).padStart(2, "0")}</span><div>{step.section && <small>{step.section}</small>}<h2>{step.title}</h2></div></div>
              {step.media && <Image src={sharedMediaSource(step.media.source, token)} width={step.media.width} height={step.media.height} alt={step.media.alt} unoptimized />}
              {step.description && <p>{step.description}</p>}
            </li>
          ))}
        </ol>
      </article>
    </main>
  );
}
