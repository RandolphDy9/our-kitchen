import { manifestFor } from "@/lib/manifest";

/* /m/{code}: the manifest for an event's page (code = its check-in code). Its start_url is the event's check-in link, so an app added to the
   Home Screen from that page opens on the event. iPhone Home Screen apps don't share Safari's storage, so without
   this the app wouldn't know which event it was added from. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{4,40}$/.test(id)) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(manifestFor(`/#in-${id}`)), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" },
  });
}
