import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS "Add to Home Screen" icon (apple-touch-icon), 180×180.
export default function AppleIcon() {
  return brandIcon(180);
}
