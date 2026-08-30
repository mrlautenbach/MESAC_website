import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "EDITOR";
    schoolId: string | null;
    tokenVersion: number;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "EDITOR";
      schoolId: string | null;
      mustChangePassword: boolean;
      isValid: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "EDITOR";
    schoolId?: string | null;
    tokenVersion?: number;
    mustChangePassword?: boolean;
    valid?: boolean;
  }
}
