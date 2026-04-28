import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

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

// ── Types ───────────────────────────────────────────────────────

interface EstimateRequest {
  taskTitle: string;
  taskDescription?: string;
  serviceType?: string;
  parentTaskTitle?: string;
  priority?: string;
  hasSubtasks?: boolean;
}

interface EstimateBreakdown {
  phase: string;
  hours: number;
}

interface EstimateResponse {
  estimatedHours: number;
  reasoning: string;
  confidence: string;
  breakdown?: EstimateBreakdown[];
}

// ── POST /api/ai/estimate-hours ─────────────────────────────────

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-hours");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.light);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: EstimateRequest = await req.json();
    const {
      taskTitle,
      taskDescription,
      serviceType,
      parentTaskTitle,
      priority,
      hasSubtasks,
    } = body;

    if (!taskTitle?.trim()) {
      return NextResponse.json(
        { error: "taskTitle is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: rule-based estimation when no API key is configured
      const fallback = estimateByRules(body);
      return NextResponse.json(fallback);
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = buildPrompt({
      taskTitle: taskTitle.trim(),
      taskDescription: taskDescription?.trim() || "",
      serviceType: serviceType
        ? SERVICE_LABELS[serviceType] || serviceType
        : "",
      parentTaskTitle: parentTaskTitle?.trim() || "",
      priority: priority || "MEDIUM",
      hasSubtasks: hasSubtasks ?? false,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If AI response can't be parsed, fall back to rules
      const fallback = estimateByRules(body);
      return NextResponse.json(fallback);
    }

    const parsed = JSON.parse(jsonMatch[0]) as EstimateResponse;

    // Validate required fields
    if (
      typeof parsed.estimatedHours !== "number" ||
      !parsed.reasoning ||
      !parsed.confidence
    ) {
      const fallback = estimateByRules(body);
      return NextResponse.json(fallback);
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[POST /api/ai/estimate-hours]", err);
    return NextResponse.json(
      { error: "Failed to estimate hours" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ──────────────────────────────────────────────

function buildPrompt(ctx: {
  taskTitle: string;
  taskDescription: string;
  serviceType: string;
  parentTaskTitle: string;
  priority: string;
  hasSubtasks: boolean;
}): string {
  return `You are a senior creative agency project manager with 15+ years of experience estimating effort for agency tasks. Estimate the hours required for the following task.

TASK DETAILS:
- Task title: ${ctx.taskTitle}
${ctx.taskDescription ? `- Description: ${ctx.taskDescription}` : ""}
${ctx.serviceType ? `- Service type: ${ctx.serviceType}` : ""}
${ctx.parentTaskTitle ? `- Parent task: ${ctx.parentTaskTitle} (this is a subtask)` : ""}
- Priority: ${ctx.priority}
- Has subtasks: ${ctx.hasSubtasks ? "Yes (this is a parent/aggregate task — estimate the TOTAL including subtask effort)" : "No (this is a leaf task — estimate individual work only)"}

ESTIMATION GUIDELINES:
- Consider the complexity implied by the task title and description
- Factor in the service type context:
  - Video production, app development, and e-commerce tasks generally take longer (shooting, editing, coding)
  - Design tasks (logo, branding, UI/UX) involve iteration cycles and creative exploration
  - Content writing and copywriting are typically faster per deliverable
  - SEO, paid ads, and analytics tasks vary by scope but often include research time
  - Review and approval tasks are short (1-2 hours) unless they involve revision rounds
- Priority affects urgency, not necessarily hours (but URGENT tasks may need buffer for rush delivery)
- Parent tasks with subtasks should reflect the aggregate effort of all work involved
- Leaf tasks should reflect only the individual hands-on work
- Include realistic buffer for client communication, internal reviews, and minor revisions
- Agency tasks always have some overhead (file management, communication, context switching)

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "estimatedHours": <number>,
  "reasoning": "<1-2 sentence explanation of the estimate>",
  "confidence": "<low|medium|high>",
  "breakdown": [
    { "phase": "<phase name>", "hours": <number> }
  ]
}

Rules for the response:
- estimatedHours must be a positive number (can be decimal, e.g. 1.5)
- confidence should be "high" if the task is well-defined, "medium" for average clarity, "low" if vague
- breakdown is optional but recommended for tasks over 4 hours — split into logical phases
- Keep reasoning concise and actionable`;
}

// ── Rule-based fallback estimator ───────────────────────────────

// Keyword patterns mapped to hour ranges [min, max]
const KEYWORD_RULES: { pattern: RegExp; range: [number, number]; label: string }[] = [
  // Quick tasks
  { pattern: /\breview\b/i, range: [1, 2], label: "Review" },
  { pattern: /\bapproval?\b/i, range: [0.5, 1], label: "Approval" },
  { pattern: /\bfeedback\b/i, range: [1, 2], label: "Feedback" },
  { pattern: /\bmeeting\b|\bcall\b|\bkickoff\b/i, range: [1, 2], label: "Meeting" },
  { pattern: /\baudit\b/i, range: [3, 6], label: "Audit" },
  { pattern: /\bcheck\b|\bverif/i, range: [0.5, 1.5], label: "Verification" },

  // Research & strategy
  { pattern: /\bresearch\b/i, range: [3, 6], label: "Research" },
  { pattern: /\bstrategy\b|\bplanning\b/i, range: [4, 8], label: "Strategy" },
  { pattern: /\banalysis\b|\banalyze\b/i, range: [3, 6], label: "Analysis" },
  { pattern: /\bmoodboard\b|\binspiration\b/i, range: [2, 4], label: "Moodboard" },

  // Design
  { pattern: /\blogo\b/i, range: [6, 12], label: "Logo design" },
  { pattern: /\bbrand(ing)?\b.*\bguideline/i, range: [8, 16], label: "Brand guidelines" },
  { pattern: /\bdesign\b/i, range: [4, 8], label: "Design" },
  { pattern: /\bwireframe/i, range: [4, 8], label: "Wireframing" },
  { pattern: /\bmockup\b|\bprototype\b/i, range: [4, 8], label: "Mockup/Prototype" },
  { pattern: /\billustrat/i, range: [4, 10], label: "Illustration" },
  { pattern: /\bicon/i, range: [2, 4], label: "Icon design" },
  { pattern: /\blayout\b/i, range: [3, 6], label: "Layout" },

  // Development
  { pattern: /\bdevelop(ment)?\b|\bcoding\b|\bimplement/i, range: [8, 16], label: "Development" },
  { pattern: /\bfrontend\b|\bfront-end\b/i, range: [8, 20], label: "Frontend development" },
  { pattern: /\bbackend\b|\bback-end\b|\bapi\b/i, range: [8, 20], label: "Backend development" },
  { pattern: /\bintegrat/i, range: [4, 8], label: "Integration" },
  { pattern: /\btesting\b|\bqa\b|\bbug\s*fix/i, range: [3, 8], label: "Testing/QA" },
  { pattern: /\bdeploy\b|\blaunch\b|\bgo[\s-]?live\b/i, range: [2, 4], label: "Deployment" },
  { pattern: /\bresponsive\b/i, range: [3, 6], label: "Responsive work" },

  // Content & copy
  { pattern: /\bcopywriting\b|\bcopy\b/i, range: [2, 5], label: "Copywriting" },
  { pattern: /\bblog\b|\barticle\b/i, range: [3, 6], label: "Blog/Article" },
  { pattern: /\bcontent\s*creat/i, range: [3, 8], label: "Content creation" },
  { pattern: /\bcaption/i, range: [1, 3], label: "Caption writing" },
  { pattern: /\bscript\b/i, range: [3, 6], label: "Script writing" },

  // Video & motion
  { pattern: /\bvideo\s*edit/i, range: [6, 16], label: "Video editing" },
  { pattern: /\bshoot\b|\bfilming\b/i, range: [4, 10], label: "Video shoot" },
  { pattern: /\banimation\b|\bmotion\b|\banimate\b/i, range: [6, 16], label: "Animation" },
  { pattern: /\bcolor\s*grad/i, range: [2, 4], label: "Color grading" },
  { pattern: /\bsound\s*design\b|\baudio\b/i, range: [2, 5], label: "Sound design" },
  { pattern: /\bstoryboard/i, range: [3, 6], label: "Storyboard" },

  // Photography
  { pattern: /\bphoto\s*shoot\b|\bphotography\b/i, range: [3, 8], label: "Photography" },
  { pattern: /\bretouch/i, range: [2, 6], label: "Retouching" },

  // Marketing & ads
  { pattern: /\bad\s*creat/i, range: [3, 6], label: "Ad creative" },
  { pattern: /\bcampaign\b/i, range: [4, 10], label: "Campaign" },
  { pattern: /\bseo\b/i, range: [4, 8], label: "SEO work" },
  { pattern: /\bemail\s*(template|design|campaign)/i, range: [3, 6], label: "Email marketing" },
  { pattern: /\bsocial\s*media\b|\bpost\s*design/i, range: [3, 6], label: "Social media" },

  // Admin & delivery
  { pattern: /\breport\b|\banalytics\b/i, range: [2, 4], label: "Reporting" },
  { pattern: /\bhandoff\b|\bdelivery\b|\bexport\b/i, range: [1, 3], label: "Delivery" },
  { pattern: /\bsetup\b|\bconfig/i, range: [2, 4], label: "Setup" },
  { pattern: /\bschedul/i, range: [1, 2], label: "Scheduling" },
];

// Service-type multipliers (relative to the base keyword estimate)
const SERVICE_MULTIPLIERS: Record<string, number> = {
  video: 1.5,
  motion_graphics: 1.4,
  app_development: 1.6,
  ecommerce: 1.4,
  photography: 1.1,
  website: 1.2,
  uiux: 1.1,
  branding: 1.2,
  logo: 1.0,
  social_media: 0.9,
  content: 0.8,
  email_marketing: 0.9,
  seo: 1.0,
  paid_ads: 1.0,
  pr: 0.9,
  print: 1.0,
  packaging: 1.1,
  influencer: 0.9,
  geo: 1.0,
  gmb: 0.8,
};

function estimateByRules(input: EstimateRequest): EstimateResponse {
  const title = input.taskTitle.toLowerCase();
  const description = (input.taskDescription || "").toLowerCase();
  const combined = `${title} ${description}`;

  // Find matching keyword rules
  const matches: { range: [number, number]; label: string }[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(combined)) {
      matches.push({ range: rule.range, label: rule.label });
    }
  }

  let minHours: number;
  let maxHours: number;
  let matchedLabels: string[];

  if (matches.length === 0) {
    // No keywords matched — use a generic estimate
    minHours = 2;
    maxHours = 6;
    matchedLabels = ["General task"];
  } else {
    // Use the widest range from matched rules (takes the max of maxes, min of mins)
    // but average the midpoints to avoid inflated estimates
    const midpoints = matches.map((m) => (m.range[0] + m.range[1]) / 2);
    const avgMidpoint =
      midpoints.reduce((a, b) => a + b, 0) / midpoints.length;

    // Spread is the average spread of matched rules
    const avgSpread =
      matches.reduce((a, m) => a + (m.range[1] - m.range[0]), 0) /
      matches.length;

    minHours = Math.max(0.5, avgMidpoint - avgSpread / 2);
    maxHours = avgMidpoint + avgSpread / 2;
    matchedLabels = matches.map((m) => m.label);
  }

  // Apply service-type multiplier
  const multiplier = input.serviceType
    ? SERVICE_MULTIPLIERS[input.serviceType] || 1.0
    : 1.0;

  minHours *= multiplier;
  maxHours *= multiplier;

  // Parent tasks with subtasks get a higher aggregate estimate
  if (input.hasSubtasks) {
    minHours *= 2.0;
    maxHours *= 2.5;
  }

  // Calculate the midpoint estimate
  const estimatedHours =
    Math.round(((minHours + maxHours) / 2) * 2) / 2; // Round to nearest 0.5

  // Determine confidence
  let confidence: "low" | "medium" | "high";
  if (matches.length >= 2 && input.taskDescription) {
    confidence = "high";
  } else if (matches.length >= 1) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Build reasoning
  const serviceLabel = input.serviceType
    ? SERVICE_LABELS[input.serviceType] || input.serviceType
    : null;

  const parts: string[] = [];
  parts.push(
    `Based on keyword analysis (${matchedLabels.join(", ")}), estimated ${minHours.toFixed(1)}-${maxHours.toFixed(1)} hours.`
  );
  if (serviceLabel && multiplier !== 1.0) {
    parts.push(
      `Adjusted by ${multiplier > 1 ? "+" : ""}${Math.round((multiplier - 1) * 100)}% for ${serviceLabel} context.`
    );
  }
  if (input.hasSubtasks) {
    parts.push("Scaled up as a parent task with subtasks (aggregate effort).");
  }

  // Build breakdown for tasks over 4 hours
  let breakdown: EstimateBreakdown[] | undefined;
  if (estimatedHours > 4) {
    breakdown = [
      {
        phase: "Setup & planning",
        hours: Math.round(estimatedHours * 0.15 * 2) / 2,
      },
      {
        phase: "Core execution",
        hours: Math.round(estimatedHours * 0.55 * 2) / 2,
      },
      {
        phase: "Review & revisions",
        hours: Math.round(estimatedHours * 0.2 * 2) / 2,
      },
      {
        phase: "Finalization & delivery",
        hours: Math.round(estimatedHours * 0.1 * 2) / 2,
      },
    ];

    // Adjust rounding errors so breakdown sums to estimatedHours
    const breakdownSum = breakdown.reduce((s, b) => s + b.hours, 0);
    if (breakdownSum !== estimatedHours) {
      breakdown[1].hours += estimatedHours - breakdownSum;
    }
  }

  return {
    estimatedHours,
    reasoning: parts.join(" "),
    confidence,
    ...(breakdown ? { breakdown } : {}),
  };
}
