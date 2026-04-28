"use client";

import { useState, useEffect } from "react";
import {
  Sparkles, Shield, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, TrendingUp, TrendingDown,
} from "lucide-react";

interface ClientHealthData {
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

interface HealthResult {
  score: number;
  riskLevel: "healthy" | "at-risk" | "critical";
  observations: string[];
  recommendations: string[];
  summary: string;
}

const RISK_CONFIG = {
  healthy: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    label: "Healthy",
    labelColor: "bg-emerald-100 text-emerald-700",
    barColor: "bg-emerald-500",
  },
  "at-risk": {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    label: "At Risk",
    labelColor: "bg-amber-100 text-amber-700",
    barColor: "bg-amber-500",
  },
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-500",
    label: "Critical",
    labelColor: "bg-red-100 text-red-700",
    barColor: "bg-red-500",
  },
};

export function ClientHealthCard({ data }: { data: ClientHealthData }) {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/client-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); setLoaded(true); }
  };

  useEffect(() => {
    if (!loaded) fetchHealth();
  }, [loaded]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        <span className="text-sm text-gray-500">Analyzing client health...</span>
      </div>
    );
  }

  if (!result) return null;

  const config = RISK_CONFIG[result.riskLevel] || RISK_CONFIG.healthy;
  const Icon = config.icon;

  return (
    <div className={`border rounded-xl overflow-hidden ${config.border}`}>
      <div className={`${config.bg} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/80 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">AI Health Score</h3>
            <p className="text-xs text-gray-500">Based on activity, projects & payments</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config.labelColor}`}>
            {config.label}
          </span>
          <button
            onClick={() => { setLoaded(false); fetchHealth(); }}
            className="p-1 hover:bg-white/50 rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="p-4 bg-white space-y-4">
        {/* Score bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">Health Score</span>
            <span className="text-lg font-bold text-gray-900">{result.score}/100</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
              style={{ width: `${result.score}%` }}
            />
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>

        {/* Observations */}
        {result.observations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Key Observations</p>
            <div className="space-y-1">
              {result.observations.map((obs, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <Icon className={`w-3 h-3 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                  <span>{obs}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {result.recommendations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Recommendations</p>
            <div className="space-y-1">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                  <TrendingUp className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
