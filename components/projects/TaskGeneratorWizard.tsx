"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronDown, Check, Loader2,
  Sparkles, Clock, AlertTriangle, Minus, Plus, Repeat, ListPlus,
  Trash2, Pencil, PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/* ── Service catalogue ─────────────────────────────────────────── */

const SERVICE_OPTIONS: { value: string; label: string; icon: string; description: string }[] = [
  { value: "website",          label: "Website Design & Dev",    icon: "🌐", description: "Design and develop a responsive website with modern UI, SEO-friendly structure, CMS integration, and cross-browser compatibility." },
  { value: "social_media",     label: "Social Media",            icon: "📱", description: "Manage social media presence across platforms — content calendar, post design, copywriting, scheduling, community engagement, and monthly analytics." },
  { value: "seo",              label: "SEO",                     icon: "🔍", description: "Improve organic search rankings through technical SEO audit, keyword research, on-page optimization, content strategy, and link building." },
  { value: "geo",              label: "GEO",                     icon: "🤖", description: "Optimize for AI-powered search engines and generative results — structured data, authoritative content, and entity optimization." },
  { value: "gmb",              label: "Google My Business",      icon: "📍", description: "Set up and optimize Google Business Profile — listing management, reviews strategy, local SEO, posts, and performance tracking." },
  { value: "branding",         label: "Branding & Identity",     icon: "🎨", description: "Create a complete brand identity — logo, color palette, typography, brand guidelines, collateral templates, and brand strategy." },
  { value: "logo",             label: "Logo Design",             icon: "✏️", description: "Design a distinctive logo with multiple concept directions, refinement rounds, and final deliverables in all required formats." },
  { value: "uiux",             label: "UI/UX Design",            icon: "🖥️", description: "User experience research, wireframing, high-fidelity UI design, interactive prototyping, usability testing, and developer handoff." },
  { value: "video",            label: "Video Production",        icon: "🎬", description: "End-to-end video production — scripting, storyboarding, shoot planning, filming, editing, color grading, and sound design." },
  { value: "photography",      label: "Photography",             icon: "📸", description: "Professional photography — shot planning, location scouting, shoot execution, photo selection, retouching, and final delivery." },
  { value: "content",          label: "Content Writing",         icon: "📝", description: "Content strategy and creation — blog articles, website copy, case studies, whitepapers, SEO-optimized writing, and editorial calendar." },
  { value: "email_marketing",  label: "Email Marketing",         icon: "📧", description: "Email campaign strategy — audience segmentation, template design, copywriting, automation flows, A/B testing, and performance tracking." },
  { value: "paid_ads",         label: "Paid Ads / PPC",          icon: "💰", description: "Paid advertising campaigns — audience targeting, ad creative design, copywriting, campaign setup, optimization, and ROI reporting." },
  { value: "app_development",  label: "App Development",         icon: "📲", description: "Mobile or web app development — requirements gathering, UX/UI design, frontend and backend development, testing, and deployment." },
  { value: "pr",               label: "PR & Communications",     icon: "📰", description: "Public relations — PR strategy, press release writing, media list building, journalist outreach, and coverage reporting." },
  { value: "print",            label: "Print Design",            icon: "🖨️", description: "Print collateral design — brochures, flyers, business cards, posters, packaging inserts, and print-ready file preparation." },
  { value: "packaging",        label: "Packaging Design",        icon: "📦", description: "Product packaging design — structural design, label design, dielines, mockups, and print-ready artwork with material specs." },
  { value: "motion_graphics",  label: "Motion Graphics",         icon: "🎞️", description: "Motion graphics and animation — concept development, storyboarding, 2D/3D animation, kinetic typography, and final rendering." },
  { value: "influencer",       label: "Influencer Marketing",    icon: "⭐", description: "Influencer campaign management — influencer research, outreach, negotiation, content briefs, campaign tracking, and reporting." },
  { value: "ecommerce",        label: "E-commerce",              icon: "🛒", description: "E-commerce store setup or optimization — platform configuration, product listings, payment integration, UX optimization, and analytics." },
];

/* ── Types ─────────────────────────────────────────────────────── */

interface GeneratedTask {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  estimatedHours: number | null;
  offsetDays: number;
  children: GeneratedTask[];
  _selected: boolean;
  _expanded: boolean;
}

