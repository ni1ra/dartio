import type { NextRequest } from "next/server";
import { getNeonAuth } from "@/lib/server/auth";

export default function proxy(request: NextRequest) { return getNeonAuth().middleware({ loginUrl: "/auth/sign-in" })(request); }

export const config = { matcher: ["/account/:path*"] };
