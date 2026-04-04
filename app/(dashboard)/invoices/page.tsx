"use client";

import Link from "next/link";
import {
  Receipt, ArrowRight, FolderKanban, FileText, CheckCircle2,
  CreditCard, Zap,
} from "lucide-react";

const WORKFLOW_STEPS = [
  {
    icon: <FolderKanban className="w-5 h-5 text-indigo-500" />,
    title: "Create Project",
    desc: "Start with a client project",
    href: "/projects/new",
    bg: "bg-indigo-50",
  },
  {
    icon: <FileText className="w-5 h-5 text-amber-500" />,
    title: "Build Quotation",
    desc: "Add line items and pricing",
    href: "/quotations",
    bg: "bg-amber-50",
  },
  {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    title: "Client Approves",
    desc: "Quotation marked Approved",
    href: "/quotations",
    bg: "bg-emerald-50",
  },
  {
    icon: <Receipt className="w-5 h-5 text-purple-500" />,
    title: "Generate Invoice",
    desc: "One-click invoice from quotation",
    href: "#",
    bg: "bg-purple-50",
    soon: true,
  },
  {
    icon: <CreditCard className="w-5 h-5 text-blue-500" />,
    title: "Track Payment",
    desc: "Mark paid, send reminders",
    href: "#",
    bg: "bg-blue-50",
    soon: true,
  },
];

const UPCOMING_FEATURES = [
  "Convert approved quotation → invoice in one click",
  "Automatic invoice numbering (INV-2026-001)",
  "PDF export with your letterhead (configured in Settings)",
  "Send invoice via email directly from the platform",
  "Payment tracking — partial, full, overdue",
  "Tax calculations with GST/VAT support",
  "Recurring invoice schedule for retainer clients",
  "Payment reminders and overdue notifications",
];

export default function InvoicesPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-gray-400" />
              Invoices
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Invoice generation and payment tracking</p>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-200">
            <Zap className="w-3.5 h-3.5" />
            Coming Soon
          </span>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-auto">
        <div className="max-w-3xl mx-auto">

          {/* Hero */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Receipt className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Invoice Generation</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Full invoice management is coming soon. In the meantime, you can manage quotations
              and use them as billing references for your clients.
            </p>
          </div>

          {/* Workflow */}
          <div className="mb-10">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              How the workflow will work
            </h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={i} className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${step.bg} ${step.soon ? "opacity-50" : ""}`}>
                    {step.icon}
                  </div>
                  <div className="flex-1 sm:text-center">
                    <p className={`text-xs font-semibold ${step.soon ? "text-gray-400" : "text-gray-800"}`}>
                      {step.title}
                      {step.soon && <span className="ml-1.5 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">Soon</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">{step.desc}</p>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming features */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">What&apos;s coming</h3>
            <ul className="space-y-2.5">
              {UPCOMING_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/quotations"
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-500 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Manage Quotations
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/settings?tab=letterhead"
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Set Up Letterhead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
