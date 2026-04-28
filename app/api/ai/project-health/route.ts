import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// ── Types ──────────────────────────────────────────────────────────

interface ProjectHealthInput {
  projectName: string;
  type: "ONE_TIME" | "RETAINER";
  progress: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  budget: number | null;
  expensesTotal: number;
  startDate: string | null;
  endDate: string | null;
  daysElapsed: number;
  daysRemaining: number | null;
  teamSize: number;
  recentVelocity: number; // tasks completed in last 7 days
}

interface RiskFactor {
  factor: string;
  severity: "high" | "medium" | "low";
}

interface ProjectHealthResult {
  onTimeScore: number;
  budgetRisk: string;
  riskFactors: RiskFactor[];
  recommendations: string[];
  predictedCompletion: string | null;
  summary: string;
}

// ── POST /api/ai/project-health ────────────────────────────────────

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-project-health");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.light);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: ProjectHealthInput = await req.json();

    // Basic validation
    if (!body.projectName || body.totalTasks == null) {
      return NextResponse.json(
        { error: "projectName and totalTasks are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: rule-based prediction when no API key is configured
      const result = calculateFallback(body);
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
      // If AI response is unparseable, fall back to rule-based
      console.warn("[project-health] Could not parse AI response, using fallback");
      const result = calculateFallback(body);
      return NextResponse.json(result);
    }

    const parsed = JSON.parse(jsonMatch[0]) as ProjectHealthResult;

    // Clamp onTimeScore to 0-100
    parsed.onTimeScore = Math.max(0, Math.min(100, Math.round(parsed.onTimeScore)));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[POST /api/ai/project-health]", err);
    return NextResponse.json(
      { error: "Failed to analyze project health" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ─────────────────────────────────────────────────

function buildPrompt(input: ProjectHealthInput): string {
  const budgetLine =
    input.budget != null
      ? `Budget: ${input.budget}, Expenses so far: ${input.expensesTotal} (${((input.expensesTotal / input.budget) * 100).toFixed(1)}% used)`
      : "Budget: Not set";

  const timelineLine =
    input.startDate && input.endDate
      ? `Timeline: ${input.startDate} to ${input.endDate} (${input.daysElapsed} days elapsed, ${input.daysRemaining ?? "unknown"} days remaining)`
      : `Days elapsed: ${input.daysElapsed}, Days remaining: ${input.daysRemaining ?? "unknown"}`;

  const expectedProgressPct =
    input.daysRemaining != null && input.daysElapsed + input.daysRemaining > 0
      ? ((input.daysElapsed / (input.daysElapsed + input.daysRemaining)) * 100).toFixed(1)
      : "unknown";

  const taskCompletionPct =
    input.totalTasks > 0
      ? ((input.completedTasks / input.totalTasks) * 100).toFixed(1)
      : "0";

  return `You are a project management analytics engine for a creative agency. Analyze the following project metrics and provide a health assessment.

PROJECT DATA:
- Name: ${input.projectName}
- Type: ${input.type === "RETAINER" ? "Retainer (recurring)" : "One-time project"}
- Overall progress: ${input.progress}%
- Tasks: ${input.completedTasks}/${input.totalTasks} completed (${taskCompletionPct}%), ${input.overdueTasks} overdue, ${input.blockedTasks} blocked
- ${budgetLine}
- ${timelineLine}
- Expected progress by now: ${expectedProgressPct}%
- Team size: ${input.teamSize} member(s)
- Recent velocity: ${input.recentVelocity} tasks completed in the last 7 days
- Remaining tasks: ${input.totalTasks - input.completedTasks}

ANALYSIS INSTRUCTIONS:
1. Calculate the likelihood of on-time completion as a percentage (0-100).
2. Assess budget risk as one of: "on-track", "at-risk", or "over-budget".
3. Identify 2-3 specific risk factors with severity (high/medium/low).
4. Provide 2-3 actionable recommendations for the project manager.
5. Predict the completion date (ISO format YYYY-MM-DD) based on current velocity, or null if insufficient data.
6. Write a 1-2 sentence executive summary.

Consider:
- Progress vs time elapsed ratio (is the project behind schedule?)
- Task velocity trend (can remaining tasks be completed in time?)
- Overdue and blocked tasks as risk signals
- Budget burn rate relative to completion percentage
- Team capacity (remaining tasks per team member)

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "onTimeScore": <number 0-100>,
  "budgetRisk": "<on-track|at-risk|over-budget>",
  "riskFactors": [
    { "factor": "<description>", "severity": "<high|medium|low>" }
  ],
  "recommendations": ["<recommendation>"],
  "predictedCompletion": "<YYYY-MM-DD or null>",
  "summary": "<1-2 sentence summary>"
}`;
}

// ── Rule-based fallback ────────────────────────────────────────────

function calculateFallback(input: ProjectHealthInput): ProjectHealthResult {
  const {
    totalTasks,
    completedTasks,
    overdueTasks,
    blockedTasks,
    budget,
    expensesTotal,
    daysElapsed,
    daysRemaining,
    recentVelocity,
    teamSize,
    startDate,
    type,
  } = input;

  const remainingTasks = totalTasks - completedTasks;
  const totalDuration =
    daysRemaining != null ? daysElapsed + daysRemaining : null;

  // ── On-time score ──────────────────────────────────────────────
  let onTimeScore = 50; // default neutral

  if (totalDuration != null && totalDuration > 0) {
    const timeProgressPct = daysElapsed / totalDuration;
    const taskProgressPct = totalTasks > 0 ? completedTasks / totalTasks : 0;

    // Ratio of task progress to time progress (1.0 = on track)
    const progressRatio = timeProgressPct > 0 ? taskProgressPct / timeProgressPct : 1;

    // Base score from progress ratio (1.0 -> 80, 0.5 -> 40, 1.5 -> 100)
    onTimeScore = Math.round(Math.min(100, Math.max(0, progressRatio * 80)));

    // Velocity-based adjustment: can remaining tasks be done in time?
    if (recentVelocity > 0 && daysRemaining != null && daysRemaining > 0) {
      const weeksRemaining = daysRemaining / 7;
      const projectedCompletion = recentVelocity * weeksRemaining;
      const velocityRatio = remainingTasks > 0 ? projectedCompletion / remainingTasks : 2;

      if (velocityRatio >= 1.2) {
        onTimeScore = Math.min(100, onTimeScore + 15); // ahead of pace
      } else if (velocityRatio >= 0.8) {
        onTimeScore = Math.min(100, onTimeScore + 5); // roughly on pace
      } else if (velocityRatio < 0.5) {
        onTimeScore = Math.max(0, onTimeScore - 20); // significantly behind
      } else {
        onTimeScore = Math.max(0, onTimeScore - 10); // somewhat behind
      }
    }

    // Penalize for overdue and blocked tasks
    if (totalTasks > 0) {
      const overduePct = overdueTasks / totalTasks;
      const blockedPct = blockedTasks / totalTasks;
      onTimeScore = Math.max(0, onTimeScore - Math.round(overduePct * 30));
      onTimeScore = Math.max(0, onTimeScore - Math.round(blockedPct * 20));
    }
  } else {
    // No deadline: estimate from velocity and progress alone
    const taskProgressPct = totalTasks > 0 ? completedTasks / totalTasks : 0;
    onTimeScore = Math.round(taskProgressPct * 100);
  }

  onTimeScore = Math.max(0, Math.min(100, onTimeScore));

  // ── Budget risk ────────────────────────────────────────────────
  let budgetRisk = "on-track";

  if (budget != null && budget > 0) {
    const budgetUsedPct = expensesTotal / budget;
    const taskProgressPct = totalTasks > 0 ? completedTasks / totalTasks : 0;

    if (budgetUsedPct > 1) {
      budgetRisk = "over-budget";
    } else if (taskProgressPct > 0 && budgetUsedPct / taskProgressPct > 1.2) {
      // Spending faster than progress warrants
      budgetRisk = "at-risk";
    } else if (budgetUsedPct > 0.85 && taskProgressPct < 0.7) {
      budgetRisk = "at-risk";
    }
  }

  // ── Risk factors ───────────────────────────────────────────────
  const riskFactors: RiskFactor[] = [];

  // Overdue tasks
  if (overdueTasks > 0) {
    const overduePct = totalTasks > 0 ? overdueTasks / totalTasks : 0;
    riskFactors.push({
      factor: `${overdueTasks} task${overdueTasks > 1 ? "s" : ""} overdue (${(overduePct * 100).toFixed(0)}% of total)`,
      severity: overduePct > 0.2 ? "high" : overduePct > 0.1 ? "medium" : "low",
    });
  }

  // Blocked tasks
  if (blockedTasks > 0) {
    riskFactors.push({
      factor: `${blockedTasks} task${blockedTasks > 1 ? "s" : ""} currently blocked`,
      severity: blockedTasks >= 3 ? "high" : blockedTasks >= 2 ? "medium" : "low",
    });
  }

  // Low velocity
  if (recentVelocity === 0 && remainingTasks > 0) {
    riskFactors.push({
      factor: "Zero tasks completed in the last 7 days with work remaining",
      severity: "high",
    });
  } else if (
    recentVelocity > 0 &&
    daysRemaining != null &&
    daysRemaining > 0 &&
    remainingTasks > 0
  ) {
    const weeksRemaining = daysRemaining / 7;
    const projectedCompletion = recentVelocity * weeksRemaining;
    if (projectedCompletion < remainingTasks * 0.7) {
      riskFactors.push({
        factor: `Current velocity (${recentVelocity}/week) insufficient to complete ${remainingTasks} remaining tasks in time`,
        severity: "high",
      });
    }
  }

  // Budget burn rate
  if (budget != null && budget > 0) {
    const budgetUsedPct = expensesTotal / budget;
    const taskProgressPct = totalTasks > 0 ? completedTasks / totalTasks : 0;
    if (budgetUsedPct > 1) {
      riskFactors.push({
        factor: `Budget exceeded by ${((budgetUsedPct - 1) * 100).toFixed(0)}%`,
        severity: "high",
      });
    } else if (taskProgressPct > 0 && budgetUsedPct / taskProgressPct > 1.3) {
      riskFactors.push({
        factor: `Budget burn rate is ${((budgetUsedPct / taskProgressPct) * 100).toFixed(0)}% relative to progress`,
        severity: "medium",
      });
    }
  }

  // Team capacity
  if (teamSize > 0 && remainingTasks > 0) {
    const tasksPerMember = remainingTasks / teamSize;
    if (daysRemaining != null && daysRemaining > 0 && tasksPerMember / daysRemaining > 0.5) {
      riskFactors.push({
        factor: `High workload: ~${tasksPerMember.toFixed(0)} remaining tasks per team member`,
        severity: tasksPerMember > 20 ? "high" : "medium",
      });
    }
  }

  // Trim to 3 most severe
  riskFactors.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
  const topRisks = riskFactors.slice(0, 3);

  // ── Recommendations ────────────────────────────────────────────
  const recommendations: string[] = [];

  if (overdueTasks > 0) {
    recommendations.push(
      `Prioritize clearing ${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""} to unblock downstream work and restore schedule confidence.`
    );
  }

  if (blockedTasks > 0) {
    recommendations.push(
      `Resolve blockers on ${blockedTasks} task${blockedTasks > 1 ? "s" : ""} — consider a focused stand-up or escalation to remove dependencies.`
    );
  }

  if (recentVelocity === 0 && remainingTasks > 0) {
    recommendations.push(
      "Velocity has stalled. Review team assignments and identify bottlenecks to restart momentum."
    );
  } else if (
    recentVelocity > 0 &&
    daysRemaining != null &&
    daysRemaining > 0 &&
    remainingTasks > 0
  ) {
    const weeksRemaining = daysRemaining / 7;
    const needed = remainingTasks / weeksRemaining;
    if (needed > recentVelocity * 1.3) {
      recommendations.push(
        `Increase weekly throughput from ${recentVelocity} to ~${Math.ceil(needed)} tasks/week, or reduce scope to meet the deadline.`
      );
    }
  }

  if (budgetRisk === "at-risk" || budgetRisk === "over-budget") {
    recommendations.push(
      "Review upcoming expenses and consider deferring non-critical spend. Flag the budget situation to the client early."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Project is tracking well. Maintain current pace and continue regular check-ins with the team."
    );
  }

  // Trim to 3
  const topRecs = recommendations.slice(0, 3);

  // ── Predicted completion date ──────────────────────────────────
  let predictedCompletion: string | null = null;

  if (recentVelocity > 0 && remainingTasks > 0 && startDate) {
    const weeksNeeded = remainingTasks / recentVelocity;
    const daysNeeded = Math.ceil(weeksNeeded * 7);
    const predictedDate = new Date();
    predictedDate.setDate(predictedDate.getDate() + daysNeeded);
    predictedCompletion = predictedDate.toISOString().split("T")[0];
  } else if (remainingTasks === 0) {
    // Already done
    predictedCompletion = new Date().toISOString().split("T")[0];
  }

  // ── Summary ────────────────────────────────────────────────────
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  let summaryParts: string[] = [];

  if (onTimeScore >= 75) {
    summaryParts.push(
      `${input.projectName} is on track at ${taskPct}% task completion with a ${onTimeScore}% likelihood of on-time delivery.`
    );
  } else if (onTimeScore >= 40) {
    summaryParts.push(
      `${input.projectName} is at moderate risk with ${taskPct}% tasks completed and a ${onTimeScore}% on-time likelihood.`
    );
  } else {
    summaryParts.push(
      `${input.projectName} is at high risk — only ${taskPct}% of tasks completed with a ${onTimeScore}% chance of on-time delivery.`
    );
  }

  if (budgetRisk === "over-budget") {
    summaryParts.push("Budget has been exceeded.");
  } else if (budgetRisk === "at-risk") {
    summaryParts.push("Budget is trending toward overspend.");
  }

  const summary = summaryParts.join(" ");

  return {
    onTimeScore,
    budgetRisk,
    riskFactors: topRisks,
    recommendations: topRecs,
    predictedCompletion,
    summary,
  };
}
