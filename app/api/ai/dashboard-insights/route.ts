import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// ── Types ──────────────────────────────────────────────────────────

interface DashboardStats {
  activeProjects: number;
  overdueTasksCount: number;
  blockedTasksCount: number;
  completionRate: number;
  expensesThisMonth: number;
  pipelineValue: number;
  activeClients: number;
}

interface ProjectHealth {
  name: string;
  progress: number;
  overdueTasks: number;
  blockedTasks: number;
  totalTasks: number;
  budget: number | null;
  daysLeft: number | null;
}

interface UpcomingDeadline {
  title: string;
  dueDate: string;
  type: string;
}

interface DashboardPayload {
  stats: DashboardStats;
  projectHealth: ProjectHealth[];
  upcomingDeadlines: UpcomingDeadline[];
}

interface Insight {
  type: "warning" | "success" | "info" | "action";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

// ── POST /api/ai/dashboard-insights ────────────────────────────────

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-insights");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.light);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: DashboardPayload = await req.json();
    const { stats, projectHealth, upcomingDeadlines } = body;

    if (!stats) {
      return NextResponse.json(
        { error: "Missing required 'stats' field" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: rule-based insights when no API key is configured
      const insights = generateFallbackInsights(stats, projectHealth || [], upcomingDeadlines || []);
      return NextResponse.json({ insights });
    }

    const anthropic = new Anthropic({ apiKey });
    const prompt = buildPrompt(stats, projectHealth || [], upcomingDeadlines || []);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // If AI response is unparseable, fall back to rule-based
      const insights = generateFallbackInsights(stats, projectHealth || [], upcomingDeadlines || []);
      return NextResponse.json({ insights });
    }

    const insights: Insight[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ insights });
  } catch (err) {
    console.error("[POST /api/ai/dashboard-insights]", err);
    return NextResponse.json(
      { error: "Failed to generate dashboard insights" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ─────────────────────────────────────────────────

function buildPrompt(
  stats: DashboardStats,
  projectHealth: ProjectHealth[],
  upcomingDeadlines: UpcomingDeadline[],
): string {
  const atRiskProjects = projectHealth.filter(
    (p) => p.overdueTasks > 0 || p.blockedTasks > 0 || (p.daysLeft !== null && p.daysLeft < 7 && p.progress < 80)
  );

  const projectSummary = projectHealth.length > 0
    ? projectHealth
        .map(
          (p) =>
            `- ${p.name}: ${p.progress}% complete, ${p.overdueTasks} overdue, ${p.blockedTasks} blocked, ${p.totalTasks} total tasks${p.budget !== null ? `, budget $${p.budget}` : ""}${p.daysLeft !== null ? `, ${p.daysLeft} days left` : ""}`
        )
        .join("\n")
    : "No project data available.";

  const deadlineSummary = upcomingDeadlines.length > 0
    ? upcomingDeadlines
        .map((d) => `- ${d.title} (${d.type}) — due ${d.dueDate}`)
        .join("\n")
    : "No upcoming deadlines.";

  return `You are a senior agency operations analyst. Analyze the following agency dashboard data and generate 3-5 actionable insights.

DASHBOARD STATS:
- Active projects: ${stats.activeProjects}
- Active clients: ${stats.activeClients}
- Overdue tasks: ${stats.overdueTasksCount}
- Blocked tasks: ${stats.blockedTasksCount}
- Task completion rate: ${stats.completionRate}%
- Expenses this month: $${stats.expensesThisMonth.toLocaleString()}
- Revenue pipeline value: $${stats.pipelineValue.toLocaleString()}

PROJECT HEALTH:
${projectSummary}

AT-RISK PROJECTS: ${atRiskProjects.length} of ${projectHealth.length}

UPCOMING DEADLINES:
${deadlineSummary}

REQUIREMENTS:
1. Generate exactly 3-5 insights
2. Each insight must be actionable and specific — reference real numbers from the data
3. Categorize each insight by type: "warning" (problems), "success" (positive trends), "info" (neutral observations), "action" (recommended next steps)
4. Assign priority: "high" (needs immediate attention), "medium" (address this week), "low" (good to know)
5. Keep titles concise (under 60 characters) and descriptions to 1-2 sentences
6. Focus on patterns like: project risk, revenue pipeline health, workload distribution, deadline pressure, blocked work, completion velocity

Return ONLY a JSON array (no markdown, no explanation) in this exact format:
[
  {
    "type": "warning",
    "title": "3 projects at risk of missing deadlines",
    "description": "Based on current task velocity, Project X and Project Y have less than 7 days remaining with significant overdue work. Consider reallocating resources.",
    "priority": "high"
  }
]`;
}

// ── Fallback: rule-based insights (no API key needed) ──────────────

function generateFallbackInsights(
  stats: DashboardStats,
  projectHealth: ProjectHealth[],
  upcomingDeadlines: UpcomingDeadline[],
): Insight[] {
  const insights: Insight[] = [];

  // ── Overdue tasks warning ──
  if (stats.overdueTasksCount > 0) {
    const severity = stats.overdueTasksCount > 10 ? "high" : stats.overdueTasksCount > 3 ? "medium" : "low";
    insights.push({
      type: "warning",
      title: `${stats.overdueTasksCount} tasks are overdue`,
      description: `There are ${stats.overdueTasksCount} overdue tasks across your projects. Review and reprioritize to prevent further delays.`,
      priority: severity,
    });
  }

  // ── Blocked tasks warning ──
  if (stats.blockedTasksCount > 0) {
    insights.push({
      type: "action",
      title: `${stats.blockedTasksCount} tasks are blocked`,
      description: `Blocked tasks slow the entire pipeline. Identify and resolve blockers to keep projects moving forward.`,
      priority: stats.blockedTasksCount > 5 ? "high" : "medium",
    });
  }

  // ── At-risk projects ──
  const atRiskProjects = projectHealth.filter(
    (p) => p.overdueTasks > 0 || (p.daysLeft !== null && p.daysLeft < 7 && p.progress < 80)
  );
  if (atRiskProjects.length > 0) {
    const names = atRiskProjects.slice(0, 3).map((p) => p.name).join(", ");
    insights.push({
      type: "warning",
      title: `${atRiskProjects.length} project${atRiskProjects.length > 1 ? "s" : ""} at risk of delay`,
      description: `${names}${atRiskProjects.length > 3 ? ` and ${atRiskProjects.length - 3} more` : ""} may miss deadlines based on current progress and remaining time.`,
      priority: "high",
    });
  }

  // ── Pipeline value ──
  if (stats.pipelineValue > 0) {
    const pipelineFormatted = stats.pipelineValue >= 1000
      ? `$${(stats.pipelineValue / 1000).toFixed(stats.pipelineValue >= 10000 ? 0 : 1)}k`
      : `$${stats.pipelineValue}`;
    insights.push({
      type: stats.pipelineValue > stats.expensesThisMonth * 2 ? "success" : "info",
      title: `Revenue pipeline at ${pipelineFormatted}`,
      description: `Your active quotation pipeline is valued at ${pipelineFormatted}. Follow up on pending quotations to improve conversion.`,
      priority: "medium",
    });
  }

  // ── High completion rate ──
  if (stats.completionRate >= 80) {
    insights.push({
      type: "success",
      title: `Strong completion rate at ${stats.completionRate}%`,
      description: `Your team is maintaining a ${stats.completionRate}% task completion rate. Keep up the momentum.`,
      priority: "low",
    });
  } else if (stats.completionRate > 0 && stats.completionRate < 50) {
    insights.push({
      type: "warning",
      title: `Low completion rate at ${stats.completionRate}%`,
      description: `Task completion rate is below 50%. Review workload distribution and identify process bottlenecks.`,
      priority: "high",
    });
  }

  // ── Upcoming deadline pressure ──
  const urgentDeadlines = upcomingDeadlines.filter((d) => {
    const daysUntil = Math.ceil(
      (new Date(d.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil <= 3 && daysUntil >= 0;
  });
  if (urgentDeadlines.length > 0) {
    insights.push({
      type: "action",
      title: `${urgentDeadlines.length} deadline${urgentDeadlines.length > 1 ? "s" : ""} within 3 days`,
      description: `${urgentDeadlines.slice(0, 2).map((d) => d.title).join(", ")}${urgentDeadlines.length > 2 ? ` and ${urgentDeadlines.length - 2} more` : ""} are due very soon. Ensure final deliverables are on track.`,
      priority: "high",
    });
  }

  // ── Expenses tracking ──
  if (stats.expensesThisMonth > 0 && stats.pipelineValue > 0) {
    const ratio = stats.expensesThisMonth / stats.pipelineValue;
    if (ratio > 0.7) {
      insights.push({
        type: "warning",
        title: "Expenses are high relative to pipeline",
        description: `Monthly expenses ($${stats.expensesThisMonth.toLocaleString()}) are ${Math.round(ratio * 100)}% of your pipeline value. Monitor spending closely.`,
        priority: "medium",
      });
    }
  }

  // Ensure we return at least 3 insights
  if (insights.length < 3) {
    if (!insights.find((i) => i.title.includes("Active"))) {
      insights.push({
        type: "info",
        title: `${stats.activeProjects} active projects, ${stats.activeClients} clients`,
        description: `You are currently managing ${stats.activeProjects} projects across ${stats.activeClients} active clients.`,
        priority: "low",
      });
    }
    if (insights.length < 3 && stats.overdueTasksCount === 0 && stats.blockedTasksCount === 0) {
      insights.push({
        type: "success",
        title: "All tasks are on track",
        description: "No overdue or blocked tasks detected. Your projects are running smoothly.",
        priority: "low",
      });
    }
    if (insights.length < 3) {
      insights.push({
        type: "info",
        title: "Dashboard overview is up to date",
        description: "All metrics are current. Review individual projects for detailed status.",
        priority: "low",
      });
    }
  }

  // Cap at 5 insights, prioritize by severity
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return insights
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, 5);
}
