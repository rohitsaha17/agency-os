import { NextResponse } from "next/server";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("userId", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
