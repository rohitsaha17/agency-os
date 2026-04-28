import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get file counts grouped by project
    const projectFiles = await prisma.file.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null } },
      _count: { id: true },
    });

    // Get file counts grouped by client
    const clientFiles = await prisma.file.groupBy({
      by: ["clientId"],
      where: { clientId: { not: null } },
      _count: { id: true },
    });

    // Count unlinked files (no project, no client)
    const unlinkedCount = await prisma.file.count({
      where: { projectId: null, clientId: null },
    });

    // Get project names
    const projectIds = projectFiles.map((p) => p.projectId!);
    const projectDetails = projectIds.length
      ? await prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true, status: true, client: { select: { id: true, name: true, companyName: true } } },
        })
      : [];

    // Get client names
    const clientIds = clientFiles.map((c) => c.clientId!);
    const clientDetails = clientIds.length
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
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
      .sort((a: any, b: any) => b.fileCount - a.fileCount);

    // Get folder count
    const folderCount = await prisma.folder.count();

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
    console.error("[GET /api/files/stats]", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
