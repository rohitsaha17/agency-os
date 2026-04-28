import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

// GET /api/clients — list all clients with optional search + status filter
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("q") ?? "";
    const status = searchParams.get("status") ?? undefined;
    const pagination = parsePagination(searchParams);

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { companyName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as never }),
    };

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          contacts: {
            select: { id: true, name: true, jobTitle: true, isPrimary: true },
          },
          _count: { select: { projects: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.paginated ? pagination.skip : undefined,
        take: pagination.paginated ? pagination.take : undefined,
      }),
      pagination.paginated ? prisma.client.count({ where }) : Promise.resolve(0),
    ]);

    if (pagination.paginated) {
      return NextResponse.json({
        data: clients,
        pagination: paginationMeta(pagination, total),
      });
    }
    return NextResponse.json(clients);
  } catch (error) {
    return handleApiError(error, "GET /api/clients");
  }
}

// POST /api/clients — create a new client
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `clients:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const body = await req.json();
    const {
      name, companyName, email, phone, website,
      industry, address, links, brandColors, brandAssets,
      taxRegistrations, notes, status,
    } = body;

    if (!name?.trim()) throw new ApiError("Client name is required", 400);

    // Auto-derive logoUrl from logo-type link
    const logoUrl = Array.isArray(links)
      ? (links.find((l: { type: string; url: string }) => l.type === "logo")?.url ?? null)
      : null;

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        companyName: companyName?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        industry: industry?.trim() || null,
        address: address?.trim() || null,
        logoUrl,
        links: links?.length ? links : undefined,
        brandColors: brandColors?.length ? brandColors : undefined,
        brandAssets: brandAssets?.length ? brandAssets : undefined,
        taxRegistrations: taxRegistrations?.length ? taxRegistrations : undefined,
        notes: notes?.trim() || null,
        status: status || "ACTIVE",
      },
      include: {
        contacts: true,
        _count: { select: { projects: true } },
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/clients");
  }
}
