"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Calendar as CalIcon, DollarSign, CheckSquare,
  LayoutGrid, List, Edit3, FileText, Sparkles,
  TrendingDown, Scroll, Clock, CheckCircle2, XCircle, Paperclip,
  Upload, Download, Image, Film, File as FileIcon, Grid3X3,
  MessageSquare, Receipt, Send, Hash, ExternalLink, Trash2, Users, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { TemplatePickerModal } from "@/components/projects/TemplatePickerModal";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { PlanTab } from "@/components/projects/PlanTab";
import { QuickInvoiceDialog } from "@/components/projects/QuickInvoiceDialog";
import { InvoiceDetailDialog } from "@/components/projects/InvoiceDetailDialog";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { DeliveryDialog } from "@/components/tasks/DeliveryDialog";
import type {
  Project, ProjectDeliverable, ProjectCycle, Task, TaskStatus, ProjectFormData,
  Expense, Contract, ExpenseCategory, ExpenseStatus,
  ContractType, ContractPartyType, AssetFile, MimeCategory,
  Channel, ChatMessage, Invoice, InvoiceStatus,
} from "@/types";
import { SERVICE_TYPES, RECURRING_FREQUENCIES } from "@/components/projects/ProjectForm";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { calcInvoiceTotal, calcInvoiceBalance } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { todayKey } from "@/lib/date-key";

type PageTab = "plan" | "tasks" | "files" | "expenses" | "contracts" | "chat" | "invoices" | "tax";
type ViewMode = "kanban" | "list";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileMimeIcon({ mimeType, className = "w-5 h-5" }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <Image className={`${className} text-violet-500`} />;
  if (mimeType.startsWith("video/")) return <Film className={`${className} text-pink-500`} />;
  if (mimeType === "application/pdf") return <FileText className={`${className} text-red-500`} />;
  return <FileIcon className={`${className} text-gray-400`} />;
}

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: "NDA",               label: "NDA" },
  { value: "SERVICE_AGREEMENT", label: "Service Agreement" },
  { value: "EMPLOYMENT",        label: "Employment Agreement" },
  { value: "FREELANCE",         label: "Freelance Contract" },
  { value: "PARTNERSHIP",       label: "Partnership Agreement" },
  { value: "OTHER",             label: "Other" },
];

const EMPTY_EXPENSE_FORM = {
  title: "", category: "OTHER" as ExpenseCategory,
  amount: "", currency: "USD", date: todayKey(),
  status: "PENDING" as ExpenseStatus, isReimbursable: false, notes: "",
};

const EMPTY_CONTRACT_FORM = {
  title: "", type: "NDA" as ContractType,
  startDate: "", endDate: "", value: "", currency: "USD", notes: "",
};

type PartyDraft = {
  partyType: ContractPartyType; clientId: string;
  userId: string; name: string; email: string;
};
const EMPTY_PARTY: PartyDraft = {
  partyType: "CLIENT", clientId: "", userId: "", name: "", email: "",
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SOFTWARE_TOOLS: "Software & Tools", FREELANCER_PAYMENT: "Freelancer Payment",
  VENDOR_PAYMENT: "Vendor Payment", STOCK_ASSETS: "Stock Assets",
  PRINTING: "Printing", TRAVEL: "Travel", ADVERTISING: "Advertising",
  OFFICE: "Office & Overhead", EQUIPMENT: "Equipment",
  COMMISSIONS: "Commissions", OTHER: "Other",
};

const EXPENSE_STATUS_COLORS: Record<ExpenseStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700", APPROVED: "bg-blue-50 text-blue-700",
  REJECTED: "bg-red-50 text-red-700", PAID: "bg-emerald-50 text-emerald-700",
};

function formatCurrency(amount: number, currency: string) {
  return formatMoney(amount, currency, { precision: 0 });
}

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...flattenTasks(t.children ?? [])]);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatBudget(budget: number | null, currency: string) {
  if (!budget) return null;
  return formatMoney(budget, currency, { precision: 0 });
}

