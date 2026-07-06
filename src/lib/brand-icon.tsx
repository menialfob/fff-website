import { ImageResponse } from "next/og";

/**
 * The FFF wordmark rendered as a square app icon: the amber→orange→fuchsia
 * gradient "FFF" (matching the `Brand` component in the header) on the dark
 * app canvas. Shared by the favicon (`app/icon.tsx`), the iOS
 * apple-touch-icon (`app/apple-icon.tsx`) and the PWA manifest icons
 * (`app/app-icon/[size]`). Colors mirror Tailwind amber-300 / orange-400 /
 * fuchsia-400 and the `#0c0a12` canvas.
 */
export function brandIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #1b1526 0%, #0c0a12 70%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: size * 0.4,
            fontWeight: 800,
            letterSpacing: -(size * 0.03),
            backgroundImage:
              "linear-gradient(100deg, #fcd34d 0%, #fb923c 50%, #e879f9 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          FFF
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
