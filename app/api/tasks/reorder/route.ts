import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/tasks/reorder — update order for a list of task IDs
export async function POST(req: NextRequest) {
  try {
    const { taskIds } = await req.json();
    if (!Array.isArray(taskIds)) {
      return NextResponse.json({ error: "taskIds must be an array" }, { status: 400 });
    }

    await prisma.$transaction(
      taskIds.map((id: string, index: number) =>
        prisma.task.update({ where: { id }, data: { order: index } })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/tasks/reorder]", error);
    return NextResponse.json({ error: "Failed to reorder tasks" }, { status: 500 });
  }
}
