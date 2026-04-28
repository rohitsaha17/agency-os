import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ── Service type labels for AI context ──────────────────────────
const SERVICE_LABELS: Record<string, string> = {
  website: "Website Design & Development",
  social_media: "Social Media Management",
  seo: "SEO (Search Engine Optimization)",
  geo: "GEO (Generative Engine Optimization)",
  gmb: "Google My Business Management",
  branding: "Branding & Identity",
  logo: "Logo Design",
  uiux: "UI/UX Design",
  video: "Video Production",
  photography: "Photography",
  content: "Content Writing & Marketing",
  email_marketing: "Email Marketing",
  paid_ads: "Paid Ads / PPC",
  app_development: "App Development",
  pr: "PR & Communications",
  print: "Print Design",
  packaging: "Packaging Design",
  motion_graphics: "Motion Graphics & Animation",
  influencer: "Influencer Marketing",
  ecommerce: "E-commerce Development",
};

interface GeneratedTask {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  estimatedHours: number | null;
  offsetDays: number;
  children: GeneratedTask[];
}

// ── POST /api/ai/generate-tasks ─────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serviceTypes,   // string[] — keys from SERVICE_LABELS
      description,    // string — free-text project description
      durationWeeks,  // number — estimated project duration in weeks
      clientIndustry, // string — optional client industry
      projectName,    // string — project name
      projectType,    // "ONE_TIME" | "RETAINER"
      repeatMonths,   // number — for retainers, how many months to generate (default 1)
    } = body;

    if (!serviceTypes?.length && !description?.trim()) {
      return NextResponse.json(
        { error: "Provide at least service types or a project description" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: return smart rule-based tasks when no API key
      return NextResponse.json(
        generateFallbackTasks(serviceTypes, description, durationWeeks, projectType, repeatMonths || 1)
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const serviceLabels = (serviceTypes || [])
      .map((s: string) => SERVICE_LABELS[s] || s)
      .join(", ");

    const prompt = buildPrompt({
      serviceLabels,
      description: description?.trim() || "",
      durationWeeks: durationWeeks || 4,
      clientIndustry: clientIndustry || "",
      projectName: projectName || "",
      projectType: projectType || "ONE_TIME",
      repeatMonths: repeatMonths || 1,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const tasks: GeneratedTask[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[POST /api/ai/generate-tasks]", err);
    return NextResponse.json(
      { error: "Failed to generate tasks" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ──────────────────────────────────────────────

function buildPrompt(ctx: {
  serviceLabels: string;
  description: string;
  durationWeeks: number;
  clientIndustry: string;
  projectName: string;
  projectType: string;
  repeatMonths: number;
}): string {
  const retainerBlock = ctx.projectType === "RETAINER"
    ? `
RETAINER INSTRUCTIONS:
- This is a recurring retainer project. Generate tasks for ${ctx.repeatMonths} month(s).
- Each month should be a top-level task group (e.g., "Month 1 — Social Media", "Month 2 — Social Media").
- Within each month, include the full cycle: planning, creation, review, delivery, reporting.
- Month 1 should include onboarding/setup subtasks that later months don't need.
- Months 2+ should follow an "ongoing" pattern with execution and optimization tasks.
- offsetDays should increment by ~30 days per month (Month 1: 0-29, Month 2: 30-59, etc.).`
    : "";

  return `You are a senior creative agency project manager. Generate a detailed task breakdown for an agency project.

PROJECT CONTEXT:
- Project name: ${ctx.projectName || "(unnamed)"}
- Service types: ${ctx.serviceLabels || "General agency project"}
- Project type: ${ctx.projectType === "RETAINER" ? "Recurring/Retainer" : "One-time project"}
- Timeline: ${ctx.durationWeeks} weeks
${ctx.clientIndustry ? `- Client industry: ${ctx.clientIndustry}` : ""}
${ctx.description ? `- Description: ${ctx.description}` : ""}
${retainerBlock}

REQUIREMENTS:
1. Generate 8-20 top-level tasks with realistic subtasks where appropriate
2. Each task should have: title, description (1 sentence), priority (LOW/MEDIUM/HIGH/URGENT), estimatedHours (number or null), offsetDays (days from project start when task should be due)
3. Group tasks into logical phases (e.g., Discovery, Strategy, Production, Review, Delivery)
4. Include agency-specific tasks like client reviews, revision rounds, internal QA
5. For retainer projects, structure as monthly recurring milestones with clear month labels
6. Subtasks should be nested under parent tasks as "children" array
7. offsetDays should span the full timeline appropriately
8. Be specific to the service types — don't be generic

Return ONLY a JSON array (no markdown, no explanation) in this exact format:
[
  {
    "title": "Phase: Discovery & Brief",
    "description": "Gather requirements and align on project goals",
    "priority": "HIGH",
    "estimatedHours": 4,
    "offsetDays": 0,
    "children": [
      {
        "title": "Client kickoff call",
        "description": "Initial meeting to discuss objectives and deliverables",
        "priority": "HIGH",
        "estimatedHours": 2,
        "offsetDays": 0,
        "children": []
      }
    ]
  }
]`;
}

// ── Fallback: rule-based generator (no AI key needed) ───────────

function generateFallbackTasks(
  serviceTypes: string[],
  _description: string,
  durationWeeks: number,
  projectType: string,
  repeatMonths: number,
): { tasks: GeneratedTask[] } {
  const weeks = durationWeeks || 4;
  const totalDays = weeks * 7;

  // Common agency phases with proportional timing
  const phases: { title: string; pct: number; priority: "HIGH" | "MEDIUM" | "URGENT" }[] = [
    { title: "Discovery & Brief", pct: 0.0, priority: "HIGH" },
    { title: "Research & Strategy", pct: 0.1, priority: "HIGH" },
    { title: "Creative Development", pct: 0.25, priority: "HIGH" },
    { title: "Client Review — Round 1", pct: 0.5, priority: "URGENT" },
    { title: "Revisions & Refinement", pct: 0.6, priority: "HIGH" },
    { title: "Client Review — Round 2", pct: 0.75, priority: "URGENT" },
    { title: "Final Production", pct: 0.8, priority: "HIGH" },
    { title: "QA & Internal Review", pct: 0.85, priority: "MEDIUM" },
    { title: "Delivery & Handoff", pct: 0.95, priority: "URGENT" },
  ];

  // Service-specific subtask pools
  const subtasksByService: Record<string, { parent: number; title: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }[]> = {
    website: [
      { parent: 0, title: "Gather content & assets from client", priority: "HIGH" },
      { parent: 1, title: "Sitemap & information architecture", priority: "HIGH" },
      { parent: 1, title: "Competitor website analysis", priority: "MEDIUM" },
      { parent: 2, title: "Wireframes — Desktop", priority: "HIGH" },
      { parent: 2, title: "Wireframes — Mobile", priority: "HIGH" },
      { parent: 2, title: "UI Design — Home page", priority: "HIGH" },
      { parent: 2, title: "UI Design — Inner pages", priority: "MEDIUM" },
      { parent: 6, title: "Frontend development", priority: "HIGH" },
      { parent: 6, title: "CMS integration", priority: "MEDIUM" },
      { parent: 6, title: "Responsive testing", priority: "MEDIUM" },
      { parent: 7, title: "Cross-browser testing", priority: "MEDIUM" },
      { parent: 7, title: "Performance optimization", priority: "MEDIUM" },
      { parent: 8, title: "DNS & hosting setup", priority: "HIGH" },
      { parent: 8, title: "Launch checklist", priority: "HIGH" },
    ],
    branding: [
      { parent: 0, title: "Brand questionnaire", priority: "HIGH" },
      { parent: 1, title: "Competitor brand audit", priority: "MEDIUM" },
      { parent: 1, title: "Moodboard creation", priority: "MEDIUM" },
      { parent: 2, title: "Logo concept — Direction A", priority: "HIGH" },
      { parent: 2, title: "Logo concept — Direction B", priority: "HIGH" },
      { parent: 2, title: "Logo concept — Direction C", priority: "MEDIUM" },
      { parent: 4, title: "Logo refinement & variations", priority: "HIGH" },
      { parent: 6, title: "Brand guidelines document", priority: "HIGH" },
      { parent: 6, title: "Color palette & typography spec", priority: "MEDIUM" },
      { parent: 8, title: "Final file export (AI, SVG, PNG, PDF)", priority: "HIGH" },
    ],
    logo: [
      { parent: 0, title: "Logo brief & references", priority: "HIGH" },
      { parent: 1, title: "Style exploration & moodboard", priority: "MEDIUM" },
      { parent: 2, title: "Logo sketches (5-8 directions)", priority: "HIGH" },
      { parent: 2, title: "Digital concepts (3 finalists)", priority: "HIGH" },
      { parent: 4, title: "Chosen direction refinement", priority: "HIGH" },
      { parent: 6, title: "Final logo with variations", priority: "HIGH" },
      { parent: 8, title: "File export & brand usage guide", priority: "MEDIUM" },
    ],
    social_media: [
      { parent: 0, title: "Account audit & competitor analysis", priority: "HIGH" },
      { parent: 1, title: "Content strategy & pillars", priority: "HIGH" },
      { parent: 1, title: "Content calendar (monthly)", priority: "HIGH" },
      { parent: 2, title: "Post designs — Feed (x8)", priority: "HIGH" },
      { parent: 2, title: "Story templates (x4)", priority: "MEDIUM" },
      { parent: 2, title: "Reel concepts & scripts (x2)", priority: "MEDIUM" },
      { parent: 2, title: "Caption writing", priority: "MEDIUM" },
      { parent: 6, title: "Scheduling & publishing", priority: "HIGH" },
      { parent: 8, title: "Monthly performance report", priority: "MEDIUM" },
    ],
    video: [
      { parent: 0, title: "Creative brief & references", priority: "HIGH" },
      { parent: 1, title: "Script writing", priority: "HIGH" },
      { parent: 1, title: "Storyboard", priority: "MEDIUM" },
      { parent: 2, title: "Pre-production planning", priority: "HIGH" },
      { parent: 2, title: "Shot list & schedule", priority: "MEDIUM" },
      { parent: 2, title: "Shoot day(s)", priority: "HIGH" },
      { parent: 6, title: "Rough cut edit", priority: "HIGH" },
      { parent: 6, title: "Color grading", priority: "MEDIUM" },
      { parent: 6, title: "Sound design & mix", priority: "MEDIUM" },
      { parent: 8, title: "Final export (multiple formats)", priority: "HIGH" },
    ],
    seo: [
      { parent: 0, title: "Current rankings audit", priority: "HIGH" },
      { parent: 1, title: "Keyword research & mapping", priority: "HIGH" },
      { parent: 1, title: "Technical SEO audit", priority: "HIGH" },
      { parent: 2, title: "On-page optimization", priority: "HIGH" },
      { parent: 2, title: "Meta tags & schema markup", priority: "MEDIUM" },
      { parent: 2, title: "Content gap analysis", priority: "MEDIUM" },
      { parent: 6, title: "Blog/content creation", priority: "MEDIUM" },
      { parent: 6, title: "Link building outreach", priority: "LOW" },
      { parent: 8, title: "Rankings & traffic report", priority: "MEDIUM" },
    ],
    paid_ads: [
      { parent: 0, title: "Campaign brief & goals", priority: "HIGH" },
      { parent: 1, title: "Audience research & targeting", priority: "HIGH" },
      { parent: 1, title: "Budget allocation plan", priority: "HIGH" },
      { parent: 2, title: "Ad creative design", priority: "HIGH" },
      { parent: 2, title: "Ad copywriting (variations)", priority: "MEDIUM" },
      { parent: 2, title: "Landing page setup", priority: "MEDIUM" },
      { parent: 6, title: "Campaign launch & monitoring", priority: "HIGH" },
      { parent: 6, title: "A/B testing & optimization", priority: "MEDIUM" },
      { parent: 8, title: "Performance report & ROI analysis", priority: "MEDIUM" },
    ],
    uiux: [
      { parent: 0, title: "Stakeholder interviews", priority: "HIGH" },
      { parent: 1, title: "User research & personas", priority: "HIGH" },
      { parent: 1, title: "User flow mapping", priority: "HIGH" },
      { parent: 2, title: "Low-fidelity wireframes", priority: "HIGH" },
      { parent: 2, title: "High-fidelity mockups", priority: "HIGH" },
      { parent: 2, title: "Interactive prototype", priority: "MEDIUM" },
      { parent: 6, title: "Usability testing", priority: "MEDIUM" },
      { parent: 6, title: "Design system documentation", priority: "MEDIUM" },
      { parent: 8, title: "Developer handoff (Figma/Zeplin)", priority: "HIGH" },
    ],
    content: [
      { parent: 0, title: "Content audit & brief", priority: "HIGH" },
      { parent: 1, title: "Content strategy & topics", priority: "HIGH" },
      { parent: 1, title: "Editorial calendar", priority: "MEDIUM" },
      { parent: 2, title: "Blog articles (drafts)", priority: "HIGH" },
      { parent: 2, title: "Website copy", priority: "HIGH" },
      { parent: 4, title: "Copy revisions", priority: "MEDIUM" },
      { parent: 6, title: "SEO optimization of content", priority: "MEDIUM" },
      { parent: 8, title: "Content publishing", priority: "HIGH" },
    ],
    email_marketing: [
      { parent: 0, title: "Email strategy & goals", priority: "HIGH" },
      { parent: 1, title: "Audience segmentation", priority: "HIGH" },
      { parent: 2, title: "Email template design", priority: "HIGH" },
      { parent: 2, title: "Email copywriting", priority: "HIGH" },
      { parent: 6, title: "A/B test setup", priority: "MEDIUM" },
      { parent: 6, title: "List hygiene & warm-up", priority: "MEDIUM" },
      { parent: 8, title: "Campaign send & monitoring", priority: "HIGH" },
      { parent: 8, title: "Open/click rate report", priority: "MEDIUM" },
    ],
    photography: [
      { parent: 0, title: "Shot brief & references", priority: "HIGH" },
      { parent: 1, title: "Location scouting", priority: "MEDIUM" },
      { parent: 1, title: "Props & styling plan", priority: "MEDIUM" },
      { parent: 2, title: "Shoot day", priority: "HIGH" },
      { parent: 6, title: "Photo selection & culling", priority: "HIGH" },
      { parent: 6, title: "Retouching & color correction", priority: "HIGH" },
      { parent: 8, title: "Final file delivery", priority: "HIGH" },
    ],
    app_development: [
      { parent: 0, title: "Requirements gathering", priority: "HIGH" },
      { parent: 1, title: "Technical architecture", priority: "HIGH" },
      { parent: 1, title: "UX wireframes & flows", priority: "HIGH" },
      { parent: 2, title: "UI design", priority: "HIGH" },
      { parent: 2, title: "Frontend development", priority: "HIGH" },
      { parent: 2, title: "Backend / API development", priority: "HIGH" },
      { parent: 6, title: "Integration testing", priority: "HIGH" },
      { parent: 7, title: "QA & bug fixes", priority: "HIGH" },
      { parent: 8, title: "App store submission", priority: "URGENT" },
    ],
    pr: [
      { parent: 0, title: "PR brief & messaging", priority: "HIGH" },
      { parent: 1, title: "Media list building", priority: "HIGH" },
      { parent: 2, title: "Press release drafting", priority: "HIGH" },
      { parent: 2, title: "Media kit preparation", priority: "MEDIUM" },
      { parent: 6, title: "Media outreach", priority: "HIGH" },
      { parent: 8, title: "Coverage tracking & report", priority: "MEDIUM" },
    ],
    geo: [
      { parent: 0, title: "AI search landscape audit", priority: "HIGH" },
      { parent: 1, title: "Entity & topic cluster mapping", priority: "HIGH" },
      { parent: 1, title: "Structured data strategy", priority: "HIGH" },
      { parent: 2, title: "Authority content creation", priority: "HIGH" },
      { parent: 2, title: "FAQ & knowledge base optimization", priority: "MEDIUM" },
      { parent: 6, title: "Citation & source monitoring", priority: "MEDIUM" },
      { parent: 8, title: "AI visibility report", priority: "MEDIUM" },
    ],
    gmb: [
      { parent: 0, title: "GMB profile audit", priority: "HIGH" },
      { parent: 1, title: "Category & attribute optimization", priority: "HIGH" },
      { parent: 2, title: "Photo & video upload", priority: "MEDIUM" },
      { parent: 2, title: "Business description optimization", priority: "MEDIUM" },
      { parent: 6, title: "Weekly GMB posts", priority: "MEDIUM" },
      { parent: 6, title: "Review response strategy", priority: "HIGH" },
      { parent: 8, title: "Local ranking report", priority: "MEDIUM" },
    ],
    print: [
      { parent: 0, title: "Print brief & specifications", priority: "HIGH" },
      { parent: 1, title: "Format & material selection", priority: "MEDIUM" },
      { parent: 2, title: "Layout design (front/back)", priority: "HIGH" },
      { parent: 2, title: "Typography & color proofing", priority: "MEDIUM" },
      { parent: 6, title: "Print-ready file preparation", priority: "HIGH" },
      { parent: 7, title: "Press proof review", priority: "HIGH" },
      { parent: 8, title: "Final files to printer", priority: "URGENT" },
    ],
    packaging: [
      { parent: 0, title: "Packaging brief & constraints", priority: "HIGH" },
      { parent: 1, title: "Structural design & dieline", priority: "HIGH" },
      { parent: 2, title: "Surface design concepts", priority: "HIGH" },
      { parent: 2, title: "Material & finish selection", priority: "MEDIUM" },
      { parent: 4, title: "3D mockup rendering", priority: "MEDIUM" },
      { parent: 6, title: "Print-ready artwork", priority: "HIGH" },
      { parent: 8, title: "Production sample review", priority: "URGENT" },
    ],
    motion_graphics: [
      { parent: 0, title: "Animation brief & references", priority: "HIGH" },
      { parent: 1, title: "Concept & storyboard", priority: "HIGH" },
      { parent: 2, title: "Style frames & design", priority: "HIGH" },
      { parent: 2, title: "Animation production", priority: "HIGH" },
      { parent: 6, title: "Sound design & music", priority: "MEDIUM" },
      { parent: 6, title: "Final compositing & render", priority: "HIGH" },
      { parent: 8, title: "Export (multiple formats)", priority: "HIGH" },
    ],
    influencer: [
      { parent: 0, title: "Campaign brief & KPIs", priority: "HIGH" },
      { parent: 1, title: "Influencer research & shortlist", priority: "HIGH" },
      { parent: 1, title: "Outreach & negotiation", priority: "HIGH" },
      { parent: 2, title: "Content briefs for influencers", priority: "HIGH" },
      { parent: 2, title: "Contract & deliverables agreement", priority: "MEDIUM" },
      { parent: 6, title: "Content review & approval", priority: "URGENT" },
      { parent: 6, title: "Campaign go-live tracking", priority: "HIGH" },
      { parent: 8, title: "Performance & ROI report", priority: "MEDIUM" },
    ],
    ecommerce: [
      { parent: 0, title: "E-commerce requirements audit", priority: "HIGH" },
      { parent: 1, title: "Platform & plugin selection", priority: "HIGH" },
      { parent: 1, title: "Product catalog structure", priority: "HIGH" },
      { parent: 2, title: "Store design & theme setup", priority: "HIGH" },
      { parent: 2, title: "Product listing & content", priority: "HIGH" },
      { parent: 2, title: "Payment & shipping config", priority: "HIGH" },
      { parent: 6, title: "Checkout flow testing", priority: "HIGH" },
      { parent: 7, title: "Performance & load testing", priority: "MEDIUM" },
      { parent: 8, title: "Store launch & go-live", priority: "URGENT" },
    ],
  };

  // ── For retainer projects: generate monthly recurring structure ──
  if (projectType === "RETAINER") {
    const months = Math.max(1, Math.min(12, repeatMonths));

    // Retainer monthly task templates per service
    const retainerMonthly: Record<string, { title: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }[]> = {
      social_media: [
        { title: "Content calendar planning", priority: "HIGH" },
        { title: "Post designs — Feed (x8-12)", priority: "HIGH" },
        { title: "Story templates (x4-8)", priority: "MEDIUM" },
        { title: "Reel concepts & scripts (x2-4)", priority: "MEDIUM" },
        { title: "Caption & hashtag writing", priority: "MEDIUM" },
        { title: "Client content review & approval", priority: "URGENT" },
        { title: "Scheduling & publishing", priority: "HIGH" },
        { title: "Community management & engagement", priority: "MEDIUM" },
        { title: "Monthly analytics & performance report", priority: "HIGH" },
      ],
      seo: [
        { title: "Keyword performance review", priority: "HIGH" },
        { title: "Technical SEO maintenance", priority: "MEDIUM" },
        { title: "Content creation (2-4 blog posts)", priority: "HIGH" },
        { title: "On-page optimization updates", priority: "MEDIUM" },
        { title: "Link building outreach", priority: "LOW" },
        { title: "Competitor ranking analysis", priority: "MEDIUM" },
        { title: "Monthly SEO report & recommendations", priority: "HIGH" },
      ],
      paid_ads: [
        { title: "Campaign performance review", priority: "HIGH" },
        { title: "Budget reallocation & optimization", priority: "HIGH" },
        { title: "New ad creative refresh", priority: "HIGH" },
        { title: "A/B testing — copy & creative", priority: "MEDIUM" },
        { title: "Audience refinement & expansion", priority: "MEDIUM" },
        { title: "Landing page optimization", priority: "MEDIUM" },
        { title: "Monthly ROAS & spend report", priority: "HIGH" },
      ],
      content: [
        { title: "Editorial calendar planning", priority: "HIGH" },
        { title: "Blog article drafts (3-5)", priority: "HIGH" },
        { title: "SEO keyword alignment", priority: "MEDIUM" },
        { title: "Client review & revisions", priority: "URGENT" },
        { title: "Content publishing & distribution", priority: "HIGH" },
        { title: "Monthly traffic & engagement report", priority: "MEDIUM" },
      ],
      email_marketing: [
        { title: "Campaign planning & calendar", priority: "HIGH" },
        { title: "Email template design (2-4)", priority: "HIGH" },
        { title: "Email copywriting", priority: "HIGH" },
        { title: "Audience list management", priority: "MEDIUM" },
        { title: "A/B testing setup", priority: "MEDIUM" },
        { title: "Campaign sends & monitoring", priority: "HIGH" },
        { title: "Monthly open/click/conversion report", priority: "MEDIUM" },
      ],
      gmb: [
        { title: "GMB weekly posts (x4)", priority: "MEDIUM" },
        { title: "Review monitoring & responses", priority: "HIGH" },
        { title: "Photo & update uploads", priority: "LOW" },
        { title: "Q&A monitoring", priority: "LOW" },
        { title: "Local ranking report", priority: "MEDIUM" },
      ],
      pr: [
        { title: "Media monitoring & clipping", priority: "MEDIUM" },
        { title: "Press release (if newsworthy)", priority: "MEDIUM" },
        { title: "Journalist relationship building", priority: "LOW" },
        { title: "Monthly media outreach", priority: "HIGH" },
        { title: "Coverage & sentiment report", priority: "MEDIUM" },
      ],
      influencer: [
        { title: "Influencer content calendar", priority: "HIGH" },
        { title: "New influencer outreach", priority: "MEDIUM" },
        { title: "Content briefs & approvals", priority: "HIGH" },
        { title: "Campaign tracking & engagement", priority: "HIGH" },
        { title: "Monthly influencer ROI report", priority: "MEDIUM" },
      ],
    };

    const allTasks: GeneratedTask[] = [];

    for (let m = 0; m < months; m++) {
      const monthLabel = `Month ${m + 1}`;
      const baseOffset = m * 30;
      const isFirstMonth = m === 0;

      // First month includes setup tasks
      if (isFirstMonth) {
        const setupChildren: GeneratedTask[] = [];

        // Onboarding subtasks
        setupChildren.push(
          { title: "Account access & credentials setup", description: "Gather all platform credentials and access", priority: "HIGH", estimatedHours: 2, offsetDays: baseOffset, children: [] },
          { title: "Brand guidelines & asset review", description: "Review existing brand materials and guidelines", priority: "HIGH", estimatedHours: 3, offsetDays: baseOffset + 1, children: [] },
          { title: "Competitor & market analysis", description: "Analyze competitors and market positioning", priority: "HIGH", estimatedHours: 4, offsetDays: baseOffset + 2, children: [] },
          { title: "Strategy & goals alignment", description: "Define KPIs and monthly deliverables with client", priority: "URGENT", estimatedHours: 3, offsetDays: baseOffset + 3, children: [] },
        );

        allTasks.push({
          title: `${monthLabel} — Onboarding & Setup`,
          description: "Initial setup, strategy alignment, and first-month planning",
          priority: "HIGH",
          estimatedHours: null,
          offsetDays: baseOffset,
          children: setupChildren,
        });
      }

      // Monthly execution tasks for each service
      for (const svc of (serviceTypes || [])) {
        const monthlyPool = retainerMonthly[svc];
        const svcLabel = SERVICE_LABELS[svc] || svc;

        if (monthlyPool) {
          // Service has a retainer monthly template
          const children: GeneratedTask[] = monthlyPool.map((sub, idx) => ({
            title: sub.title,
            description: "",
            priority: sub.priority,
            estimatedHours: null,
            offsetDays: baseOffset + Math.round((idx / monthlyPool.length) * 28),
            children: [],
          }));

          allTasks.push({
            title: `${monthLabel} — ${svcLabel}`,
            description: isFirstMonth ? "First month execution and deliverables" : "Ongoing monthly execution",
            priority: "HIGH",
            estimatedHours: null,
            offsetDays: baseOffset + (isFirstMonth ? 5 : 0),
            children,
          });
        } else {
          // Fallback: use phase-based subtasks for non-retainer services
          const pool = subtasksByService[svc] || [];
          // Pick execution-phase subtasks (phases 2-8)
          const executionSubs = pool.filter((s) => s.parent >= 2);
          const children: GeneratedTask[] = executionSubs.map((sub, idx) => ({
            title: sub.title,
            description: "",
            priority: sub.priority,
            estimatedHours: null,
            offsetDays: baseOffset + Math.round((idx / executionSubs.length) * 28),
            children: [],
          }));

          allTasks.push({
            title: `${monthLabel} — ${svcLabel}`,
            description: isFirstMonth ? "First month execution" : "Monthly deliverables",
            priority: "HIGH",
            estimatedHours: null,
            offsetDays: baseOffset + (isFirstMonth ? 5 : 0),
            children,
          });
        }
      }
    }

    return { tasks: allTasks };
  }

  // ── One-time project: phase-based structure ──
  const tasks: GeneratedTask[] = phases.map((phase, i) => {
    const dayOffset = Math.round(phase.pct * totalDays);

    const children: GeneratedTask[] = [];
    for (const svc of (serviceTypes || [])) {
      const pool = subtasksByService[svc] || [];
      for (const sub of pool) {
        if (sub.parent === i) {
          children.push({
            title: sub.title,
            description: "",
            priority: sub.priority,
            estimatedHours: null,
            offsetDays: dayOffset + Math.floor(Math.random() * 3),
            children: [],
          });
        }
      }
    }

    return {
      title: phase.title,
      description: "",
      priority: phase.priority,
      estimatedHours: null,
      offsetDays: dayOffset,
      children,
    };
  });

  return { tasks };
}
