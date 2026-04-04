import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Inline builtin templates (same data as the list route)
const BUILTIN_TEMPLATES: Record<string, {
  items: { title: string; description?: string; priority: string; order: number; offsetDays: number | null; parentOrder: number | null }[];
}> = {
  tpl_branding: { items: [
    { title: "Discovery & Client Brief",     priority: "HIGH",   order: 0,  offsetDays: 0,  parentOrder: null },
    { title: "Competitor Research",          priority: "MEDIUM", order: 1,  offsetDays: 1,  parentOrder: null },
    { title: "Moodboard Creation",           priority: "MEDIUM", order: 2,  offsetDays: 3,  parentOrder: null },
    { title: "Logo Concept Development",     priority: "HIGH",   order: 3,  offsetDays: 5,  parentOrder: null },
    { title: "Direction 1 — Concept A",      priority: "MEDIUM", order: 4,  offsetDays: 5,  parentOrder: 3 },
    { title: "Direction 2 — Concept B",      priority: "MEDIUM", order: 5,  offsetDays: 5,  parentOrder: 3 },
    { title: "Direction 3 — Concept C",      priority: "MEDIUM", order: 6,  offsetDays: 5,  parentOrder: 3 },
    { title: "Client Review — Round 1",      priority: "HIGH",   order: 7,  offsetDays: 10, parentOrder: null },
    { title: "Revisions",                    priority: "HIGH",   order: 8,  offsetDays: 12, parentOrder: null },
    { title: "Final Logo Refinement",        priority: "HIGH",   order: 9,  offsetDays: 14, parentOrder: null },
    { title: "Brand Guidelines Document",    priority: "MEDIUM", order: 10, offsetDays: 16, parentOrder: null },
    { title: "Final File Export & Delivery", priority: "URGENT", order: 11, offsetDays: 18, parentOrder: null },
  ]},
  tpl_social: { items: [
    { title: "Strategy & Objectives",        priority: "HIGH",   order: 0, offsetDays: 0, parentOrder: null },
    { title: "Content Calendar",             priority: "HIGH",   order: 1, offsetDays: 2, parentOrder: null },
    { title: "Visual Asset Creation",        priority: "HIGH",   order: 2, offsetDays: 4, parentOrder: null },
    { title: "Feed Posts (x6)",              priority: "MEDIUM", order: 3, offsetDays: 4, parentOrder: 2 },
    { title: "Story Templates (x4)",         priority: "MEDIUM", order: 4, offsetDays: 4, parentOrder: 2 },
    { title: "Reel Cover Designs (x2)",      priority: "MEDIUM", order: 5, offsetDays: 5, parentOrder: 2 },
    { title: "Caption Writing",              priority: "MEDIUM", order: 6, offsetDays: 6, parentOrder: null },
    { title: "Client Approval",              priority: "URGENT", order: 7, offsetDays: 8, parentOrder: null },
    { title: "Scheduling & Publishing",      priority: "HIGH",   order: 8, offsetDays: 9, parentOrder: null },
    { title: "Performance Report",           priority: "MEDIUM", order: 9, offsetDays: 30, parentOrder: null },
  ]},
  tpl_website: { items: [
    { title: "Discovery & Requirements",           priority: "HIGH",   order: 0,  offsetDays: 0,  parentOrder: null },
    { title: "Sitemap & Information Architecture", priority: "HIGH",   order: 1,  offsetDays: 2,  parentOrder: null },
    { title: "Wireframes",                         priority: "HIGH",   order: 2,  offsetDays: 5,  parentOrder: null },
    { title: "Home Page",                          priority: "MEDIUM", order: 3,  offsetDays: 5,  parentOrder: 2 },
    { title: "Inner Pages",                        priority: "MEDIUM", order: 4,  offsetDays: 5,  parentOrder: 2 },
    { title: "UI Design — Desktop",                priority: "HIGH",   order: 5,  offsetDays: 10, parentOrder: null },
    { title: "UI Design — Mobile",                 priority: "HIGH",   order: 6,  offsetDays: 14, parentOrder: null },
    { title: "Client Review",                      priority: "URGENT", order: 7,  offsetDays: 18, parentOrder: null },
    { title: "Revisions",                          priority: "HIGH",   order: 8,  offsetDays: 20, parentOrder: null },
    { title: "Developer Handoff (Figma)",          priority: "HIGH",   order: 9,  offsetDays: 22, parentOrder: null },
  ]},
  tpl_video: { items: [
    { title: "Pre-Production Planning",   priority: "HIGH",   order: 0,  offsetDays: 0,  parentOrder: null },
    { title: "Script Writing",            priority: "HIGH",   order: 1,  offsetDays: 1,  parentOrder: 0 },
    { title: "Storyboard",               priority: "MEDIUM", order: 2,  offsetDays: 3,  parentOrder: 0 },
    { title: "Shot List & Schedule",      priority: "MEDIUM", order: 3,  offsetDays: 4,  parentOrder: 0 },
    { title: "Shoot Day",                priority: "URGENT", order: 4,  offsetDays: 7,  parentOrder: null },
    { title: "Post-Production",          priority: "HIGH",   order: 5,  offsetDays: 8,  parentOrder: null },
    { title: "Rough Cut",                priority: "MEDIUM", order: 6,  offsetDays: 8,  parentOrder: 5 },
    { title: "Color Grading",            priority: "MEDIUM", order: 7,  offsetDays: 10, parentOrder: 5 },
    { title: "Sound Mix",                priority: "MEDIUM", order: 8,  offsetDays: 11, parentOrder: 5 },
    { title: "Client Review",            priority: "URGENT", order: 9,  offsetDays: 13, parentOrder: null },
    { title: "Final Revisions",          priority: "HIGH",   order: 10, offsetDays: 15, parentOrder: null },
    { title: "Final Export & Delivery",  priority: "URGENT", order: 11, offsetDays: 17, parentOrder: null },
  ]},
  tpl_retainer: { items: [
    { title: "Monthly Strategy Call",     priority: "HIGH",   order: 0, offsetDays: 1,  parentOrder: null },
    { title: "Content Creation",          priority: "HIGH",   order: 1, offsetDays: 3,  parentOrder: null },
    { title: "Social Media Posts",        priority: "MEDIUM", order: 2, offsetDays: 3,  parentOrder: 1 },
    { title: "Email Newsletter",          priority: "MEDIUM", order: 3, offsetDays: 5,  parentOrder: 1 },
    { title: "Client Review & Approvals", priority: "URGENT", order: 4, offsetDays: 7,  parentOrder: null },
    { title: "Publishing & Distribution", priority: "HIGH",   order: 5, offsetDays: 10, parentOrder: null },
    { title: "Performance Reporting",     priority: "MEDIUM", order: 6, offsetDays: 28, parentOrder: null },
    { title: "Monthly Invoice",           priority: "HIGH",   order: 7, offsetDays: 30, parentOrder: null },
  ]},
};