interface WizardProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  projectType?: "ONE_TIME" | "RETAINER";
  projectServiceType?: string;
  projectDescription?: string;
  clientIndustry?: string;
  startDate?: string | null;
  onTasksCreated: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

/* ── Build combined description from selected services ─────────── */
function buildAutoDescription(services: string[], custom: string): string {
  if (services.length === 0) return custom;
  const descs = services
    .map((s) => SERVICE_OPTIONS.find((o) => o.value === s)?.description)
    .filter(Boolean);
  return descs.join("\n\n");
}

/* ── Component ─────────────────────────────────────────────────── */

export function TaskGeneratorWizard({
  open, onClose, projectId, projectName, projectType,
  projectServiceType, projectDescription, clientIndustry,
  startDate, onTasksCreated,
}: WizardProps) {

  /* Step 1 — form */
  const [selectedServices, setSelectedServices] = useState<string[]>(
    projectServiceType ? [projectServiceType] : []
  );
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [durationWeeks, setDurationWeeks] = useState(4);

  /* Retainer options */
  const isRetainer = projectType === "RETAINER";
  const [repeatMonths, setRepeatMonths] = useState(1);

  /* Step 2 — generated tasks */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [generating, setGenerating] = useState(false);
  const [tasks, setTasks] = useState<GeneratedTask[]>([]);
  const [error, setError] = useState("");

  /* Step 3 — applying */
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  /* ── Auto-fill description when services change ── */
  useEffect(() => {
    if (!descriptionEdited) {
      setDescription(buildAutoDescription(selectedServices, projectDescription || ""));
    }
  }, [selectedServices, descriptionEdited, projectDescription]);

  /* ── Handlers ─────────────────────────────── */

  const handleServiceClick = (val: string) => {
    if (allowMultiple) {
      setSelectedServices((prev) =>
        prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
      );
    } else {
      // single select — toggle or replace
      setSelectedServices((prev) =>
        prev.includes(val) ? [] : [val]
      );
    }
  };

  const handleMultipleToggle = () => {
    if (allowMultiple && selectedServices.length > 1) {
      // switching back to single: keep only the first selected
      setSelectedServices((prev) => prev.slice(0, 1));
    }
    setAllowMultiple((prev) => !prev);
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    setDescriptionEdited(true);
  };

  const handleGenerate = useCallback(async () => {
    if (selectedServices.length === 0) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/ai/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypes: selectedServices,
          description,
          durationWeeks,
          clientIndustry: clientIndustry || "",
          projectName: projectName || "Untitled Project",
          projectType: projectType || "ONE_TIME",
          repeatMonths: isRetainer ? repeatMonths : 1,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate tasks");
      const data = await res.json();
      const decorate = (list: GeneratedTask[]): GeneratedTask[] =>
        list.map((t) => ({
          ...t,
          _selected: true,
          _expanded: true,
          children: decorate(t.children || []),
        }));
      setTasks(decorate(data.tasks || []));
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [selectedServices, description, durationWeeks, clientIndustry, projectName, projectType, isRetainer, repeatMonths]);

  const toggleTask = (path: number[]) => {
    setTasks((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
      let target = clone as GeneratedTask[];
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children;
      const t = target[path[path.length - 1]];
      t._selected = !t._selected;
      const cascade = (items: GeneratedTask[], val: boolean) => {
        items.forEach((c) => { c._selected = val; cascade(c.children, val); });
      };
      cascade(t.children, t._selected);
      return clone;
    });
  };

  const toggleExpand = (path: number[]) => {
    setTasks((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
      let target = clone as GeneratedTask[];
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children;
      target[path[path.length - 1]]._expanded = !target[path[path.length - 1]]._expanded;
      return clone;
    });
  };

  /* ── Editing state ── */
  const [editingPath, setEditingPath] = useState<string | null>(null); // "0-1" format
  const [editField, setEditField] = useState<"title" | "description">("title");
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const PRIORITIES: GeneratedTask["priority"][] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  const getTaskAtPath = (list: GeneratedTask[], path: number[]): GeneratedTask => {
    let target: GeneratedTask[] = list;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children;
    return target[path[path.length - 1]];
  };

  const startEdit = (path: number[], field: "title" | "description") => {
    const t = getTaskAtPath(tasks, path);
    setEditingPath(path.join("-"));
    setEditField(field);
    setEditValue(field === "title" ? t.title : (t.description || ""));
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const commitEdit = () => {
    if (!editingPath) return;
    const path = editingPath.split("-").map(Number);
    setTasks((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
      let target: GeneratedTask[] = clone;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children;
      const t = target[path[path.length - 1]];
      if (editField === "title" && editValue.trim()) t.title = editValue.trim();
      else if (editField === "description") t.description = editValue.trim();
      return clone;
    });
    setEditingPath(null);
  };

  const cyclePriority = (path: number[]) => {
    setTasks((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
      let target: GeneratedTask[] = clone;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children;
      const t = target[path[path.length - 1]];
      const idx = PRIORITIES.indexOf(t.priority);
      t.priority = PRIORITIES[(idx + 1) % PRIORITIES.length];
      return clone;
    });
  };

  const deleteTask = (path: number[]) => {
    setTasks((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
      let target: GeneratedTask[] = clone;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children;
      target.splice(path[path.length - 1], 1);
      return clone;
    });
  };

  const addTask = (parentPath: number[] | null) => {
    const newTask: GeneratedTask = {
      title: "New task",
      description: "",
      priority: "MEDIUM",
      estimatedHours: null,
      offsetDays: 0,
      children: [],
      _selected: true,
      _expanded: true,
    };
    setTasks((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
      if (!parentPath || parentPath.length === 0) {
        clone.push(newTask);
      } else {
        let target: GeneratedTask[] = clone;
        for (let i = 0; i < parentPath.length - 1; i++) target = target[parentPath[i]].children;
        const parent = target[parentPath[parentPath.length - 1]];
        parent.children.push(newTask);
        parent._expanded = true;
      }
      return clone;
    });
  };

  const selectedCount = useCallback(() => {
    let count = 0;
    const walk = (list: GeneratedTask[]) => {
      list.forEach((t) => { if (t._selected) count++; walk(t.children); });
    };
    walk(tasks);
    return count;
  }, [tasks]);

  const handleApply = useCallback(async () => {
    setApplying(true);
    setAppliedCount(0);
    try {
      const baseDate = startDate ? new Date(startDate) : new Date();

      for (const task of tasks) {
        if (!task._selected) continue;
        const due = task.offsetDays
          ? new Date(baseDate.getTime() + task.offsetDays * 86400000).toISOString()
          : null;

        const res = await fetch(`/api/projects/${projectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            description: task.description,
            priority: task.priority,
            dueDate: due,
            estimatedHours: task.estimatedHours,
            status: "TODO",
          }),
        });
        const created = await res.json();
        setAppliedCount((c) => c + 1);

        // Create selected children
        for (const child of task.children) {
          if (!child._selected) continue;
          const childDue = child.offsetDays
            ? new Date(baseDate.getTime() + child.offsetDays * 86400000).toISOString()
            : null;
          await fetch(`/api/projects/${projectId}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: child.title,
              description: child.description,
              priority: child.priority,
              dueDate: childDue,
              estimatedHours: child.estimatedHours,
              parentId: created.id,
              status: "TODO",
            }),
          });
          setAppliedCount((c) => c + 1);
        }
      }

      setStep(3);
    } catch {
      setError("Failed to create some tasks");
    } finally {
      setApplying(false);
    }
  }, [tasks, projectId, startDate]);

  const handleDone = () => {
    onTasksCreated();
    onClose();
    setStep(1);
    setTasks([]);
    setError("");
    setAppliedCount(0);
  };

  /* ── Render helpers ───────────────────────── */

  const renderTaskTree = (list: GeneratedTask[], path: number[] = []) => (
    <div className={path.length > 0 ? "ml-6 border-l border-gray-200 pl-3" : ""}>
      {list.map((t, i) => {
        const currentPath = [...path, i];
        const pathKey = currentPath.join("-");
        const hasChildren = t.children.length > 0;
        const isEditingTitle = editingPath === pathKey && editField === "title";
        const isEditingDesc = editingPath === pathKey && editField === "description";
        const isTopLevel = path.length === 0;

        return (
          <div key={pathKey} className="mb-1 group/task">
            <div
              className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                t._selected ? "bg-white hover:bg-gray-50" : "bg-gray-50 opacity-50"
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={() => toggleTask(currentPath)}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  t._selected
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {t._selected && <Check className="w-3 h-3" />}
              </button>

              {/* Expand toggle */}
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(currentPath)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                >
                  {t._expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-4" />
              )}

              {/* Title & Description — editable */}
              <div className="flex-1 min-w-0">
                {isEditingTitle ? (
                  <input
                    ref={editRef as React.RefObject<HTMLInputElement>}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingPath(null); }}
                    className="w-full text-sm font-medium text-gray-900 bg-indigo-50 border border-indigo-300 rounded px-1.5 py-0.5 outline-none"
                  />
                ) : (
                  <p
                    onClick={() => startEdit(currentPath, "title")}
                    className={`text-sm font-medium cursor-text hover:bg-gray-100 rounded px-1 -mx-1 ${
                      t._selected ? "text-gray-900" : "text-gray-500 line-through"
                    }`}
                    title="Click to edit title"
                  >
                    {t.title}
                  </p>
                )}
                {isEditingDesc ? (
                  <input
                    ref={editRef as React.RefObject<HTMLInputElement>}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingPath(null); }}
                    placeholder="Add a description..."
                    className="w-full text-xs text-gray-600 bg-indigo-50 border border-indigo-300 rounded px-1.5 py-0.5 mt-0.5 outline-none"
                  />
                ) : (
                  <p
                    onClick={() => startEdit(currentPath, "description")}
                    className="text-xs text-gray-500 truncate cursor-text hover:bg-gray-100 rounded px-1 -mx-1"
                    title="Click to edit description"
                  >
                    {t.description || <span className="italic text-gray-400">Add description...</span>}
                  </p>
                )}
              </div>

              {/* Priority — click to cycle */}
              <button
                onClick={() => cyclePriority(currentPath)}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all ${PRIORITY_COLORS[t.priority]}`}
                title="Click to change priority"
              >
                {t.priority}
              </button>

              {/* Hours */}
              {t.estimatedHours ? (
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> {t.estimatedHours}h
                </span>
              ) : null}

              {/* Subtask count */}
              {hasChildren && (
                <span className="text-[10px] text-indigo-500 font-medium">
                  {t.children.length} sub
                </span>
              )}

              {/* Add subtask — green */}
              {isTopLevel && (
                <button
                  onClick={() => addTask(currentPath)}
                  className="opacity-0 group-hover/task:opacity-100 text-green-500 hover:text-green-700 transition-opacity"
                  title="Add subtask"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete — red */}
              <button
                onClick={() => deleteTask(currentPath)}
                className="opacity-0 group-hover/task:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                title="Remove task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Children */}
            {hasChildren && t._expanded && renderTaskTree(t.children, currentPath)}
          </div>
        );
      })}

      {/* Add task button at root level — green */}
      {path.length === 0 && (
        <button
          onClick={() => addTask(null)}
          className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 mt-2 px-2 py-1.5 rounded-lg hover:bg-green-50 border border-dashed border-green-300 transition-colors w-full"
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add task
        </button>
      )}
    </div>
  );

  /* ── Main render ──────────────────────────── */

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={
        step === 1 ? "AI Task Generator" :
        step === 2 ? "Review Generated Tasks" :
        "Tasks Created"
      }
      onClose={onClose}
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {/* ── Step 1: Configuration ──────────── */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Service type */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Service Type <span className="text-red-500">*</span>
                </label>
                <button
                  onClick={handleMultipleToggle}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    allowMultiple
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  {allowMultiple ? "Multiple services" : "Add multiple"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                {allowMultiple
                  ? "Select all service types for this project. Tasks will be generated for each."
                  : "Select the primary service type for this project."}
              </p>
              <div className="flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleServiceClick(s.value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      selectedServices.includes(s.value)
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700 ring-1 ring-indigo-200"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span>{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              {selectedServices.length > 0 && (
                <p className="text-xs text-indigo-600 mt-2">
                  {selectedServices.length} service{selectedServices.length > 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Description — auto-filled */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Project Description
                </label>
                {descriptionEdited && selectedServices.length > 0 && (
                  <button
                    onClick={() => {
                      setDescriptionEdited(false);
                      setDescription(buildAutoDescription(selectedServices, projectDescription || ""));
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Reset to auto
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                {descriptionEdited
                  ? "You've customized the description. The AI will use this context."
                  : "Auto-filled based on selected services. Edit to add specifics."}
              </p>
              <textarea
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                rows={4}
                placeholder="Select a service type above to auto-fill, or describe your project scope, goals, and deliverables..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estimated Duration
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDurationWeeks(Math.max(1, durationWeeks - 1))}
                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  <Minus className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <span className="text-sm font-semibold text-gray-900 min-w-[80px] text-center">
                  {durationWeeks} week{durationWeeks > 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setDurationWeeks(Math.min(52, durationWeeks + 1))}
                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Retainer: repeat months */}
            {isRetainer && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <Repeat className="w-4 h-4 text-amber-600" />
                  <label className="text-sm font-medium text-amber-900">
                    Retainer — Generate for multiple months
                  </label>
                </div>
                <p className="text-xs text-amber-700 mb-3">
                  This is a recurring project. Generate repeating monthly task sets so you can plan ahead.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRepeatMonths(Math.max(1, repeatMonths - 1))}
                    className="p-1.5 rounded-lg border border-amber-300 hover:bg-amber-100"
                  >
                    <Minus className="w-3.5 h-3.5 text-amber-600" />
                  </button>
                  <span className="text-sm font-semibold text-amber-900 min-w-[80px] text-center">
                    {repeatMonths} month{repeatMonths > 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => setRepeatMonths(Math.min(12, repeatMonths + 1))}
                    className="p-1.5 rounded-lg border border-amber-300 hover:bg-amber-100"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-600" />
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button
                disabled={selectedServices.length === 0 || generating}
                loading={generating}
                icon={<Sparkles className="w-3.5 h-3.5" />}
                onClick={handleGenerate}
              >
                {generating ? "Generating..." : "Generate Tasks"}
              </Button>
            </div>

            {generating && (
              <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-indigo-900">AI is generating tasks...</p>
                  <p className="text-xs text-indigo-600">
                    Analyzing {selectedServices.length} service type{selectedServices.length > 1 ? "s" : ""}
                    {isRetainer && repeatMonths > 1 ? ` for ${repeatMonths} months` : ""}
                    {" "}and creating a structured task breakdown.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Review & Edit ──────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{selectedCount()}</span> of{" "}
                <span className="font-semibold text-gray-900">{(() => { let c = 0; const w = (l: GeneratedTask[]) => { l.forEach((t) => { c++; w(t.children); }); }; w(tasks); return c; })()}</span>{" "}
                tasks selected
              </p>
              <button
                onClick={() => setStep(1)}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Back to settings
              </button>
            </div>

            {/* Quick actions bar */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setTasks((prev) => {
                  const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
                  const setAll = (list: GeneratedTask[], val: boolean) => { list.forEach((t) => { t._selected = val; setAll(t.children, val); }); };
                  setAll(clone, true);
                  return clone;
                })}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                Select all
              </button>
              <button
                onClick={() => setTasks((prev) => {
                  const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
                  const setAll = (list: GeneratedTask[], val: boolean) => { list.forEach((t) => { t._selected = val; setAll(t.children, val); }); };
                  setAll(clone, false);
                  return clone;
                })}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                Deselect all
              </button>
              <span className="w-px h-4 bg-gray-200" />
              <button
                onClick={() => setTasks((prev) => {
                  const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
                  const setExp = (list: GeneratedTask[], val: boolean) => { list.forEach((t) => { t._expanded = val; setExp(t.children, val); }); };
                  setExp(clone, true);
                  return clone;
                })}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                Expand all
              </button>
              <button
                onClick={() => setTasks((prev) => {
                  const clone = JSON.parse(JSON.stringify(prev)) as GeneratedTask[];
                  const setExp = (list: GeneratedTask[], val: boolean) => { list.forEach((t) => { t._expanded = val; setExp(t.children, val); }); };
                  setExp(clone, false);
                  return clone;
                })}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                Collapse all
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl p-3 max-h-[45vh] overflow-y-auto">
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No tasks generated.</p>
              ) : (
                renderTaskTree(tasks)
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button
                disabled={selectedCount() === 0 || applying}
                loading={applying}
                icon={<Check className="w-3.5 h-3.5" />}
                onClick={handleApply}
              >
                {applying ? `Creating (${appliedCount})...` : `Create ${selectedCount()} Tasks`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ───────────────────── */}
        {step === 3 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Tasks Created Successfully
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {appliedCount} task{appliedCount !== 1 ? "s" : ""} have been added to this project.
            </p>
            <Button onClick={handleDone}>Done</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
