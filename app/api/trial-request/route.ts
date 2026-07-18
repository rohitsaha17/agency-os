import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { requirePlatformAdmin } from "@/lib/platform-admin";

/**
 * POST /api/trial-request — PUBLIC. A prospective agency requests a
 *   workspace / free trial. Rate-limited by IP; no auth.
 * GET  /api/trial-request — platform-admin only, lists submissions.
 */
export async function POST(req: NextRequest) {
  try {
    // Tight limit — this is an unauthenticated public endpoint.
    const rl = checkRateLimit(req, "trial-request", { limit: 5, windowSeconds: 60 });
    if (!rl.allowed) return apiError("Too many requests, please try again shortly", 429);

    const body = await req.json();
    const agencyName  = (body?.agencyName  ?? "").toString().trim();
    const contactName = (body?.contactName ?? "").toString().trim();
    const email       = (body?.email       ?? "").toString().trim().toLowerCase();

    if (!agencyName)  throw new ApiError("Agency name is required", 400);
    if (!contactName) throw new ApiError("Your name is required", 400);
    if (!email || !email.includes("@")) throw new ApiError("A valid email is required", 400);

    const clip = (v: unknown, n: number) =>
      v == null || v === "" ? null : String(v).trim().slice(0, n);

    await prisma.trialRequest.create({
      data: {
        agencyName:  agencyName.slice(0, 200),
        contactName: contactName.slice(0, 200),
        email:       email.slice(0, 200),
        phone:       clip(body?.phone, 60),
        location:    clip(body?.location, 200),
        website:     clip(body?.website, 200),
        teamSize:    clip(body?.teamSize, 40),
        services:    clip(body?.services, 1000),
        message:     clip(body?.message, 2000),
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/trial-request");
  }
}

export async function GET(req: NextRequest) {
  try {
    requirePlatformAdmin(req);
    const requests = await prisma.trialRequest.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(requests);
  } catch (error) {
    return handleApiError(error, "GET /api/trial-request");
  }
}