function ProgressRing({ progress }: { progress: number }) {
  const r = 20, circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  const color = progress >= 75 ? "#10b981" : progress >= 40 ? "#6366f1" : "#d1d5db";
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-100 dark:text-slate-800" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text x="26" y="26" textAnchor="middle" dominantBaseline="middle"
        style={{ transform: "rotate(90deg)", transformOrigin: "26px 26px" }}
        fontSize="10" fontWeight="600" fill={color}
      >
        {progress}%
      </text>
    </svg>
  );
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { user: currentUser } = useCurrentUser();
  const canManageChannels = can(currentUser, "content.plan");
  // What the money side of a project looks like depends on who's looking.
  // Contracts, invoices and tax are the agency's commercial business — admin
  // and manager only. Planning is the SMM's. Everyone else gets the work.
  const seesMoney = can(currentUser, "financials.view");
  const canPlanProject = can(currentUser, "content.plan");
  const [pdfLoading, setPdfLoading] = useState(false);

  // v3: the API now returns the deal (deliverables) and the team alongside
  // the project. cycleAmount is absent entirely without financials.view.
  type ProjectWithDeal = Project & {
    progress: number;
    cycleAmount?: string | number | null;
    cycleStartDate?: string | null;
    cycleEndDate?: string | null;
    deliverables?: ProjectDeliverable[];
    members?: { userId: string; role: string; user: { id: string; name: string; avatarUrl: string | null } }[];
  };
  const [project, setProject] = useState<ProjectWithDeal | null>(null);
  // Mirrors the rule in PATCH /api/projects/[id]: admin and manager edit any
  // project, an SMM edits the ones they plan. Nobody else gets the button,
  // because for them it only ever opened onto a 403.
  const canEditProject =
    can(currentUser, "projects.manage") ||
    (project?.members ?? []).some((m) => m.userId === currentUser?.id && m.role === "SMM");
  // v3: the project's billing periods, and which one the page is showing.
  // Defaults to the cycle containing today so the page opens on "now".
  const [cycles, setCycles] = useState<ProjectCycle[]>([]);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [pageTab, setPageTab] = useState<PageTab>("plan");

  // v3: the planning task's notification deep-links to ?tab=plan, so honour
  // whichever tab the link names.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    const valid: PageTab[] = ["plan", "tasks", "files", "expenses", "contracts", "chat", "invoices", "tax"];
    if (requested && valid.includes(requested as PageTab)) setPageTab(requested as PageTab);
  }, []);

  // A tab that isn't theirs — whether from a stale deep-link or the default —
  // resolves to the first one that is, rather than rendering an empty shell.
  useEffect(() => {
    if (!currentUser) return;
    const denied =
      (!canPlanProject && pageTab === "plan") ||
      (!seesMoney && (pageTab === "contracts" || pageTab === "invoices" || pageTab === "tax"));
    if (denied) setPageTab("tasks");
  }, [currentUser, canPlanProject, seesMoney, pageTab]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<{ total: number; budget: number | null; remaining: number | null; reimbursable: number; currency: string } | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projectFiles, setProjectFiles] = useState<AssetFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);

  // Chat state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessagesLoading, setChatMessagesLoading] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [chatCompose, setChatCompose] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"PROJECT_INTERNAL" | "PROJECT_CLIENT" | "GENERAL">("PROJECT_INTERNAL");
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<string[]>([]);
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Invoices state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [openInvoice, setOpenInvoice] = useState<Invoice | null>(null);
  // Extras and complimentary items produced by closing a cycle, waiting to
  // land on an invoice.
  const [billables, setBillables] = useState<{
    ready: { id: string; label: string; kind: string; amount: string | number | null }[];
    needsPricing: { id: string; label: string }[];
    readyTotal: number;
    openInvoice: { id: string; invoiceNumber: string; status: string } | null;
  } | null>(null);
  const [addingBillables, setAddingBillables] = useState(false);

  // Tax state
  const [clientTaxData, setClientTaxData] = useState<{ taxRegistrations: { id: string; type: string; number: string; country: string }[]; billingCurrency: string; paymentTermDays: number } | null>(null);
  const [taxLoaded, setTaxLoaded] = useState(false);

  // Modals
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<{
    open: boolean; defaultStatus?: TaskStatus; parentTask?: Task | null;
  }>({ open: false });
  const [taskPanel, setTaskPanel] = useState<{ open: boolean; task?: Task }>({ open: false });
  // v2: delivery-proof dialog when completing from list/kanban
  const [deliveryFor, setDeliveryFor] = useState<{ id: string; title: string } | null>(null);

  // Inline expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [expenseSaving, setExpenseSaving] = useState(false);

  // Inline contract modal
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT_FORM);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractParties, setContractParties] = useState<PartyDraft[]>([{ ...EMPTY_PARTY }]);
  const [contractClients, setContractClients] = useState<{ id: string; name: string; companyName: string | null }[]>([]);
  const [contractUsers, setContractUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load project");
      setProject(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }, [id]);

  // v3: load the billing periods and open on the one containing today, so
  // the page lands on "now" rather than the start of the engagement.
  const fetchCycles = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/cycles`);
    if (!res.ok) return;
    const data: ProjectCycle[] = await res.json();
    setCycles(data);
    const now = Date.now();
    const current = data.findIndex(
      (c) => new Date(c.startDate).getTime() <= now && new Date(c.endDate).getTime() >= now,
    );
    setCycleIndex(current >= 0 ? current : Math.max(0, data.length - 1));
  }, [id]);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  const fetchExpenses = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/expenses`);
    if (res.ok) {
      const data = await res.json();
      setExpenses(data.expenses);
      setExpenseSummary(data.summary);
    }
  }, [id]);

  const fetchContracts = useCallback(async () => {
    const res = await fetch(`/api/contracts?projectId=${id}`);
    if (res.ok) setContracts(await res.json());
  }, [id]);

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/files?projectId=${id}`);
      if (res.ok) setProjectFiles(await res.json());
      setFilesLoaded(true);
    } finally { setFilesLoading(false); }
  }, [id]);

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/tasks`);
      if (res.ok) setTasks(await res.json());
    } catch { /* silently fail */ }
    finally { setTasksLoading(false); }
  }, [id]);

  const fetchChannels = useCallback(async () => {
    setChatLoading(true);
    try {
      const res = await fetch(`/api/channels?projectId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        setActiveChannel((prev) => {
          if (prev) {
            const updated = data.find((c: Channel) => c.id === prev.id);
            return updated ?? data[0] ?? null;
          }
          return data[0] ?? null;
        });
      }
      setChatLoaded(true);
    } finally { setChatLoading(false); }
  }, [id]);

  const fetchChatMessages = useCallback(async (channelId: string, silent = false) => {
    if (!silent) setChatMessagesLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/messages?limit=100`);
      if (res.ok) setChatMessages(await res.json());
    } finally { setChatMessagesLoading(false); }
  }, []);

  /** Put the closed cycle's extras onto the invoice that already exists. */
  const addBillablesToInvoice = useCallback(async () => {
    if (!billables?.openInvoice || billables.ready.length === 0) return;
    setAddingBillables(true);
    try {
      const res = await fetch(`/api/invoices/${billables.openInvoice.id}/add-billables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billableItemIds: billables.ready.map((b) => b.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Could not add them");
      toast.success(`Added ${data.added} item${data.added === 1 ? "" : "s"} to ${billables.openInvoice.invoiceNumber}`);
      fetchInvoices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add them");
    } finally {
      setAddingBillables(false);
    }
    // fetchInvoices is defined below; referencing it here is fine at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billables, toast]);

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await fetch(`/api/invoices?projectId=${id}`);
      if (res.ok) setInvoices(await res.json());
      const br = await fetch(`/api/projects/${id}/billables`).catch(() => null);
      if (br?.ok) setBillables(await br.json());
      setInvoicesLoaded(true);
    } finally { setInvoicesLoading(false); }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchTasks();
    fetchExpenses();
    fetchContracts();
  }, [fetchProject, fetchTasks, fetchExpenses, fetchContracts]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    // v2: completing a task (from list or kanban) goes through the
    // delivery-proof dialog instead of a bare status PATCH.
    if (status === "DONE") {
      const findTask = (list: Task[]): Task | undefined => {
        for (const t of list) {
          if (t.id === taskId) return t;
          const child = t.children ? findTask(t.children) : undefined;
          if (child) return child;
        }
      };
      const target = findTask(tasks);
      if (target && target.status !== "DONE") {
        setDeliveryFor({ id: taskId, title: target.title });
        return;
      }
    }
    const updateStatus = (list: Task[]): Task[] =>
      list.map((t) => ({ ...t, status: t.id === taskId ? status : t.status, children: t.children ? updateStatus(t.children) : [] }));
    setTasks((prev) => updateStatus(prev));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks(); fetchProject();
  };

  const handleTaskSaved = () => {
    setTaskModal({ open: false });
    fetchTasks(); fetchProject();
  };

  const handleTaskPanelUpdated = (updatedTask: Task) => {
    fetchTasks(); fetchProject();
    setTaskPanel((p) => ({ ...p, task: updatedTask }));
  };

  const handleTaskPanelDeleted = () => {
    setTaskPanel({ open: false });
    fetchTasks(); fetchProject();
  };

  const handleReorder = async (taskIds: string[]) => {
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds }),
    });
    fetchTasks();
  };


  const handleChatSend = async () => {
    if (!chatCompose.trim() || !activeChannel || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch(`/api/channels/${activeChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: chatCompose.trim() }),
      });
      if (res.ok) {
        setChatCompose("");
        fetchChatMessages(activeChannel.id, true);
      }
    } finally { setChatSending(false); }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !project) return;
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName.trim(),
          type: newChannelType,
          ...(newChannelType !== "GENERAL" ? { projectId: id } : {}),
          ...(newChannelMemberIds.length > 0 ? { memberIds: newChannelMemberIds } : {}),
        }),
      });
      if (res.ok) {
        setNewChannelName("");
        setNewChannelType("PROJECT_INTERNAL");
        setNewChannelMemberIds([]);
        setShowCreateChannel(false);
        setChatLoaded(false);
        fetchChannels();
      }
    } catch { /* ignore */ }
  };

  const handleDeleteChannel = async (channelId: string, channelName: string) => {
    const ok = await confirmDialog({
      title: "Delete channel?",
      message: `"${channelName}" and all its messages will be permanently deleted.`,
      confirmLabel: "Delete Channel",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Channel deleted");
      setChannels(prev => prev.filter(c => c.id !== channelId));
      if (activeChannel?.id === channelId) {
        setActiveChannel(channels.find(c => c.id !== channelId) ?? null);
      }
    } else {
      toast.error("Failed to delete channel");
    }
  };

  const handleDownloadPdf = async () => {
    if (!project) return;
    setPdfLoading(true);
    try {
      const [{ fetchSettings, openPrintPdf }, { buildProjectHtml }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/pdfTemplates"),
      ]);
      const settings = await fetchSettings();
      const html = buildProjectHtml({
        name:        project.name,
        status:      project.status,
        type:        project.type,
        description: project.description,
        budget:      project.budget != null ? Number(project.budget) : null,
        currency:    project.currency ?? "USD",
        startDate:   project.startDate,
        endDate:     project.endDate,
        progress:    project.progress,
        client:      project.client ?? null,
        tasks:       tasks.map((t) => ({
          title:    t.title,
          status:   t.status,
          priority: t.priority,
          dueDate:  t.dueDate,
          assignee: t.assignees?.[0]?.user ?? null,
        })),
      }, settings);
      await openPrintPdf(html);
    } finally {
      setPdfLoading(false);
    }
  };

  // Lazy-load files tab
  useEffect(() => {
    if (pageTab === "files" && !filesLoaded) fetchFiles();
  }, [pageTab, filesLoaded, fetchFiles]);

  // Lazy-load chat tab
  useEffect(() => {
    if (pageTab === "chat" && !chatLoaded) fetchChannels();
    if (pageTab === "chat" && teamUsers.length === 0) {
      fetch("/api/users").then(r => r.json()).then(d => setTeamUsers(Array.isArray(d) ? d : d.users ?? [])).catch(() => {});
    }
  }, [pageTab, chatLoaded, fetchChannels]);

  // Fetch messages when active channel changes
  useEffect(() => {
    if (activeChannel && pageTab === "chat") {
      setChatMessages([]);
      fetchChatMessages(activeChannel.id);
    }
  }, [activeChannel?.id, pageTab, fetchChatMessages]);

  // Poll for new chat messages every 4 seconds
  useEffect(() => {
    if (pageTab !== "chat" || !activeChannel) return;
    const interval = setInterval(() => fetchChatMessages(activeChannel.id, true), 4000);
    return () => clearInterval(interval);
  }, [pageTab, activeChannel?.id, fetchChatMessages]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Lazy-load invoices tab
  useEffect(() => {
    if (pageTab === "invoices" && !invoicesLoaded) fetchInvoices();
  }, [pageTab, invoicesLoaded, fetchInvoices]);

  // Lazy-load tax tab
  useEffect(() => {
    if (pageTab === "tax" && !taxLoaded && project?.client?.id) {
      fetch(`/api/clients/${project.client.id}`)
        .then(r => r.json())
        .then(d => {
          setClientTaxData({
            taxRegistrations: d.taxRegistrations ?? [],
            billingCurrency: d.billingCurrency ?? "USD",
            paymentTermDays: d.paymentTermDays ?? 30,
          });
          setTaxLoaded(true);
        })
        .catch(() => setTaxLoaded(true));
    }
  }, [pageTab, taxLoaded, project?.client?.id]);

  // Load parties data when contract modal opens
  useEffect(() => {
    if (contractModalOpen && contractClients.length === 0) {
      Promise.all([
        fetch("/api/clients").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
      ]).then(([c, u]) => {
        setContractClients(Array.isArray(c) ? c : c.clients ?? []);
        setContractUsers(Array.isArray(u) ? u : []);
      });
    }
  }, [contractModalOpen]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseSaving(true);
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...expenseForm, projectId: id }),
    });
    setExpenseSaving(false);
    if (res.ok) {
      setExpenseModalOpen(false);
      setExpenseForm(EMPTY_EXPENSE_FORM);
      fetchExpenses();
      fetchProject();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error?.message || "Failed to add expense");
    }
  };

  const updateContractParty = (i: number, k: string, v: string) => {
    setContractParties((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      const updated = { ...p, [k]: v };
      if (k === "clientId" && v) {
        const c = contractClients.find((c) => c.id === v);
        if (c) updated.name = c.companyName || c.name;
      }
      if (k === "userId" && v) {
        const u = contractUsers.find((u) => u.id === v);
        if (u) { updated.name = u.name; updated.email = u.email; }
      }
      if (k === "partyType") {
        updated.clientId = ""; updated.userId = "";
        updated.name = ""; updated.email = "";
      }
      return updated;
    }));
  };

  const handleAddContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractForm.title.trim()) { setContractError("Title is required"); return; }
    if (contractParties.some((p) => !p.name.trim())) { setContractError("All parties need a name"); return; }
    setContractSaving(true); setContractError(null);
    const res = await fetch("/api/contracts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...contractForm, projectId: id, parties: contractParties }),
    });
    setContractSaving(false);
    if (res.ok) {
      setContractModalOpen(false);
      setContractForm(EMPTY_CONTRACT_FORM);
      setContractParties([{ ...EMPTY_PARTY }]);
      fetchContracts();
    }
  };

  const allFlat = flattenTasks(tasks);
  const taskCounts = {
    total: allFlat.length,
    done: allFlat.filter((t) => t.status === "DONE").length,
    inProgress: allFlat.filter((t) => t.status === "IN_PROGRESS").length,
  };


  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-3" />
          <div className="h-7 bg-gray-200 rounded w-72" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-sm text-gray-500">{error ?? "Project not found"}</p>
        <Link href="/projects" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        {/* Back, then the trail. The breadcrumb says where you are; this says
            how to leave, and matches the client page. */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/projects" className="hover:text-gray-800 transition-colors">Projects</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          {project.client && (
            <>
              <Link href={`/clients/${project.client.id}`} className="hover:text-gray-800 transition-colors">
                {project.client.name}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
            </>
          )}
          <span className="text-gray-900 font-medium truncate">{project.name}</span>
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <ProgressRing progress={project.progress} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900" title={project.name}>{project.name}</h1>
                <StatusBadge status={project.status} />
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  project.type === "RETAINER"
                    ? "bg-purple-50 text-purple-700 ring-1 ring-purple-200"
                    : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                }`}>
                  {project.type === "RETAINER"
                    ? `Retainer${project.recurringFrequency ? ` · ${RECURRING_FREQUENCIES.find(f => f.value === project.recurringFrequency)?.label ?? project.recurringFrequency}` : ""}`
                    : "One-Time"}
                </span>
                {project.serviceType && (() => {
                  const svc = SERVICE_TYPES.find((s) => s.value === project.serviceType);
                  const label = svc ? svc.label : project.serviceType;
                  return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      {label}
                    </span>
                  );
                })()}
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 line-clamp-1">{project.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary" size="sm"
              icon={pdfLoading ? undefined : <Download className="w-3.5 h-3.5" />}
              loading={pdfLoading}
              onClick={handleDownloadPdf}
            >
              {pdfLoading ? "Generating…" : "PDF"}
            </Button>
            {canEditProject && (
              <Button variant="secondary" size="sm" icon={<Edit3 className="w-3.5 h-3.5" />} onClick={() => setEditProjectOpen(true)}>
                Edit
              </Button>
            )}
            {/* Work on a project is created by whoever plans it. An editor
                keeps their own to-dos in Tasks > My Tasks, not here. */}
            {canPlanProject && (
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setTaskModal({ open: true })}>
                Add Task
              </Button>
            )}
          </div>
        </div>

        {/* Meta bar */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5 font-medium text-gray-600">
            {project.type === "RETAINER" ? "Retainer" : "One-time"}
          </span>
          {/* v3: the period the deal runs for */}
          {(project.cycleStartDate ?? project.startDate) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {formatDate(project.cycleStartDate ?? project.startDate)}
              {" → "}
              {project.cycleEndDate ?? project.endDate
                ? formatDate(project.cycleEndDate ?? project.endDate)
                : <span className="text-gray-400">open-ended</span>}
            </span>
          )}
          {/* v3: the amount — absent entirely for anyone without financials.view */}
          {project.cycleAmount != null && (
            <span className="flex items-center gap-1.5 font-medium text-gray-700">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" />
              {formatBudget(Number(project.cycleAmount), project.currency)}
              <span className="font-normal text-gray-400">
                {project.type === "RETAINER" ? "per cycle" : "total"}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-gray-400" />
            {taskCounts.done}/{taskCounts.total} done
            {taskCounts.inProgress > 0 && ` · ${taskCounts.inProgress} in progress`}
          </span>
        </div>

        {/* v3: the deal at a glance — what's owed, and who's on it */}
        {((project.deliverables?.length ?? 0) > 0 || (project.members?.length ?? 0) > 0) && (
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {(project.deliverables ?? []).map((d) => (
              <span key={d.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-700">
                {d.creativeType.icon && <span>{d.creativeType.icon}</span>}
                <span className="font-semibold">{d.qtyPerCycle}</span>
                {d.creativeType.name}
                {d.qtyPerCycle !== 1 ? "s" : ""}
              </span>
            ))}
            {(project.members ?? []).filter((m) => m.role === "SMM").length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="text-gray-400">SMM</span>
                <span className="flex -space-x-1.5">
                  {(project.members ?? []).filter((m) => m.role === "SMM").map((m) => (
                    <span key={m.userId} title={m.user.name}
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                      {m.user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                  ))}
                </span>
              </span>
            )}

            {/* v3: which cycle we're looking at. Phase 3's Plan tab reads
                this selection, so switching here changes what's planned. */}
            {cycles.length > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-auto">
                <button
                  onClick={() => setCycleIndex((i) => Math.max(0, i - 1))}
                  disabled={cycleIndex <= 0}
                  title="Previous cycle"
                  className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-gray-700 min-w-[72px] text-center">
                  {cycles[cycleIndex]?.label}
                  {cycles[cycleIndex]?.status === "CLOSED" && (
                    <span className="block text-[10px] font-normal text-gray-400 leading-none">closed</span>
                  )}
                </span>
                <button
                  onClick={() => setCycleIndex((i) => Math.min(cycles.length - 1, i + 1))}
                  disabled={cycleIndex >= cycles.length - 1}
                  title="Next cycle"
                  className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Page tabs */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8">
        <div className="overflow-x-auto -mb-px">
        <div className="flex items-center gap-1 whitespace-nowrap">
          {([
            // v3: Plan is the FIRST tab — it's where the work is created
            ...(canPlanProject ? [{ id: "plan", label: "Plan", icon: <CalIcon className="w-3.5 h-3.5" /> }] : []),
            { id: "tasks", label: canPlanProject ? "Tasks" : "My Tasks", icon: <CheckSquare className="w-3.5 h-3.5" /> },
            { id: "files", label: `Files${projectFiles.length > 0 ? ` (${projectFiles.length})` : ""}`, icon: <Paperclip className="w-3.5 h-3.5" /> },
            { id: "expenses", label: `Expenses${expenses.length > 0 ? ` (${expenses.length})` : ""}`, icon: <TrendingDown className="w-3.5 h-3.5" /> },
            ...(seesMoney ? [{ id: "contracts", label: `Contracts${contracts.length > 0 ? ` (${contracts.length})` : ""}`, icon: <Scroll className="w-3.5 h-3.5" /> }] : []),
            { id: "chat", label: `Chat${channels.length > 0 ? ` (${channels.length})` : ""}`, icon: <MessageSquare className="w-3.5 h-3.5" /> },
            ...(seesMoney ? [
              { id: "invoices", label: `Invoices${invoices.length > 0 ? ` (${invoices.length})` : ""}`, icon: <Receipt className="w-3.5 h-3.5" /> },
              { id: "tax", label: "Tax & Billing", icon: <DollarSign className="w-3.5 h-3.5" /> },
            ] : []),
          ] as { id: PageTab; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              key={tab.id} onClick={() => setPageTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                pageTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {/* ── TASKS TAB ── */}
        {pageTab === "plan" && <PlanTab projectId={id} />}

        {pageTab === "tasks" && (<>
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(["list", "kanban"] as ViewMode[]).map((v) => (
              <button
                key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === v ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {v === "kanban" ? <><LayoutGrid className="w-3.5 h-3.5" /> Kanban</> : <><List className="w-3.5 h-3.5" /> List</>}
              </button>
            ))}
          </div>
          {canPlanProject && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={() => setTemplatePickerOpen(true)}
            >
              Generate Tasks
            </Button>
          )}
        </div>


        {tasksLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : view === "kanban" ? (
          <TaskBoard
            tasks={tasks}
            onOpen={(task) => setTaskPanel({ open: true, task })}
            onStatusChange={handleStatusChange}
            onAddTask={canPlanProject ? (status) => setTaskModal({ open: true, defaultStatus: status }) : undefined}
            onAddSubtask={canPlanProject ? (parent) => setTaskModal({ open: true, parentTask: parent }) : undefined}
            onReorder={handleReorder}
          />
        ) : (
          <TaskList
            tasks={tasks}
            onOpen={(task) => setTaskPanel({ open: true, task })}
            onStatusChange={handleStatusChange}
            onAddTask={canPlanProject ? () => setTaskModal({ open: true }) : undefined}
            onAddSubtask={canPlanProject ? (parent) => setTaskModal({ open: true, parentTask: parent }) : undefined}
            onReorder={handleReorder}
          />
        )}
        </>)}

        {/* ── FILES TAB ── */}
        {pageTab === "files" && (
          <div>
            {/* Upload zone */}
            <div className="mb-5">
              <label className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                fileUploading ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
              }`}>
                <input type="file" multiple className="hidden" disabled={fileUploading} onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  e.target.value = "";
                  setFileUploading(true);
                  try {
                    for (const f of files) {
                      const fd = new FormData();
                      fd.append("file", f);
                      fd.append("projectId", id);
                      await fetch("/api/files", { method: "POST", body: fd });
                    }
                    fetchFiles();
                  } finally { setFileUploading(false); }
                }} />
                <Upload className={`w-7 h-7 mb-2 ${fileUploading ? "text-indigo-400 animate-bounce" : "text-gray-400"}`} />
                <p className="text-sm font-medium text-gray-600">
                  {fileUploading ? "Uploading…" : "Drop files or click to upload"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Any file type supported</p>
              </label>
            </div>

            {filesLoading ? (
              <div className="space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="flex gap-3 p-3 border border-gray-100 rounded-xl animate-pulse">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-gray-200 rounded w-1/2" />
                      <div className="h-3 bg-gray-200 rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : projectFiles.length === 0 ? (
              <div className="text-center py-10">
                <Paperclip className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No files yet for this project</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <FileMimeIcon mimeType={file.mimeType} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatFileSize(file.size)}
                        {file.task && <span className="ml-2 text-indigo-500">→ {file.task.title}</span>}
                        {(file._count?.versions ?? 0) > 0 && (
                          <span className="ml-2 font-medium text-indigo-500">v{(file._count?.versions ?? 0) + 1}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        file.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" :
                        file.status === "IN_REVIEW" ? "bg-amber-50 text-amber-700" :
                        file.status === "CHANGES_REQUIRED" ? "bg-red-50 text-red-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {file.status.replace("_", " ")}
                      </span>
                      <label
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Upload new version"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <input type="file" className="hidden" onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const fd = new FormData();
                          fd.append("file", f);
                          const res = await fetch(`/api/files/${file.id}/versions`, { method: "POST", body: fd });
                          if (res.ok) fetchFiles();
                          e.target.value = "";
                        }} />
                      </label>
                      {file.url && (
                        <a href={file.url} download={file.name}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download" onClick={(e) => e.stopPropagation()}>
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EXPENSES TAB ── */}
        {pageTab === "expenses" && (
          <div>
            {/* Budget vs Actual */}
            {expenseSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total Spent", value: formatCurrency(expenseSummary.total, expenseSummary.currency), sub: "all expenses", color: "text-gray-900" },
                  { label: "Budget", value: expenseSummary.budget ? formatCurrency(expenseSummary.budget, expenseSummary.currency) : "—", sub: "project budget", color: "text-gray-900" },
                  { label: "Remaining", value: expenseSummary.remaining != null ? formatCurrency(expenseSummary.remaining, expenseSummary.currency) : "—", sub: "left in budget", color: expenseSummary.remaining != null && expenseSummary.remaining < 0 ? "text-red-600" : "text-emerald-600" },
                  { label: "Reimbursable", value: formatCurrency(expenseSummary.reimbursable, expenseSummary.currency), sub: "to bill client", color: "text-indigo-600" },
                ].map((s) => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                    <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400">{s.sub}</p>
                  </div>
                ))}
              </div>
            )}

            {expenseSummary?.budget && expenseSummary.total > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                  <span className="text-xs font-medium text-gray-600">Budget Used</span>
                  <span className="text-xs text-gray-500">{Math.round((expenseSummary.total / expenseSummary.budget) * 100)}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      expenseSummary.total > expenseSummary.budget ? "bg-red-400" :
                      expenseSummary.total / expenseSummary.budget > 0.8 ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.min((expenseSummary.total / expenseSummary.budget) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Expenses</h3>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setExpenseModalOpen(true)}
              >
                Add Expense
              </Button>
            </div>

            {expenses.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <TrendingDown className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-1">No expenses yet</p>
                <p className="text-xs text-gray-400">Track costs like tools, freelancers, printing, and more</p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Title</th>
                      <th className="text-left px-5 py-3">Category</th>
                                            <th className="text-left px-5 py-3">Date</th>
                      <th className="text-right px-5 py-3">Amount</th>
                      <th className="text-center px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{exp.title}</p>
                          {exp.isReimbursable && <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">Reimbursable</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500">{CATEGORY_LABELS[exp.category]}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(exp.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          {formatCurrency(Number(exp.amount), exp.currency)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EXPENSE_STATUS_COLORS[exp.status]}`}>
                            {exp.status.charAt(0) + exp.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── CONTRACTS TAB ── */}
        {pageTab === "contracts" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Contracts & NDAs</h3>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setContractModalOpen(true)}
              >
                New Contract
              </Button>
            </div>

            {contracts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <Scroll className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-1">No contracts yet</p>
                <p className="text-xs text-gray-400">Attach NDAs and agreements to this project</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contracts.map((contract) => {
                  const signedCount = contract.parties.filter((p) => p.signedAt).length;
                  const statusColors: Record<string, string> = {
                    FULLY_SIGNED: "bg-emerald-50 text-emerald-700",
                    PARTIALLY_SIGNED: "bg-amber-50 text-amber-700",
                    DRAFT: "bg-gray-100 text-gray-600",
                    SENT: "bg-blue-50 text-blue-700",
                    EXPIRED: "bg-orange-50 text-orange-700",
                    TERMINATED: "bg-red-50 text-red-700",
                  };
                  return (
                    <Link key={contract.id} href={`/contracts/${contract.id}`}>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-indigo-200 transition-all flex flex-wrap items-center justify-between gap-y-2 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Scroll className="w-4 h-4 text-gray-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{contract.title}</p>
                            <p className="text-xs text-gray-400">
                              {contract.type.replace("_", " ")} · {new Date(contract.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-gray-500">{signedCount}/{contract.parties.length} signed</span>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[contract.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {contract.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {pageTab === "chat" && (
          <div className="flex flex-col h-[calc(100vh-320px)]">
            {chatLoading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-24" />
                      <div className="h-3 bg-gray-200 rounded w-64" />
                    </div>
                  </div>
                ))}
              </div>
            ) : channels.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center py-16">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 mb-1">No channels for this project yet</p>
                <p className="text-xs text-gray-400 mb-4">Create a channel to start collaborating</p>

                {!canManageChannels ? null : !showCreateChannel ? (
                  <button
                    onClick={() => setShowCreateChannel(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> New Channel
                  </button>
                ) : (
                  <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-4 text-left space-y-3">
                    <input
                      type="text"
                      placeholder="Channel name..."
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      {([
                        { value: "PROJECT_INTERNAL", label: "Team Only", active: "bg-indigo-50 border-indigo-300 text-indigo-700" },
                        { value: "PROJECT_CLIENT", label: "With Client", active: "bg-emerald-50 border-emerald-300 text-emerald-700" },
                        { value: "GENERAL", label: "General", active: "bg-gray-200 border-gray-400 text-gray-800" },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setNewChannelType(opt.value)}
                          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            newChannelType === opt.value ? opt.active : "border-gray-200 text-gray-600"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {/* Member selection */}
                    {teamUsers.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Add members (optional)</p>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                          {teamUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => setNewChannelMemberIds(prev =>
                                prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                              )}
                              className={`px-2 py-1 text-[11px] rounded-full border transition-colors ${
                                newChannelMemberIds.includes(u.id)
                                  ? "bg-indigo-100 border-indigo-300 text-indigo-700"
                                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              {u.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setShowCreateChannel(false)} className="flex-1 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateChannel}
                        disabled={!newChannelName.trim()}
                        className="flex-1 px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Channel selector + New Channel button */}
                <div className="flex items-center gap-2 mb-4">
                  {channels.length > 1 && (
                    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
                      {channels.map((ch) => (
                        <button
                          key={ch.id}
                          onClick={() => setActiveChannel(ch)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            activeChannel?.id === ch.id
                              ? "bg-indigo-600 text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <Hash className="w-3 h-3" />
                          {ch.name}
                          {ch._count?.messages != null && (
                            <span className={`text-[10px] ${activeChannel?.id === ch.id ? "text-indigo-200" : "text-gray-400"}`}>
                              ({ch._count.messages})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {channels.length === 1 && activeChannel && (
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-900">{activeChannel.name}</span>
                      {activeChannel.description && (
                        <span className="text-xs text-gray-400 ml-2">{activeChannel.description}</span>
                      )}
                    </div>
                  )}

                  {canManageChannels && activeChannel && (
                    <button
                      onClick={() => handleDeleteChannel(activeChannel.id, activeChannel.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete channel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canManageChannels && (
                    <button
                      onClick={() => setShowCreateChannel(!showCreateChannel)}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Channel
                    </button>
                  )}
                </div>

                {/* Inline channel creation */}
                {showCreateChannel && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        placeholder="Channel name..."
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        className="flex-1 min-w-[150px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                      />
                      <Select
                        value={newChannelType}
                        onChange={(v) => setNewChannelType(v as "PROJECT_INTERNAL" | "PROJECT_CLIENT" | "GENERAL")}
                        options={[{ value: "PROJECT_INTERNAL", label: "Team Only" }, { value: "PROJECT_CLIENT", label: "With Client" }, { value: "GENERAL", label: "General" }]}
                        size="sm"
                      />
                      <button onClick={handleCreateChannel} disabled={!newChannelName.trim()} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        Create
                      </button>
                      <button onClick={() => setShowCreateChannel(false)} className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                        Cancel
                      </button>
                    </div>
                    {teamUsers.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[11px] text-gray-500 mr-1">Members:</span>
                        {teamUsers.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setNewChannelMemberIds(prev =>
                              prev.includes(u.id) ? prev.filter(uid => uid !== u.id) : [...prev, u.id]
                            )}
                            className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                              newChannelMemberIds.includes(u.id)
                                ? "bg-indigo-100 border-indigo-300 text-indigo-700"
                                : "border-gray-200 text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}


                {/* Message feed */}
                <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl min-h-0">
                  {chatMessagesLoading && chatMessages.length === 0 ? (
                    <div className="space-y-3 p-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-3 animate-pulse">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-gray-100 rounded w-24" />
                            <div className="h-3 bg-gray-100 rounded w-48" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Hash className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        Welcome to #{activeChannel?.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {activeChannel?.description || "Send a message to start the conversation."}
                      </p>
                    </div>
                  ) : (
                    <div className="py-3 px-4 space-y-0.5">
                      {chatMessages.map((msg, i) => {
                        const prev = chatMessages[i - 1];
                        const sameAuthor = prev && prev.authorId === msg.authorId && prev.authorName === msg.authorName;
                        const within5min = prev && new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
                        const showAvatar = !sameAuthor || !within5min;

                        // Date divider
                        let showDivider: string | undefined;
                        if (!prev) {
                          showDivider = new Date(msg.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                        } else {
                          const prevDate = new Date(prev.createdAt).toDateString();
                          const curDate = new Date(msg.createdAt).toDateString();
                          if (prevDate !== curDate) {
                            const d = new Date(msg.createdAt);
                            const now = new Date();
                            showDivider = d.toDateString() === now.toDateString() ? "Today"
                              : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                          }
                        }

                        return (
                          <div key={msg.id}>
                            {showDivider && (
                              <div className="flex items-center gap-3 py-3">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-[10px] font-medium text-gray-400 px-2">{showDivider}</span>
                                <div className="flex-1 h-px bg-gray-200" />
                              </div>
                            )}
                            <div className={`flex gap-2.5 group py-1 hover:bg-gray-50 rounded-lg transition-colors ${showAvatar ? "mt-2" : "mt-0"}`}>
                              <div className="w-8 flex-shrink-0 mt-0.5">
                                {showAvatar && (
                                  msg.author?.avatarUrl ? (
                                    <img src={msg.author.avatarUrl} alt={msg.authorName} className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                      {msg.authorName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                                    </div>
                                  )
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                {showAvatar && (
                                  <div className="flex items-baseline gap-2 mb-0.5">
                                    <span className="text-sm font-semibold text-gray-900">{msg.authorName}</span>
                                    <span className="text-[10px] text-gray-400">
                                      {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                )}
                                {msg.deletedAt ? (
                                  <p className="text-sm text-gray-400 italic">This message was deleted</p>
                                ) : (
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={chatBottomRef} className="h-2" />
                    </div>
                  )}
                </div>

                {/* Compose box */}
                {activeChannel && (
                  <div className="mt-3">
                    <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                      <textarea
                        value={chatCompose}
                        onChange={(e) => setChatCompose(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleChatSend();
                          }
                        }}
                        placeholder={`Message #${activeChannel.name}`}
                        rows={1}
                        className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none max-h-32 overflow-y-auto py-1"
                        style={{ fieldSizing: "content" } as React.CSSProperties}
                        disabled={chatSending}
                      />
                      <button
                        onClick={handleChatSend}
                        disabled={!chatCompose.trim() || chatSending}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 ${
                          chatCompose.trim() && !chatSending
                            ? "bg-indigo-600 text-white hover:bg-indigo-500"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {chatSending ? (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 px-1">
                      Enter to send · Shift+Enter for new line
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── INVOICES TAB ── */}
        {pageTab === "invoices" && (
          <div>
            {/* Invoice summary cards */}
            {invoices.length > 0 && (() => {
              // Paid is what was RECEIVED, not what is flagged PAID. Counting
              // only fully-settled invoices reported an advance as nothing
              // collected and left the whole cycle fee outstanding.
              const live = invoices.filter((inv) => inv.status !== "CANCELLED");
              const totalInvoiced = live.reduce(
                (sum, inv) => sum + calcInvoiceTotal(inv.lineItems, {
                  discountRate: inv.discountPct, taxRate: inv.taxPct,
                }).total,
                0,
              );
              const totalPaid = live.reduce(
                (sum, inv) => sum + (inv.receipts ?? []).reduce((s, r) => s + Number(r.amount), 0),
                0,
              );
              const outstanding = Math.max(0, totalInvoiced - totalPaid);
              const currency = invoices[0]?.currency ?? project?.currency ?? "USD";

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "Total Invoiced", value: formatCurrency(totalInvoiced, currency), color: "text-gray-900" },
                    { label: "Total Paid", value: formatCurrency(totalPaid, currency), color: "text-emerald-600" },
                    { label: "Outstanding", value: formatCurrency(outstanding, currency), color: outstanding > 0 ? "text-amber-600" : "text-gray-900" },
                  ].map((s) => (
                    <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                      <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Work from a closed cycle that hasn't been billed. Said here,
                where the cycle was closed, rather than only in the invoice
                builder on another screen. */}
            {billables && (billables.ready.length > 0 || billables.needsPricing.length > 0) && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-900">
                      {billables.ready.length > 0
                        ? `${billables.ready.length} item${billables.ready.length === 1 ? "" : "s"} from a closed cycle, worth ${formatCurrency(billables.readyTotal, project?.currency ?? "INR")}, not yet billed`
                        : `${billables.needsPricing.length} item${billables.needsPricing.length === 1 ? "" : "s"} from a closed cycle still need pricing`}
                    </p>
                    {billables.ready.length > 0 && (
                      <p className="text-xs text-amber-700 mt-0.5 truncate">
                        {billables.ready.map((b) => b.label).join(" · ")}
                      </p>
                    )}
                    {billables.ready.length > 0 && billables.needsPricing.length > 0 && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        {billables.needsPricing.length} more still need a price before they can go on.
                      </p>
                    )}
                  </div>
                  {billables.ready.length > 0 && (
                    billables.openInvoice ? (
                      <Button
                        size="sm"
                        onClick={addBillablesToInvoice}
                        loading={addingBillables}
                      >
                        Add to {billables.openInvoice.invoiceNumber}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setInvoiceDialogOpen(true)}>
                        Raise an invoice
                      </Button>
                    )
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Invoices</h3>
              <Button size="sm" onClick={() => setInvoiceDialogOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>
                New Invoice
              </Button>
            </div>

            {invoicesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-1">No invoices yet</p>
                <p className="text-xs text-gray-400 mb-4">
                  Bill this project for the cycle, up front or at the end
                </p>
                <Button size="sm" onClick={() => setInvoiceDialogOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>
                  New Invoice
                </Button>
              </div>
            ) : (
              <>
              {/* Phones get cards. Seven columns on a 375px screen is either a
                  horizontal scroll nobody discovers or a squeeze where every
                  figure truncates — and these are the figures you came for. */}
              <div className="sm:hidden space-y-2">
                {invoices.map((inv) => {
                  const { total } = calcInvoiceTotal(inv.lineItems, {
                    discountRate: inv.discountPct, taxRate: inv.taxPct,
                  });
                  const bal = calcInvoiceBalance(total, inv.receipts ?? []);
                  const partial = bal.state === "partial" && inv.status !== "CANCELLED";
                  return (
                    <button
                      key={inv.id}
                      onClick={() => setOpenInvoice(inv)}
                      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{inv.invoiceNumber}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {inv.dueDate ? `Due ${formatDate(inv.dueDate)}` : "No due date"}
                          </p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                          partial ? "bg-amber-50 text-amber-700" : (
                            inv.status === "PAID" ? "bg-emerald-50 text-emerald-700" :
                            inv.status === "OVERDUE" ? "bg-red-50 text-red-700" :
                            inv.status === "SENT" ? "bg-blue-50 text-blue-700" :
                            "bg-gray-100 text-gray-600"
                          )
                        }`}>
                          {partial ? "Part paid" : inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs text-gray-400">Amount</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(total, inv.currency)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">{bal.balance > 0 ? "Balance" : "Status"}</p>
                          <p className={`font-semibold ${bal.balance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {bal.balance > 0 ? formatCurrency(bal.balance, inv.currency) : "Settled"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:block overflow-x-auto bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Invoice #</th>
                      <th className="text-left px-5 py-3">Status</th>
                      <th className="text-left px-5 py-3">Due Date</th>
                      <th className="text-right px-5 py-3">Amount</th>
                      <th className="text-right px-5 py-3">Paid</th>
                      <th className="text-right px-5 py-3">Balance</th>
                      <th className="text-center px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices.map((inv) => {
                      const { total } = calcInvoiceTotal(inv.lineItems, {
                        discountRate: inv.discountPct, taxRate: inv.taxPct,
                      });
                      const bal = calcInvoiceBalance(total, inv.receipts ?? []);
                      const statusColors: Record<InvoiceStatus, string> = {
                        DRAFT: "bg-gray-100 text-gray-600",
                        SENT: "bg-blue-50 text-blue-700",
                        PAID: "bg-emerald-50 text-emerald-700",
                        OVERDUE: "bg-red-50 text-red-700",
                        CANCELLED: "bg-slate-100 text-slate-500",
                      };
                      return (
                        <tr
                          key={inv.id}
                          onClick={() => setOpenInvoice(inv)}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{inv.invoiceNumber}</p>
                          </td>
                          <td className="px-5 py-3">
                            {/* A part-paid invoice is still SENT in the enum. Saying
                                "Sent" when half the money is in tells the reader
                                less than the receipts already know. */}
                            {bal.state === "partial" && inv.status !== "CANCELLED" ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                Part paid
                              </span>
                            ) : (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[inv.status]}`}>
                                {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                            {inv.dueDate ? formatDate(inv.dueDate) : "No due date"}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">
                            {formatCurrency(total, inv.currency)}
                          </td>
                          <td className="px-5 py-3 text-right text-emerald-600">
                            {bal.paid > 0 ? formatCurrency(bal.paid, inv.currency) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={`px-5 py-3 text-right font-medium ${bal.balance > 0 ? "text-amber-600" : "text-gray-300"}`}>
                            {bal.balance > 0 ? formatCurrency(bal.balance, inv.currency) : "Settled"}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {/* Opens here. It used to link to /invoices — the
                                whole list, unfiltered, where you had to find
                                this same invoice again by number. */}
                            <span className="text-xs text-indigo-600 font-medium">View</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* ── TAX & BILLING TAB ── */}
        {pageTab === "tax" && (
          <div className="max-w-2xl">
            {!project?.client ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No client linked to this project.</p>
                <p className="text-xs text-gray-400 mt-1">Link a client to view tax & billing information.</p>
              </div>
            ) : !taxLoaded ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <div key={i} className="bg-white border border-gray-200 rounded-xl h-20 animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Client reference */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Client</p>
                    <p className="text-sm font-semibold text-gray-900">{project.client.name}</p>
                  </div>
                  <Link href={`/clients/${project.client.id}`} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                    View Client <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Billing info */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-400" /> Billing Settings
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Currency</p>
                      <p className="text-sm font-medium text-gray-900">{clientTaxData?.billingCurrency || project.currency || "USD"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Payment Terms</p>
                      <p className="text-sm font-medium text-gray-900">{clientTaxData?.paymentTermDays ?? 30} days</p>
                    </div>
                  </div>
                </div>

                {/* Tax Registrations */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-400" /> Tax Registrations
                  </h3>
                  {clientTaxData?.taxRegistrations && clientTaxData.taxRegistrations.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-1">
                        {["Type", "Number", "Country / Region"].map((h) => (
                          <p key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</p>
                        ))}
                      </div>
                      {clientTaxData.taxRegistrations.map((tax) => (
                        <div key={tax.id} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-gray-50 rounded-xl px-4 py-3 items-center">
                          <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded w-fit">{tax.type}</span>
                          <span className="text-sm font-mono text-gray-800">{tax.number}</span>
                          <span className="text-sm text-gray-600">{tax.country}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                      <p className="text-sm text-gray-400">No tax registrations.</p>
                      <Link href={`/clients/${project.client.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                        Add from Client page <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Project Modal */}
      {editProjectOpen && (
        <Modal open={editProjectOpen} title="Edit Project" onClose={() => setEditProjectOpen(false)} width="max-w-2xl">
          <ProjectForm
            projectId={id}
            initialData={{
              clientId: project.clientId,
              name: project.name,
              description: project.description ?? "",
              type: project.type,
              serviceType: project.serviceType ?? "",
              recurringFrequency: project.recurringFrequency ?? "",
              status: project.status,
              startDate: project.startDate ? project.startDate.slice(0, 10) : "",
              endDate: project.endDate ? project.endDate.slice(0, 10) : "",
              budget: project.budget?.toString() ?? "",
              currency: project.currency,
            } as ProjectFormData}
            onSuccess={() => { setEditProjectOpen(false); fetchProject(); }}
          />
        </Modal>
      )}

      {/* Template Picker — Generate Tasks */}
      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        projectId={id}
        projectType={project?.type as "ONE_TIME" | "RETAINER" | undefined}
        startDate={project?.startDate}
        onApplied={fetchTasks}
      />

      {/* An invoice opens where you found it */}
      <InvoiceDetailDialog
        invoice={openInvoice}
        onClose={() => setOpenInvoice(null)}
        onChanged={() => { setOpenInvoice(null); fetchInvoices(); }}
      />

      {/* Raise an invoice without leaving the project */}
      {project && (
        <QuickInvoiceDialog
          open={invoiceDialogOpen}
          onClose={() => setInvoiceDialogOpen(false)}
          onCreated={fetchInvoices}
          project={{
            id: project.id,
            name: project.name,
            clientId: project.clientId,
            currency: project.currency,
            cycleAmount: project.cycleAmount,
            cycleStartDate: project.cycleStartDate,
            cycleEndDate: project.cycleEndDate,
            serviceType: project.serviceType,
            deliverables: project.deliverables,
          }}
        />
      )}

      {/* Task Create Modal */}
      {taskModal.open && (
        <TaskModal
          projectId={id}
          defaultStatus={taskModal.defaultStatus}
          parentTask={taskModal.parentTask}
          allTasks={flattenTasks(tasks)}
          onClose={() => setTaskModal({ open: false })}
          onSaved={handleTaskSaved}
        />
      )}

      {/* Task Detail Panel */}
      {taskPanel.open && taskPanel.task && (
        <TaskPanel
          task={taskPanel.task}
          allTasks={flattenTasks(tasks)}
          projectId={id}
          onClose={() => setTaskPanel({ open: false })}
          onUpdated={handleTaskPanelUpdated}
          onDeleted={handleTaskPanelDeleted}
        />
      )}

      {/* v2: delivery proof when completing from list/kanban */}
      {deliveryFor && (
        <DeliveryDialog
          taskId={deliveryFor.id}
          taskTitle={deliveryFor.title}
          onClose={() => setDeliveryFor(null)}
          onCompleted={() => { setDeliveryFor(null); fetchTasks(); fetchProject(); }}
        />
      )}

      {/* ── Inline Expense Modal ── */}
      <Modal open={expenseModalOpen} title="Add Expense" onClose={() => { setExpenseModalOpen(false); setExpenseForm(EMPTY_EXPENSE_FORM); }}>
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
            <input value={expenseForm.title} onChange={(e) => setExpenseForm((f) => ({ ...f, title: e.target.value }))} required
              placeholder="e.g. Stock photos, Freelancer fee"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount *</label>
              <input value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} required type="number" step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <Select
                value={expenseForm.currency}
                onChange={(v) => setExpenseForm((f) => ({ ...f, currency: v }))}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <Select
                value={expenseForm.category}
                onChange={(v) => setExpenseForm((f) => ({ ...f, category: v as ExpenseCategory }))}
                options={(Object.entries(CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([v, l]) => ({ value: v, label: l }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <Select
                value={expenseForm.status}
                onChange={(v) => setExpenseForm((f) => ({ ...f, status: v as ExpenseStatus }))}
                options={(["PENDING", "APPROVED", "PAID"] as ExpenseStatus[]).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={expenseForm.notes} onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={expenseForm.isReimbursable}
              onChange={(e) => setExpenseForm((f) => ({ ...f, isReimbursable: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span className="text-sm text-gray-700">Reimbursable — bill this back to client</span>
          </label>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => { setExpenseModalOpen(false); setExpenseForm(EMPTY_EXPENSE_FORM); }}>Cancel</Button>
            <Button type="submit" loading={expenseSaving}>Add Expense</Button>
          </div>
        </form>
      </Modal>

      {/* ── Inline Contract Modal ── */}
      <Modal open={contractModalOpen} title="New Contract / NDA" onClose={() => { setContractModalOpen(false); setContractForm(EMPTY_CONTRACT_FORM); setContractParties([{ ...EMPTY_PARTY }]); }} width="max-w-2xl">
        <form onSubmit={handleAddContract} className="space-y-5">
          {contractError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{contractError}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
            <input value={contractForm.title} onChange={(e) => setContractForm((f) => ({ ...f, title: e.target.value }))} required
              placeholder="e.g. NDA with Rahul Verma"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Contract Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {CONTRACT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setContractForm((f) => ({ ...f, type: t.value }))}
                  className={`py-2 px-3 rounded-lg border-2 text-xs font-medium transition-colors ${
                    contractForm.type === t.value ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input type="date" value={contractForm.startDate} onChange={(e) => setContractForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input type="date" value={contractForm.endDate} onChange={(e) => setContractForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contract Value</label>
              <input type="number" step="0.01" value={contractForm.value} onChange={(e) => setContractForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="0.00 (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <Select
                value={contractForm.currency}
                onChange={(v) => setContractForm((f) => ({ ...f, currency: v }))}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          {/* Signing Parties */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
              <label className="text-xs font-medium text-gray-500">Signing Parties</label>
              <button type="button" onClick={() => setContractParties((p) => [...p, { ...EMPTY_PARTY }])}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="w-3 h-3" /> Add Party
              </button>
            </div>
            <div className="space-y-3">
              {contractParties.map((party, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50 dark:bg-slate-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Party {i + 1}</span>
                    {contractParties.length > 1 && (
                      <button type="button" onClick={() => setContractParties((p) => p.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 mb-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 p-0.5 w-fit">
                    {(["CLIENT", "STAKEHOLDER", "USER"] as ContractPartyType[]).map((t) => (
                      <button key={t} type="button" onClick={() => updateContractParty(i, "partyType", t)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          party.partyType === t ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {t === "USER" ? "Internal" : t.charAt(0) + t.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {party.partyType === "CLIENT" && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Client</label>
                        <Select
                          value={party.clientId}
                          onChange={(v) => updateContractParty(i, "clientId", v)}
                          options={[{ value: "", label: "Pick client…" }, ...contractClients.map((c) => ({ value: c.id, label: String(c.companyName ? `${c.companyName} (${c.name})` : c.name) }))]}
                          size="sm"
                        />
                      </div>
                    )}
                    {/* v3: external parties are typed in directly — name and
                        email below are the whole record. */}
                    {party.partyType === "USER" && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Team Member</label>
                        <Select
                          value={party.userId}
                          onChange={(v) => updateContractParty(i, "userId", v)}
                          options={[{ value: "", label: "Pick user…" }, ...contractUsers.map((u) => ({ value: u.id, label: `${u.name}` }))]}
                          size="sm"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Name *</label>
                      <input value={party.name} onChange={(e) => updateContractParty(i, "name", e.target.value)}
                        placeholder="Full name"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Email</label>
                      <input type="email" value={party.email} onChange={(e) => updateContractParty(i, "email", e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes / Contract Content</label>
            <textarea value={contractForm.notes} onChange={(e) => setContractForm((f) => ({ ...f, notes: e.target.value }))} rows={4}
              placeholder="Key terms, special clauses..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => { setContractModalOpen(false); setContractForm(EMPTY_CONTRACT_FORM); setContractParties([{ ...EMPTY_PARTY }]); }}>Cancel</Button>
            <Button type="submit" loading={contractSaving}>Create Contract</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
