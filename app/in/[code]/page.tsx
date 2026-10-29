import type { Metadata } from "next";
import App from "@/components/App";

/* /in/{code}: an event's check-in link (the QR code). The manifest is in the first HTML, so an app added to the
   Home Screen from here opens on this event; iPhone Home Screen apps don't share Safari's storage. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const c = code.toLowerCase();
  return /^[a-z0-9]{4,40}$/.test(c) ? { manifest: `/m/${c}` } : {};
}

export default function EventLink() {
  return <App />;
}
