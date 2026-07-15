import { NextResponse } from "next/server";

// NOTE (multi-tenant): This endpoint currently returns only HARDCODED builtin
// templates that are shared across every organization. When we start
// persisting user-created TaskTemplate rows, they MUST be filtered by
// `organizationId: user.organizationId` (the model already has that column
// and the auth helper already returns it).

// Hardcoded templates — no DB required until user-created templates are needed
const BUILTIN_TEMPLATES = [
  {
    id: "tpl_branding",
    name: "Brand Identity",
    description: "Full brand identity project from discovery to delivery",
    projectType: "ONE_TIME",
    items: [
      { id: "i1",  title: "Discovery & Client Brief",      priority: "HIGH",   order: 0,  offsetDays: 0,  parentOrder: null },
      { id: "i2",  title: "Competitor Research",           priority: "MEDIUM", order: 1,  offsetDays: 1,  parentOrder: null },
      { id: "i3",  title: "Moodboard Creation",            priority: "MEDIUM", order: 2,  offsetDays: 3,  parentOrder: null },
      { id: "i4",  title: "Logo Concept Development",      priority: "HIGH",   order: 3,  offsetDays: 5,  parentOrder: null },
      { id: "i5",  title: "Direction 1 — Concept A",       priority: "MEDIUM", order: 4,  offsetDays: 5,  parentOrder: 3 },
      { id: "i6",  title: "Direction 2 — Concept B",       priority: "MEDIUM", order: 5,  offsetDays: 5,  parentOrder: 3 },
      { id: "i7",  title: "Direction 3 — Concept C",       priority: "MEDIUM", order: 6,  offsetDays: 5,  parentOrder: 3 },
      { id: "i8",  title: "Client Review — Round 1",       priority: "HIGH",   order: 7,  offsetDays: 10, parentOrder: null },
      { id: "i9",  title: "Revisions",                     priority: "HIGH",   order: 8,  offsetDays: 12, parentOrder: null },
      { id: "i10", title: "Final Logo Refinement",         priority: "HIGH",   order: 9,  offsetDays: 14, parentOrder: null },
      { id: "i11", title: "Brand Guidelines Document",     priority: "MEDIUM", order: 10, offsetDays: 16, parentOrder: null },
      { id: "i12", title: "Final File Export & Delivery",  priority: "URGENT", order: 11, offsetDays: 18, parentOrder: null },
    ],
  },
  {
    id: "tpl_social",
    name: "Social Media Campaign",
    description: "End-to-end social media campaign execution",
    projectType: "ONE_TIME",
    items: [
      { id: "j1", title: "Strategy & Objectives",          priority: "HIGH",   order: 0, offsetDays: 0, parentOrder: null },
      { id: "j2", title: "Content Calendar",               priority: "HIGH",   order: 1, offsetDays: 2, parentOrder: null },
      { id: "j3", title: "Visual Asset Creation",          priority: "HIGH",   order: 2, offsetDays: 4, parentOrder: null },
      { id: "j4", title: "Feed Posts (x6)",                priority: "MEDIUM", order: 3, offsetDays: 4, parentOrder: 2 },
      { id: "j5", title: "Story Templates (x4)",           priority: "MEDIUM", order: 4, offsetDays: 4, parentOrder: 2 },
      { id: "j6", title: "Reel Cover Designs (x2)",        priority: "MEDIUM", order: 5, offsetDays: 5, parentOrder: 2 },
      { id: "j7", title: "Caption Writing",                priority: "MEDIUM", order: 6, offsetDays: 6, parentOrder: null },
      { id: "j8", title: "Client Approval",                priority: "URGENT", order: 7, offsetDays: 8, parentOrder: null },
      { id: "j9", title: "Scheduling & Publishing",        priority: "HIGH",   order: 8, offsetDays: 9, parentOrder: null },
      { id: "j10", title: "Performance Report",            priority: "MEDIUM", order: 9, offsetDays: 30, parentOrder: null },
    ],
  },
  {
    id: "tpl_website",
    name: "Website Design",
    description: "Full website design project from sitemap to handoff",
    projectType: "ONE_TIME",
    items: [
      { id: "k1", title: "Discovery & Requirements",       priority: "HIGH",   order: 0,  offsetDays: 0,  parentOrder: null },
      { id: "k2", title: "Sitemap & Information Architecture", priority: "HIGH", order: 1, offsetDays: 2, parentOrder: null },
      { id: "k3", title: "Wireframes",                     priority: "HIGH",   order: 2,  offsetDays: 5,  parentOrder: null },
      { id: "k4", title: "Home Page",                      priority: "MEDIUM", order: 3,  offsetDays: 5,  parentOrder: 2 },
      { id: "k5", title: "Inner Pages",                    priority: "MEDIUM", order: 4,  offsetDays: 5,  parentOrder: 2 },
      { id: "k6", title: "UI Design — Desktop",            priority: "HIGH",   order: 5,  offsetDays: 10, parentOrder: null },
      { id: "k7", title: "UI Design — Mobile",             priority: "HIGH",   order: 6,  offsetDays: 14, parentOrder: null },
      { id: "k8", title: "Client Review",                  priority: "URGENT", order: 7,  offsetDays: 18, parentOrder: null },
      { id: "k9", title: "Revisions",                      priority: "HIGH",   order: 8,  offsetDays: 20, parentOrder: null },
      { id: "k10", title: "Developer Handoff (Figma)",     priority: "HIGH",   order: 9,  offsetDays: 22, parentOrder: null },
    ],
  },
  {
    id: "tpl_video",
    name: "Video Production",
    description: "Full video production from concept to delivery",
    projectType: "ONE_TIME",
    items: [
      { id: "l1", title: "Pre-Production Planning",        priority: "HIGH",   order: 0,  offsetDays: 0,  parentOrder: null },
      { id: "l2", title: "Script Writing",                 priority: "HIGH",   order: 1,  offsetDays: 1,  parentOrder: 0 },
      { id: "l3", title: "Storyboard",                     priority: "MEDIUM", order: 2,  offsetDays: 3,  parentOrder: 0 },
      { id: "l4", title: "Shot List & Schedule",           priority: "MEDIUM", order: 3,  offsetDays: 4,  parentOrder: 0 },
      { id: "l5", title: "Shoot Day",                      priority: "URGENT", order: 4,  offsetDays: 7,  parentOrder: null },
      { id: "l6", title: "Post-Production",                priority: "HIGH",   order: 5,  offsetDays: 8,  parentOrder: null },
      { id: "l7", title: "Rough Cut",                      priority: "MEDIUM", order: 6,  offsetDays: 8,  parentOrder: 5 },
      { id: "l8", title: "Color Grading",                  priority: "MEDIUM", order: 7,  offsetDays: 10, parentOrder: 5 },
      { id: "l9", title: "Sound Mix",                      priority: "MEDIUM", order: 8,  offsetDays: 11, parentOrder: 5 },
      { id: "l10", title: "Client Review",                 priority: "URGENT", order: 9,  offsetDays: 13, parentOrder: null },
      { id: "l11", title: "Final Revisions",               priority: "HIGH",   order: 10, offsetDays: 15, parentOrder: null },
      { id: "l12", title: "Final Export & Delivery",       priority: "URGENT", order: 11, offsetDays: 17, parentOrder: null },
    ],
  },
  {
    id: "tpl_retainer",
    name: "Monthly Retainer",
    description: "Standard recurring monthly tasks for retainer clients",
    projectType: "RETAINER",
    items: [
      { id: "m1", title: "Monthly Strategy Call",          priority: "HIGH",   order: 0, offsetDays: 1,  parentOrder: null },
      { id: "m2", title: "Content Creation",               priority: "HIGH",   order: 1, offsetDays: 3,  parentOrder: null },
      { id: "m3", title: "Social Media Posts",             priority: "MEDIUM", order: 2, offsetDays: 3,  parentOrder: 1 },
      { id: "m4", title: "Email Newsletter",               priority: "MEDIUM", order: 3, offsetDays: 5,  parentOrder: 1 },
      { id: "m5", title: "Client Review & Approvals",      priority: "URGENT", order: 4, offsetDays: 7,  parentOrder: null },
      { id: "m6", title: "Publishing & Distribution",      priority: "HIGH",   order: 5, offsetDays: 10, parentOrder: null },
      { id: "m7", title: "Performance Reporting",          priority: "MEDIUM", order: 6, offsetDays: 28, parentOrder: null },
      { id: "m8", title: "Monthly Invoice",                priority: "HIGH",   order: 7, offsetDays: 30, parentOrder: null },
    ],
  },
];

// GET /api/task-templates
export async function GET() {
  return NextResponse.json(BUILTIN_TEMPLATES);
}
