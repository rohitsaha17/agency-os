import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; depId: string }> };

// DELETE /api/tasks/[id]/dependencies/[depId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: taskId, depId: dependsOnId } = await params;
  try {
    await prisma.taskDependency.delete({
      where: { taskId_dependsOnId: { taskId, dependsOnId } },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to remove dependency" }, { status: 500 });
  }
}
