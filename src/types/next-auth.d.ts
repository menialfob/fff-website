import { DefaultSession } from "next-auth";
import type { ExtraRole } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MEMBER";
      extraRoles: ExtraRole[];
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "MEMBER";
    extraRoles: ExtraRole[];
  }
}

// next-auth/jwt only re-exports JWT; the interface lives (and merges) here.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "MEMBER";
    extraRoles?: ExtraRole[];
    /** Epoch ms of the last check against the user row (see auth.ts). */
    checkedAt?: number;
  }
}
