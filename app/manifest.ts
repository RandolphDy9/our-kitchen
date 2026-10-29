import type { MetadataRoute } from "next";
import { manifestFor } from "@/lib/manifest";

export default function manifest(): MetadataRoute.Manifest {
  return manifestFor();
}
