import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

/**
 * GET /api/files/stats — how the org's files are distributed.
 *
 * Six queries ran one after another here. Only two of them actually had to
 * wait for anything: the project and client names can't be fetched until the
 * groupBy says which ids to fetch. The other four were independent and were
 * queued behind each other for no reason — ~193ms each
 * (docs/perf/BASELINE.md).
 *
 * So: two waves. Everything that can go at once, goes at once.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const orgId = user.organizationId;

    // ── Wave 1: nothing here depends on anything else ──
    const [projectFiles, clientFiles, unlinkedCount, folderCount] = await Promise.all([
      prisma.file.groupBy({
        by: ["projectId"],
        where: { organizationId: orgId, projectId: { not: null } },
        _count: { id: true },
      }),
      prisma.file.groupBy({
        by: ["clientId"],
        where: { organizationId: orgId, clientId: { not: null } },
        _count: { id: true },
      }),
      prisma.file.count({
        where: { organizationId: orgId, projectId: null, clientId: null },
      }),
      prisma.folder.count({ where: { organizationId: orgId } }),
    ]);

    // ── Wave 2: names for the ids wave 1 turned up ──
    const projectIds = projectFiles.map((p) => p.projectId!);
    const clientIds = clientFiles.map((c) => c.clientId!);

    const [projectDetails, clientDetails] = await Promise.all([
      projectIds.length
        ? prisma.project.findMany({
            where: { id: { in: projectIds }, organizationId: orgId },
            select: {
              id: true, name: true, status: true,
              client: { select: { id: true, name: true, companyName: true } },
            },
          })
        : Promise.resolve([]),
      clientIds.length
        ? prisma.client.findMany({
            where: { id: { in: clientIds }, organizationId: orgId },
            select: { id: true, name: true, companyName: true },
          })
        : Promise.resolve([]),
    ]);

    // Indexed rather than re-scanned per row — and it drops the `any` casts
    // the .find() version needed to sort afterwards.
    const projectById = new Map(projectDetails.map((p) => [p.id, p]));
    const clientById = new Map(clientDetails.map((c) => [c.id, c]));

    const byProject = projectFiles
      .flatMap((pf) => {
        const project = projectById.get(pf.projectId!);
        if (!project) return [];
        return [{
          id: project.id,
          name: project.name,
          status: project.status,
          clientName: project.client?.companyName || project.client?.name || null,
          fileCount: pf._count.id,
        }];
      })
      .sort((a, b) => b.fileCount - a.fileCount);

    const byClient = clientFiles
      .flatMap((cf) => {
        const client = clientById.get(cf.clientId!);
        if (!client) return [];
        return [{
          id: client.id,
          name: client.companyName || client.name,
          fileCount: cf._count.id,
        }];
      })
      .sort((a, b) => b.fileCount - a.fileCount);

    return NextResponse.json({
      byProject,
      byClient,
      unlinkedCount,
      folderCount,
      totalFiles: projectFiles.reduce((s, p) => s + p._count.id, 0) +
        clientFiles.reduce((s, c) => s + c._count.id, 0) +
        unlinkedCount,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/files/stats");
  }
}
