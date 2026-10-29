import { manifestFor } from "@/lib/manifest";

/* The default manifest. A route rather than app/manifest.ts: file-based metadata would override the per-event manifest that /in/{code} sets. */
export function GET() {
  return new Response(JSON.stringify(manifestFor()), { headers: { "Content-Type": "application/manifest+json" } });
}
