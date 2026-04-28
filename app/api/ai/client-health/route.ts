import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// ── Types ──────────────────────────────────────────────────────

interface ClientHealthInput {
  clientName: string;
  projectCount: number;
  activeProjects: number;
  completedProjects: number;
  totalRevenue: number;
  overdueTasksCount: number;
  avgProjectProgress: number;
  lastActivityDate: string | null;
  contractsActive: number;
  unpaidInvoices: number;
  expenseTotal: number;
  communicationFrequency: "high" | "medium" | "low" | "none";
}

interface ClientHealthResult {
  score: number;
  riskLevel: "healthy" | "at-risk" | "critical";
  observations: string[];
  recommendations: string[];
  summary: string;
}

// ── POST /api/ai/client-health ─────────────────────────────────
export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-client-health");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.light);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: ClientHealthInput = await req.json();

    if (!body.clientName?.trim()) {
      return NextResponse.json(
        { error: "clientName is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: rule-based scoring when no API key is configured
      const result = calculateFallbackHealth(body);
      return NextResponse.json(result);
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = buildPrompt(body);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON object from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If AI response can't be parsed, fall back to rule-based
      const result = calculateFallbackHealth(body);
      return NextResponse.json(result);
    }

    const parsed = JSON.parse(jsonMatch[0]) as ClientHealthResult;

    // Clamp score to 0-100
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[POST /api/ai/client-health]", err);
    return NextResponse.json(
      { error: "Failed to analyze client health" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(input: ClientHealthInput): string {
  const daysSinceActivity = input.lastActivityDate
    ? Math.floor(
        (Date.now() - new Date(input.lastActivityDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  return `You are an agency account health analyst. Analyze the following client data and produce a health assessment.

CLIENT DATA:
- Client name: ${input.clientName}
- Total projects: ${input.projectCount}
- Active projects: ${input.activeProjects}
- Completed projects: ${input.completedProjects}
- Total revenue: $${input.totalRevenue.toLocaleString()}
- Overdue tasks: ${input.overdueTasksCount}
- Average project progress: ${input.avgProjectProgress}%
- Last activity: ${daysSinceActivity !== null ? `${daysSinceActivity} days ago` : "No activity recorded"}
- Active contracts: ${input.contractsActive}
- Unpaid invoices: ${input.unpaidInvoices}
- Total expenses: $${input.expenseTotal.toLocaleString()}
- Communication frequency: ${input.communicationFrequency}

SCORING GUIDELINES:
- A healthy client has active projects, low overdue tasks, paid invoices, recent activity, and frequent communication.
- Risk factors: many overdue tasks, unpaid invoices, long gaps in activity, no active contracts, low communication.
- Consider the ratio of overdue tasks to active projects.
- Consider revenue vs expenses (profitability).
- Consider whether communication frequency matches the number of active projects.

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "score": <number 0-100>,
  "riskLevel": "<healthy | at-risk | critical>",
  "observations": ["<observation 1>", "<observation 2>", "<observation 3>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>"],
  "summary": "<1-2 sentence overall assessment>"
}

Rules for riskLevel:
- "healthy": score >= 70
- "at-risk": score >= 40 and < 70
- "critical": score < 40

Provide 2-4 observations and 1-2 recommendations. Be specific and actionable.`;
}

// ── Fallback: rule-based health calculator ──────────────────────

function calculateFallbackHealth(input: ClientHealthInput): ClientHealthResult {
  let score = 100;
  const observations: string[] = [];
  const recommendations: string[] = [];

  // ── Overdue tasks (subtract up to 25 points) ──
  if (input.overdueTasksCount > 0) {
    const penalty = Math.min(25, input.overdueTasksCount * 5);
    score -= penalty;
    observations.push(
      `${input.overdueTasksCount} overdue task${input.overdueTasksCount > 1 ? "s" : ""} requiring attention.`
    );
    if (input.overdueTasksCount >= 5) {
      recommendations.push(
        "Prioritize clearing the backlog of overdue tasks to restore project momentum."
      );
    }
  }

  // ── Unpaid invoices (subtract up to 20 points) ──
  if (input.unpaidInvoices > 0) {
    const penalty = Math.min(20, input.unpaidInvoices * 7);
    score -= penalty;
    observations.push(
      `${input.unpaidInvoices} unpaid invoice${input.unpaidInvoices > 1 ? "s" : ""} outstanding.`
    );
    recommendations.push(
      "Follow up on outstanding invoices to maintain healthy cash flow."
    );
  }

  // ── Last activity recency (subtract up to 20 points) ──
  if (input.lastActivityDate) {
    const daysSince = Math.floor(
      (Date.now() - new Date(input.lastActivityDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysSince > 30) {
      const penalty = Math.min(20, Math.floor((daysSince - 30) / 7) * 5);
      score -= penalty;
      observations.push(
        `No activity in the past ${daysSince} days, indicating a potential engagement drop.`
      );
      if (daysSince > 60) {
        recommendations.push(
          "Schedule a check-in call to re-engage the client and discuss upcoming needs."
        );
      }
    }
  } else {
    score -= 15;
    observations.push("No activity has been recorded for this client.");
    recommendations.push(
      "Initiate contact with the client to establish an active working relationship."
    );
  }

  // ── Communication frequency ──
  switch (input.communicationFrequency) {
    case "high":
      score += 5;
      break;
    case "medium":
      // no change
      break;
    case "low":
      score -= 10;
      observations.push(
        "Communication frequency is low, which may indicate disengagement."
      );
      break;
    case "none":
      score -= 15;
      observations.push(
        "No communication with the client, posing a significant relationship risk."
      );
      recommendations.push(
        "Establish a regular communication cadence with scheduled check-ins."
      );
      break;
  }

  // ── Active projects (reward engagement) ──
  if (input.activeProjects > 0) {
    const bonus = Math.min(10, input.activeProjects * 3);
    score += bonus;
  } else if (input.projectCount > 0) {
    score -= 10;
    observations.push(
      "No currently active projects despite a project history, suggesting the relationship may be cooling."
    );
  }

  // ── No active contracts ──
  if (input.contractsActive === 0 && input.activeProjects > 0) {
    score -= 10;
    observations.push(
      "Active projects exist without any active contracts in place."
    );
    recommendations.push(
      "Ensure contracts are in place for all ongoing work to protect both parties."
    );
  }

  // ── Profitability signal ──
  if (input.totalRevenue > 0 && input.expenseTotal > input.totalRevenue * 0.9) {
    score -= 10;
    observations.push(
      "Expenses are approaching or exceeding revenue, indicating low profitability."
    );
  }

  // ── Clamp to 0-100 ──
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Determine risk level ──
  const riskLevel: ClientHealthResult["riskLevel"] =
    score >= 70 ? "healthy" : score >= 40 ? "at-risk" : "critical";

  // ── Ensure we have at least 2 observations ──
  if (observations.length === 0) {
    observations.push(
      "Client relationship metrics are within healthy ranges.",
      "Active engagement and timely payments indicate a strong partnership."
    );
  } else if (observations.length === 1) {
    observations.push(
      input.completedProjects > 0
        ? `${input.completedProjects} project${input.completedProjects > 1 ? "s" : ""} successfully completed.`
        : "Monitoring ongoing project performance for trends."
    );
  }

  // ── Ensure at least 1 recommendation ──
  if (recommendations.length === 0) {
    recommendations.push(
      score >= 70
        ? "Continue current engagement cadence and explore upsell opportunities."
        : "Review project timelines and resource allocation to improve delivery."
    );
  }

  // ── Build summary ──
  const summaryMap: Record<ClientHealthResult["riskLevel"], string> = {
    healthy: `${input.clientName} is a healthy client relationship with a score of ${score}/100. The engagement shows positive indicators across key metrics.`,
    "at-risk": `${input.clientName} shows some concerning signals with a score of ${score}/100. Proactive attention is recommended to prevent further decline.`,
    critical: `${input.clientName} is in critical condition with a score of ${score}/100. Immediate intervention is needed to salvage the relationship.`,
  };

  return {
    score,
    riskLevel,
    observations: observations.slice(0, 4),
    recommendations: recommendations.slice(0, 2),
    summary: summaryMap[riskLevel],
  };
}
