import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Browser-tab favicon: the FFF wordmark.
export default function Icon() {
  return brandIcon(32);
}
