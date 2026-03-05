import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./auth";

export default async function middleware(request: NextRequest) {
  // Bypass auth for E2E testing
  if (process.env.E2E_TESTING === 'true') {
    return NextResponse.next();
  }
  return (auth as any)(request);
}
