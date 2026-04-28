"use client";

import { useState, useEffect } from "react";
import {
  Sparkles, AlertTriangle, CheckCircle2, Info, Zap,
  Loader2, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";

interface Insight {
  type: "warning" | "success" | "info" | "action";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface DashboardInsightsProps {
  stats: {
    activeProjects: number;
    overdueTasksCount: number;
    blockedTasksCount: number;
    completionRate: number;
    expensesThisMonth: number;
    pipelineValue: number;
    activeClients: number;
  };
  projectHealth: {
    name: string;
    progress: number;
    overdue: number;
    blocked: number;
    total: number;
    daysLeft: number | null;
    endDate: string | null;
  }[];
  upcomingDeadlines: {
    title: string;
    dueDate: string;
    type: string;
  }[];
}

const TYPE_CONFIG = {
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconColor: "text-amber-500",
    titleColor: "text-amber-900",
    textColor: "text-amber-700",
  },
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconColor: "text-emerald-500",
    titleColor: "text-emerald-900",
    textColor: "text-emerald-700",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconColor: "text-blue-500",
    titleColor: "text-blue-900",
    textColor: "text-blue-700",
  },
  action: {
    icon: Zap,
    bg: "bg-purple-50",
    border: "border-purple-200",
    iconColor: "text-purple-500",
    titleColor: "text-purple-900",
    textColor: "text-purple-700",
  },
};

export function DashboardInsights({ stats, projectHealth, upcomingDeadlines }: DashboardInsightsProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/dashboard-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stats,
          projectHealth: projectHealth.map((p) => ({
            name: p.name,
            progress: p.progress,
            overdueTasks: p.overdue,
            blockedTasks: p.blocked,
            totalTasks: p.total,
            budget: null,
            daysLeft: p.daysLeft,
          })),
          upcomingDeadlines: upcomingDeadlines.map((d) => ({
            title: d.title,
            dueDate: d.dueDate,
            type: d.type,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights ?? []);
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!loaded && stats.activeProjects > 0) {
      fetchInsights();
    }
  }, [loaded, stats.activeProjects]);

  if (!loaded && !loading) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">AI Insights</h2>
            <p className="text-xs text-gray-400">Powered by AI analysis of your workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loaded && (
            <button
              onClick={(e) => { e.stopPropagation(); setLoaded(false); fetchInsights(); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
              title="Refresh insights"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              <span className="text-sm text-gray-500">Analyzing your workspace...</span>
            </div>
          ) : insights.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-sm text-gray-400">
              No insights available right now
            </div>
          ) : (
            <div className="space-y-2.5">
              {insights.map((insight, i) => {
                const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.info;
                const Icon = config.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${config.bg} ${config.border}`}
                  >
                    <Icon className={`w-4 h-4 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${config.titleColor}`}>{insight.title}</p>
                      <p className={`text-xs mt-0.5 leading-relaxed ${config.textColor}`}>
                        {insight.description}
                      </p>
                    </div>
                    {insight.priority === "high" && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        HIGH
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
