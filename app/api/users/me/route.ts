import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(user);
}
