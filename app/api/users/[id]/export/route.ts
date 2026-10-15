import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * GET /api/users/[id]/export — a backup of everything a delete would erase.
 *
 * A permanent delete removes the member's own data (the schema cascades it).
 * This is the record taken BEFORE that happens, so "delete with a backup" is
 * a real backup and not a promise: the profile, the leave history, the
 * attendance, the advances and salary record, the personal reminders, and the
 * list of work they were on. It is returned as JSON for the admin to keep.
 *
 * Gated on users.remove — whoever may delete a member may take their backup.
 * No password hash, ever.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const caller = await requireAuth(req);
    requireCapability(caller, "users.remove");

    const user = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: {
        id: true, name: true, email: true, role: true, isActive: true,
        createdAt: true,
        jobTitle: { select: { name: true, slug: true } },
        staffProfile: {
          select: {
            phone: true, address: true, dateOfBirth: true, dateOfJoining: true,
            emergencyName: true, emergencyPhone: true, monthlySalary: true, notes: true,
          },
        },
      },
    });
    if (!user) throw new ApiError("User not found", 404);

    const [leave, attendance, advances, salary, personalItems, assignments] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { userId: id },
        select: { startDate: true, endDate: true, reason: true, status: true, kind: true, decidedAt: true },
        orderBy: { startDate: "desc" },
      }),
      prisma.attendance.findMany({
        where: { userId: id, organizationId: caller.organizationId },
        select: { checkedInAt: true },
        orderBy: { checkedInAt: "desc" }, take: 500,
      }),
      prisma.staffAdvance.findMany({
        where: { userId: id },
        select: { amount: true, recoveryAmount: true, createdAt: true, reason: true },
      }).catch(() => []),
      prisma.salaryPayment.findMany({
        where: { userId: id },
        select: { amount: true, createdAt: true },
      }).catch(() => []),
      prisma.personalItem.findMany({
        where: { userId: id },
        select: { title: true, note: true, date: true, done: true },
      }),
      prisma.taskAssignee.findMany({
        where: { userId: id },
        select: { task: { select: { id: true, title: true, status: true } } },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: { id: caller.id, name: caller.name },
      note: "Backup of a member taken before a permanent delete. No credentials included.",
      user,
      leaveRequests: leave,
      attendance: attendance.map((a) => a.checkedInAt),
      advances,
      salaryPayments: salary,
      personalItems,
      assignedTasks: assignments.map((a) => a.task).filter(Boolean),
    };

    const safeName = (user.name || "member").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${safeName}-${id}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/users/[id]/export");
  }
}
