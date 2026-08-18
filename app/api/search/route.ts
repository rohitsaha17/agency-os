import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// GET /api/search?q=term — global search across projects, clients, tasks, files, messages
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const orgId = user.organizationId;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (!q || q.length < 2) return NextResponse.json({ results: [] });

    const [projects, clients, tasks, files, messages] = await Promise.all([
      prisma.project.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, status: true, client: { select: { name: true } } },
        take: 5,
      }),
      prisma.client.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { name:        { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, companyName: true, logoUrl: true },
        take: 5,
      }),
      prisma.task.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { title:       { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true, title: true, status: true, priority: true,
          project: { select: { id: true, name: true } },
        },
        take: 5,
      }),
      prisma.file.findMany({
        where: { organizationId: orgId, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, mimeType: true, project: { select: { id: true, name: true } } },
        take: 5,
      }),
      prisma.chatMessage.findMany({
        where: {
          deletedAt: null,
          body: { contains: q, mode: "insensitive" },
          // Scope through the parent channel — ChatMessage doesn't have organizationId.
          channel: { organizationId: orgId },
        },
        select: {
          id: true, body: true,
          channel: { select: { name: true } },
        },
        take: 5,
      }),
    ]);

    const results = [
      ...clients.map((c) => ({
        id: c.id,
        type: "client" as const,
        label: c.companyName ?? c.name,
        sublabel: c.companyName ? c.name : undefined,
        href: `/clients/${c.id}`,
      })),
      ...projects.map((p) => ({
        id: p.id,
        type: "project" as const,
        label: p.name,
        sublabel: p.client.name,
        status: p.status,
        href: `/projects/${p.id}`,
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: "task" as const,
        label: t.title,
        sublabel: t.project?.name ?? "General task",
        status: t.status,
        href: t.project ? `/projects/${t.project.id}` : "/tasks",
      })),
      ...files.map((f) => ({
        id: f.id,
        type: "file" as const,
        label: f.name,
        sublabel: f.project?.name,
        href: `/files`,
      })),
      ...messages.map((m) => ({
        id: m.id,
        type: "message" as const,
        label: m.body.length > 60 ? m.body.slice(0, 60) + "…" : m.body,
        sublabel: m.channel.name,
        href: `/messages`,
      })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error, "GET /api/search");
  }
}
