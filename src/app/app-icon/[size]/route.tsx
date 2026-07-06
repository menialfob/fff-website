import { brandIcon } from "@/lib/brand-icon";

// PWA manifest icons (referenced from app/manifest.ts). Only the sizes the
// manifest asks for are generated; anything else is a 404.
const ALLOWED = new Set([192, 512]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const n = Number(size);
  if (!ALLOWED.has(n)) return new Response("Not found", { status: 404 });
  return brandIcon(n);
}
