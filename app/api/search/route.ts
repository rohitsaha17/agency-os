import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/search?q=term — global search across projects, clients, tasks, files
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  try {
    const [projects, clients, tasks, files] = await Promise.all([
      prisma.project.findMany({
        where: {
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
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, mimeType: true, project: { select: { id: true, name: true } } },
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
        sublabel: t.project.name,
        status: t.status,
        href: `/projects/${t.project.id}`,
      })),
      ...files.map((f) => ({
        id: f.id,
        type: "file" as const,
        label: f.name,
        sublabel: f.project?.name,
        href: `/files`,
      })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[GET /api/search]", error);
    return NextResponse.json({ results: [] });
  }
}
