import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (quotation.status !== "DRAFT") {
      return NextResponse.json({ error: "Only DRAFT quotations can be sent" }, { status: 400 });
    }

    const updated = await prisma.quotation.update({
      where: { id },
      data: { status: "SENT" },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to send quotation" }, { status: 500 });
  }
}
