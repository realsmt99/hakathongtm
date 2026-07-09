import { NextResponse } from "next/server";

// The app is now served by the React page at `/`.
// No proxy rewrites/redirects are needed.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
