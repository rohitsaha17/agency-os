import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const orgId = user.organizationId;

    // Get file counts grouped by project (scoped to org)
    const projectFiles = await prisma.file.groupBy({
      by: ["projectId"],
      where: { organizationId: orgId, projectId: { not: null } },
      _count: { id: true },
    });

    // Get file counts grouped by client (scoped to org)
    const clientFiles = await prisma.file.groupBy({
      by: ["clientId"],
      where: { organizationId: orgId, clientId: { not: null } },
      _count: { id: true },
    });

    // Count unlinked files (no project, no client) in this org
    const unlinkedCount = await prisma.file.count({
      where: { organizationId: orgId, projectId: null, clientId: null },
    });

    // Get project names (already org-scoped via projectIds we produced)
    const projectIds = projectFiles.map((p) => p.projectId!);
    const projectDetails = projectIds.length
      ? await prisma.project.findMany({
          where: { id: { in: projectIds }, organizationId: orgId },
          select: { id: true, name: true, status: true, client: { select: { id: true, name: true, companyName: true } } },
        })
      : [];

    // Get client names
    const clientIds = clientFiles.map((c) => c.clientId!);
    const clientDetails = clientIds.length
      ? await prisma.client.findMany({
          where: { id: { in: clientIds }, organizationId: orgId },
          select: { id: true, name: true, companyName: true },
        })
      : [];

    // Build project containers
    const byProject = projectFiles
      .map((pf) => {
        const project = projectDetails.find((p) => p.id === pf.projectId);
        if (!project) return null;
        return {
          id: project.id,
          name: project.name,
          status: project.status,
          clientName: project.client?.companyName || project.client?.name || null,
          fileCount: pf._count.id,
        };
      })
      .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => b.fileCount - a.fileCount);

    // Build client containers
    const byClient = clientFiles
      .map((cf) => {
        const client = clientDetails.find((c) => c.id === cf.clientId);
        if (!client) return null;
        return {
          id: client.id,
          name: client.companyName || client.name,
          fileCount: cf._count.id,
        };
      })
      .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => b.fileCount - a.fileCount);

    // Get folder count (scoped to org)
    const folderCount = await prisma.folder.count({ where: { organizationId: orgId } });

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