type Params = { params: Promise<{ id: string }> };

// POST /api/task-templates/[id]/apply — create tasks from template
export async function POST(req: NextRequest, { params }: Params) {
  const { id: templateId } = await params;
  const template = BUILTIN_TEMPLATES[templateId];

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  try {
    const { projectId, startDate } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const baseDate = startDate ? new Date(startDate) : null;

    // Two-pass: create top-level tasks first, then subtasks
    // Map from template item order → created task id
    const orderToId = new Map<number, string>();

    // Pass 1: top-level tasks (parentOrder === null)
    const topLevel = template.items.filter((i) => i.parentOrder === null);
    for (const item of topLevel) {
      const dueDate = baseDate && item.offsetDays != null
        ? new Date(baseDate.getTime() + item.offsetDays * 86400000)
        : null;
      const task = await prisma.task.create({
        data: {
          projectId,
          title: item.title,
          priority: item.priority as never,
          order: item.order,
          dueDate,
        },
      });
      orderToId.set(item.order, task.id);
    }

    // Pass 2: subtasks
    const subtasks = template.items.filter((i) => i.parentOrder !== null);
    for (const item of subtasks) {
      const parentId = orderToId.get(item.parentOrder!);
      const dueDate = baseDate && item.offsetDays != null
        ? new Date(baseDate.getTime() + item.offsetDays * 86400000)
        : null;
      const task = await prisma.task.create({
        data: {
          projectId,
          parentId: parentId ?? null,
          title: item.title,
          priority: item.priority as never,
          order: item.order,
          dueDate,
        },
      });
      orderToId.set(item.order, task.id);
    }

    return NextResponse.json({ success: true, count: template.items.length });
  } catch (error) {
    console.error("[POST /api/task-templates/[id]/apply]", error);
    return NextResponse.json({ error: "Failed to apply template" }, { status: 500 });
  }
}
