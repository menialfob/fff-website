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

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "MEMBER";
    extraRoles?: ExtraRole[];
  }
}
