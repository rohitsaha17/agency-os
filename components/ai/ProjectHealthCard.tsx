"use client";

import { useState, useEffect } from "react";
import {
  Sparkles, Shield, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, TrendingUp, Calendar, DollarSign,
  Clock, Target,
} from "lucide-react";

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
  recentVelocity: number;
}

interface HealthResult {
  onTimeScore: number;
  budgetRisk: string;
  riskFactors: { factor: string; severity: "high" | "medium" | "low" }[];
  recommendations: string[];
  predictedCompletion: string | null;
  summary: string;
}

const SEVERITY_COLORS = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-blue-50 text-blue-600 border-blue-200",
};

const BUDGET_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  "on-track": { color: "text-emerald-600", label: "On Track", icon: CheckCircle2 },
  "at-risk": { color: "text-amber-600", label: "At Risk", icon: AlertTriangle },
  "over-budget": { color: "text-red-600", label: "Over Budget", icon: AlertTriangle },
};

export function ProjectHealthCard({ data }: { data: ProjectHealthInput }) {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/project-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); setLoaded(true); }
  };

  useEffect(() => {
    if (!loaded && data.totalTasks > 0) fetchHealth();
  }, [loaded, data.totalTasks]);

  if (!loaded && !loading) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border border-indigo-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-900">AI Project Health Prediction</h3>
            {result && (
              <p className="text-[11px] text-gray-500">
                {result.onTimeScore}% on-time likelihood · Budget: {result.budgetRisk}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); setLoaded(false); fetchHealth(); }}
            className="p-1 hover:bg-white/60 rounded transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
              <span className="text-xs text-gray-500">Analyzing project health...</span>
            </div>
          ) : result ? (
            <div className="space-y-3">
              {/* Score metrics */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="w-3 h-3 text-indigo-500" />
                    <span className="text-[10px] text-gray-500 font-medium">On-Time</span>
                  </div>
                  <p className={`text-lg font-bold ${
                    result.onTimeScore >= 70 ? "text-emerald-600" :
                    result.onTimeScore >= 40 ? "text-amber-600" : "text-red-600"
                  }`}>{result.onTimeScore}%</p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3 h-3 text-indigo-500" />
                    <span className="text-[10px] text-gray-500 font-medium">Budget</span>
                  </div>
                  <p className={`text-sm font-bold ${BUDGET_CONFIG[result.budgetRisk]?.color || "text-gray-700"}`}>
                    {BUDGET_CONFIG[result.budgetRisk]?.label || result.budgetRisk}
                  </p>
                </div>
                {result.predictedCompletion && (
                  <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar className="w-3 h-3 text-indigo-500" />
                      <span className="text-[10px] text-gray-500 font-medium">Est. Completion</span>
                    </div>
                    <p className="text-sm font-bold text-gray-700">
                      {new Date(result.predictedCompletion).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                )}
              </div>

              {/* Summary */}
              <p className="text-xs text-gray-600 leading-relaxed">{result.summary}</p>

              {/* Risk factors */}
              {result.riskFactors.length > 0 && (
                <div className="space-y-1">
                  {result.riskFactors.map((rf, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${SEVERITY_COLORS[rf.severity]}`}>
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{rf.factor}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="space-y-1">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-indigo-700 bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
                      <TrendingUp className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
