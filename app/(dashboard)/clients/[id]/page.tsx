"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Edit2, Trash2, Plus, Star, Mail, Phone,
  Globe, MapPin, Building2, FileText, FolderOpen,
  ExternalLink, Check, X, Pencil, Receipt as ReceiptIcon, HardDrive, ChevronRight,
  Link2, HardDriveIcon, Image, MessageSquare, Hash, Upload,
  DollarSign, Clock, CheckCircle2, AlertCircle, Send, Users, User as UserIcon,
} from "lucide-react";
import { BrandAssetsEditor } from "@/components/clients/BrandAssetsEditor";
import { ClientFilesTab } from "@/components/clients/ClientFilesTab";
import type { BrandColor, BrandAsset, ClientLink } from "@/types";
import { Button } from "@/components/ui/Button";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ClientForm } from "@/components/clients/ClientForm";
import { ContentCalendarTab } from "@/components/content/ContentCalendarTab";
import { FulfillmentLine } from "@/components/content/FulfillmentLine";
import { FollowUpsCard } from "@/components/content/FollowUpsCard";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can, canViewContacts } from "@/lib/permissions";
import { Client, ContactFormData, ClientContact, ProjectStatus, ProjectType, AssetFile, ContractType, ContractPartyType, User, Invoice, InvoiceStatus, Channel, ChatMessage, Expense, ExpenseCategory, ExpenseStatus, Receipt, ReceiptMethod } from "@/types";
import { calcInvoiceTotal } from "@/lib/format";
import { formatMoney, resolveClientCurrency } from "@/lib/money";

// ── helpers ──────────────────────────────────────────────────
type Tab = "content" | "overview" | "contacts" | "brand" | "tax" | "projects" | "files" | "contracts" | "chat" | "invoices" | "expenses" | "receipts";

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SOFTWARE_TOOLS: "Software & Tools",
  FREELANCER_PAYMENT: "Freelancer Payment",
  VENDOR_PAYMENT: "Vendor Payment",
  STOCK_ASSETS: "Stock Assets",
  PRINTING: "Printing",
  TRAVEL: "Travel",
  ADVERTISING: "Advertising",
  OFFICE: "Office",
  EQUIPMENT: "Equipment",
  COMMISSIONS: "Commissions",
  OTHER: "Other",
};

const EXPENSE_STATUS_COLOR: Record<ExpenseStatus, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  APPROVED: "bg-blue-50 text-blue-700",
  PAID: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-600",
};

const RECEIPT_METHOD_LABELS: Record<ReceiptMethod, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  CHECK: "Cheque",
  CARD: "Card",
  UPI: "UPI",
  OTHER: "Other",
};

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-green-100 text-green-700",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-600",
};

const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  ONE_TIME: "One-time",
  RETAINER: "Retainer",
};

const EMPTY_CONTACT: ContactFormData = {
  name: "", email: "", phone: "", jobTitle: "", isPrimary: false,
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: "NDA",               label: "NDA" },
  { value: "SERVICE_AGREEMENT", label: "Service Agreement" },
  { value: "EMPLOYMENT",        label: "Employment Agreement" },
  { value: "FREELANCE",         label: "Freelance Contract" },
  { value: "PARTNERSHIP",       label: "Partnership Agreement" },
  { value: "OTHER",             label: "Other" },
];

const EMPTY_CONTRACT_FORM = {
  title: "", type: "NDA" as ContractType,
  startDate: "", endDate: "", value: "", currency: "USD", notes: "",
};

type ClientPartyDraft = {
  partyType: ContractPartyType; clientId: string;
  userId: string; name: string; email: string;
};
const EMPTY_CLIENT_PARTY: ClientPartyDraft = {
  partyType: "CLIENT", clientId: "", userId: "", name: "", email: "",
};

// ── Contact Form (inline modal) ──────────────────────────────
function ContactModal({
  open, onClose, clientId, existing, currentPrimary, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  existing?: ClientContact;
  /** The existing primary contact for this client (if any). Used to confirm
   *  re-assignment when "Set as primary" is checked on a different contact. */
  currentPrimary?: ClientContact | null;
  onSaved: (c: ClientContact) => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<ContactFormData>(
    existing
      ? { name: existing.name, email: existing.email ?? "", phone: existing.phone ?? "", jobTitle: existing.jobTitle ?? "", isPrimary: existing.isPrimary }
      : EMPTY_CONTACT
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof ContactFormData, value: unknown) =>
    setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }

    // If the user ticked "Set as primary" AND there's already a different
    // primary contact, ask them to confirm the swap before saving.
    const hasOtherPrimary =
      currentPrimary && currentPrimary.id !== existing?.id;
    if (form.isPrimary && hasOtherPrimary) {
      const ok = await confirm({
        title: "Change primary contact?",
        message: `${form.name.trim()} will replace ${currentPrimary!.name} as the primary contact for this client.`,
        confirmLabel: `Set ${form.name.trim()} as primary`,
        cancelLabel: "Cancel",
        variant: "warning",
      });
      if (!ok) return;
    }

    setSaving(true); setError(null);
    try {
      const url = existing
        ? `/api/clients/${clientId}/contacts/${existing.id}`
        : `/api/clients/${clientId}/contacts`;
      const res = await fetch(url, {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      onSaved(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Contact" : "Add Contact"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        {[
          { label: "Name *", field: "name", type: "text", placeholder: "Full name" },
          { label: "Job Title", field: "jobTitle", type: "text", placeholder: "e.g. Marketing Manager" },
          { label: "Email", field: "email", type: "email", placeholder: "email@company.com" },
        ].map(({ label, field, type, placeholder }) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type}
              required={field === "name"}
              value={form[field as keyof ContactFormData] as string}
              onChange={(e) => set(field as keyof ContactFormData, e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} placeholder="Phone number" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => set("isPrimary", e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Set as primary contact</span>
        </label>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} className="flex-1">
            {existing ? "Save Changes" : "Add Contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const toast   = useToast();
  const confirm = useConfirm();
  const { user: currentUser } = useCurrentUser();
  const canManageChannels = can(currentUser, "clients.manage");
  // v3: capability-driven, not role-driven. The API strips the same fields.
  const seesMoney = can(currentUser, "financials.view");
  const seesContacts = canViewContacts(currentUser);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // Deep link: /clients/[id]?tab=content (used by notification links)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setTab(t as Tab);
  }, []);
  const [editOpen, setEditOpen] = useState(false);
  const [contactModal, setContactModal] = useState<{ open: boolean; editing?: ClientContact }>({ open: false });
  const [archiving, setArchiving] = useState(false);
  const [brandColors, setBrandColors] = useState<BrandColor[]>([]);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [clientLinks, setClientLinks] = useState<ClientLink[]>([]);
  const [savingBrand, setSavingBrand] = useState(false);
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [clientContracts, setClientContracts] = useState<import("@/types").Contract[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    currency: "USD",
    date: new Date().toISOString().slice(0, 10),
    category: "OTHER" as ExpenseCategory,
    projectId: "",
    notes: "",
  });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptEditing, setReceiptEditing] = useState<Receipt | null>(null);
  const [receiptForm, setReceiptForm] = useState({
    amount: "",
    currency: "USD",
    receivedAt: new Date().toISOString().slice(0, 10),
    method: "BANK_TRANSFER" as ReceiptMethod,
    invoiceId: "",
    reference: "",
    receiptNumber: "",
    notes: "",
  });
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<string[]>([]);
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string; role: string }[]>([]);

  // Inline create modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [clientContractForm, setClientContractForm] = useState(EMPTY_CONTRACT_FORM);
  const [clientContractSaving, setClientContractSaving] = useState(false);
  const [clientContractError, setClientContractError] = useState<string | null>(null);
  const [clientContractParties, setClientContractParties] = useState<ClientPartyDraft[]>([{ ...EMPTY_CLIENT_PARTY }]);
  const [contractFormUsers, setContractFormUsers] = useState<Pick<User, "id" | "name" | "email">[]>([]);

  const fetchClient = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to load client");
      setClient(data);
      setBrandColors(Array.isArray(data.brandColors) ? data.brandColors : []);
      setBrandAssets(Array.isArray(data.brandAssets) ? data.brandAssets : []);
      setClientLinks(Array.isArray(data.links) ? data.links : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  useEffect(() => {
    if (tab === "files" && !filesLoaded) {
      fetch(`/api/files?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setFiles(d); setFilesLoaded(true); });
    }
    if (tab === "contracts" && !contractsLoaded) {
      fetch(`/api/contracts?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { setClientContracts(Array.isArray(d) ? d : d.contracts ?? []); setContractsLoaded(true); });
    }
    if (tab === "invoices" && !invoicesLoaded) {
      fetch(`/api/invoices?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setInvoices(d); setInvoicesLoaded(true); });
    }
    if (tab === "overview") {
      // Auto-load financial data so the summary is populated.
      if (!invoicesLoaded) {
        fetch(`/api/invoices?clientId=${id}`)
          .then((r) => r.json())
          .then((d) => { if (Array.isArray(d)) setInvoices(d); setInvoicesLoaded(true); });
      }
      if (!receiptsLoaded) {
        fetch(`/api/receipts?clientId=${id}`)
          .then((r) => r.json())
          .then((d) => { setReceipts(Array.isArray(d) ? d : d.receipts ?? []); setReceiptsLoaded(true); });
      }
      if (!expensesLoaded) {
        fetch(`/api/expenses?clientId=${id}&includeProjectExpenses=1`)
          .then((r) => r.json())
          .then((d) => { setExpenses(Array.isArray(d) ? d : d.expenses ?? []); setExpensesLoaded(true); });
      }
    }
    if (tab === "expenses" && !expensesLoaded) {
      fetch(`/api/expenses?clientId=${id}&includeProjectExpenses=1`)
        .then((r) => r.json())
        .then((d) => { setExpenses(Array.isArray(d) ? d : d.expenses ?? []); setExpensesLoaded(true); });
    }
    if (tab === "receipts" && !receiptsLoaded) {
      fetch(`/api/receipts?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { setReceipts(Array.isArray(d) ? d : d.receipts ?? []); setReceiptsLoaded(true); });
      // Make sure we have invoices loaded for the dropdown
      if (!invoicesLoaded) {
        fetch(`/api/invoices?clientId=${id}`)
          .then((r) => r.json())
          .then((d) => { if (Array.isArray(d)) setInvoices(d); setInvoicesLoaded(true); });
      }
    }
    if (tab === "chat" && !channelsLoaded) {
      fetch(`/api/channels?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d) ? d : [];
          setChannels(list);
          if (list.length > 0 && !activeChannel) setActiveChannel(list[0]);
          setChannelsLoaded(true);
        });
      if (teamUsers.length === 0) {
        fetch("/api/users").then(r => r.json()).then(d => setTeamUsers(Array.isArray(d) ? d : d.users ?? [])).catch(() => {});
      }
    }
  }, [tab, id, filesLoaded, contractsLoaded, invoicesLoaded, expensesLoaded, receiptsLoaded, channelsLoaded, activeChannel, teamUsers]);

  // Load the internal users that can be named as a contract party
  useEffect(() => {
    if (contractModalOpen && contractFormUsers.length === 0) {
      fetch("/api/users").then((r) => r.json()).then((u) => {
        setContractFormUsers(Array.isArray(u) ? u : []);
      });
    }
  }, [contractModalOpen]);

  const updateClientContractParty = (i: number, k: string, v: string) => {
    setClientContractParties((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      const updated = { ...p, [k]: v };
      if (k === "clientId" && v && client) {
        updated.name = client.companyName || client.name;
      }
      if (k === "userId" && v) {
        const u = contractFormUsers.find((u) => u.id === v);
        if (u) { updated.name = u.name; updated.email = u.email; }
      }
      if (k === "partyType") {
        updated.clientId = ""; updated.userId = "";
        updated.name = ""; updated.email = "";
      }
      return updated;
    }));
  };

  const handleAddClientContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientContractForm.title.trim()) { setClientContractError("Title is required"); return; }
    if (clientContractParties.some((p) => !p.name.trim())) { setClientContractError("All parties need a name"); return; }
    setClientContractSaving(true); setClientContractError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...clientContractForm, clientId: id, parties: clientContractParties }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || "Failed to create contract";
        setClientContractError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Contract created");
      setContractModalOpen(false);
      setClientContractForm(EMPTY_CONTRACT_FORM);
      setClientContractParties([{ ...EMPTY_CLIENT_PARTY }]);
      // Refresh contracts list
      setContractsLoaded(false);
      fetch(`/api/contracts?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { setClientContracts(Array.isArray(d) ? d : d.contracts ?? []); setContractsLoaded(true); });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create contract";
      setClientContractError(msg);
      toast.error(msg);
    } finally {
      setClientContractSaving(false);
    }
  };

  // ── Invoice helpers ──
  const handleInvoiceMarkPaid = async (invoiceId: string) => {
    const ok = await confirm({
      title: "Mark invoice as paid?",
      message: "This will mark the invoice as paid and record today as the payment date.",
      confirmLabel: "Mark Paid",
      variant: "warning",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID", paidAt: new Date().toISOString() }),
      });
      if (res.ok) {
        toast.success("Invoice marked as paid");
        setInvoices((prev) => prev.map((inv) => inv.id === invoiceId ? { ...inv, status: "PAID" as InvoiceStatus } : inv));
      } else {
        toast.error("Failed to update invoice");
      }
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  // ── Expense helpers ──
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.title.trim()) { setExpenseError("Title is required"); return; }
    if (!expenseForm.amount || isNaN(Number(expenseForm.amount))) { setExpenseError("Valid amount is required"); return; }
    setExpenseSaving(true); setExpenseError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: expenseForm.title.trim(),
          amount: Number(expenseForm.amount),
          currency: expenseForm.currency,
          date: expenseForm.date,
          category: expenseForm.category,
          clientId: id,
          projectId: expenseForm.projectId || null,
          notes: expenseForm.notes || null,
          status: "PENDING",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || "Failed to create expense");
      }
      toast.success("Expense added");
      setExpenseModalOpen(false);
      setExpenseForm({
        title: "", amount: "", currency: "USD",
        date: new Date().toISOString().slice(0, 10),
        category: "OTHER", projectId: "", notes: "",
      });
      // Refetch
      setExpensesLoaded(false);
      fetch(`/api/expenses?clientId=${id}&includeProjectExpenses=1`)
        .then((r) => r.json())
        .then((d) => { setExpenses(Array.isArray(d) ? d : d.expenses ?? []); setExpensesLoaded(true); });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create expense";
      setExpenseError(msg);
      toast.error(msg);
    } finally {
      setExpenseSaving(false);
    }
  };

  // ── Receipt helpers ──
  const openReceiptModal = (existing?: Receipt) => {
    if (existing) {
      setReceiptEditing(existing);
      setReceiptForm({
        amount: String(existing.amount),
        currency: existing.currency,
        receivedAt: existing.receivedAt.slice(0, 10),
        method: existing.method,
        invoiceId: existing.invoiceId ?? "",
        reference: existing.reference ?? "",
        receiptNumber: existing.receiptNumber ?? "",
        notes: existing.notes ?? "",
      });
    } else {
      setReceiptEditing(null);
      const defaultCurrency = invoices[0]?.currency ?? "USD";
      setReceiptForm({
        amount: "", currency: defaultCurrency,
        receivedAt: new Date().toISOString().slice(0, 10),
        method: "BANK_TRANSFER", invoiceId: "",
        reference: "", receiptNumber: "", notes: "",
      });
    }
    setReceiptError(null);
    setReceiptModalOpen(true);
  };

  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptForm.amount || isNaN(Number(receiptForm.amount))) { setReceiptError("Valid amount is required"); return; }
    setReceiptSaving(true); setReceiptError(null);
    try {
      const url = receiptEditing
        ? `/api/receipts/${receiptEditing.id}`
        : "/api/receipts";
      const method = receiptEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: id,
          amount: Number(receiptForm.amount),
          currency: receiptForm.currency,
          receivedAt: receiptForm.receivedAt,
          method: receiptForm.method,
          invoiceId: receiptForm.invoiceId || null,
          reference: receiptForm.reference || null,
          receiptNumber: receiptForm.receiptNumber || null,
          notes: receiptForm.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || "Failed to save receipt");
      }
      toast.success(receiptEditing ? "Receipt updated" : "Receipt recorded");
      setReceiptModalOpen(false);
      setReceiptEditing(null);
      setReceiptsLoaded(false);
      fetch(`/api/receipts?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { setReceipts(Array.isArray(d) ? d : d.receipts ?? []); setReceiptsLoaded(true); });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save receipt";
      setReceiptError(msg);
      toast.error(msg);
    } finally {
      setReceiptSaving(false);
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    const ok = await confirm({
      title: "Delete receipt?",
      message: "This payment record will be permanently deleted.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete receipt");
        return;
      }
      toast.success("Receipt deleted");
      setReceipts((prev) => prev.filter((r) => r.id !== receiptId));
    } catch {
      toast.error("Failed to delete receipt");
    }
  };

  // ── Chat helpers ──
  const fetchMessages = useCallback(async (channelId: string) => {
    setChatLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(Array.isArray(data) ? data : data.messages ?? []);
      }
    } finally {
      setChatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeChannel) fetchMessages(activeChannel.id);
  }, [activeChannel, fetchMessages]);

  const handleSendMessage = async () => {
    if (!composeText.trim() || !activeChannel) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/channels/${activeChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: composeText.trim() }),
      });
      if (res.ok) {
        setComposeText("");
        fetchMessages(activeChannel.id);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName.trim(),
          type: "CLIENT",
          clientId: id,
          ...(newChannelMemberIds.length > 0 ? { memberIds: newChannelMemberIds } : {}),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setChannels((prev) => [...prev, created]);
        setActiveChannel(created);
        setNewChannelName("");
        setNewChannelMemberIds([]);
        setShowCreateChannel(false);
      } else {
        toast.error("Failed to create channel");
      }
    } catch {
      toast.error("Failed to create channel");
    }
  };

  const handleDeleteChannel = async (channelId: string, channelName: string) => {
    const ok = await confirm({
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

  const handleArchive = async () => {
    const ok = await confirm({
      title: "Archive client?",
      message: "This client will be archived and no longer appear in active lists. Their projects and data will be preserved.",
      confirmLabel: "Archive Client",
      variant: "warning",
    });
    if (!ok) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to archive client");
        return;
      }
      toast.success("Client archived");
      router.push("/clients");
    } catch {
      toast.error("Failed to archive client");
    } finally {
      setArchiving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    const ok = await confirm({
      title: "Remove contact?",
      message: "This contact will be permanently removed from the client.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/clients/${id}/contacts/${contactId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove contact");
        return;
      }
      toast.success("Contact removed");
      setClient((prev) =>
        prev ? { ...prev, contacts: prev.contacts.filter((c) => c.id !== contactId) } : prev
      );
    } catch {
      toast.error("Failed to remove contact");
    }
  };

  const handleSaveBrand = async () => {
    setSavingBrand(true);
    try {
      await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandColors, brandAssets }),
      });
      setClient((prev) => prev ? { ...prev, brandColors, brandAssets } : prev);
    } finally {
      setSavingBrand(false);
    }
  };

  const handleContactSaved = (saved: ClientContact) => {
    setClient((prev) => {
      if (!prev) return prev;
      const exists = prev.contacts.find((c) => c.id === saved.id);
      const contacts = exists
        ? prev.contacts.map((c) => c.id === saved.id ? saved : saved.isPrimary ? { ...c, isPrimary: false } : c)
        : [...prev.contacts, saved].map((c) => saved.isPrimary && c.id !== saved.id ? { ...c, isPrimary: false } : c);
      return { ...prev, contacts };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm text-gray-500">{error ?? "Client not found"}</p>
        <Link href="/clients" className="mt-3 text-sm text-indigo-600 hover:underline">
          ← Back to clients
        </Link>
      </div>
    );
  }

  // Heading should always be the company name. Fall back to legacy `name`.
  const displayName = (client.companyName ?? "").trim() || client.name;
  const primaryContact = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
  const initials = displayName.split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();
  const tabs: { id: Tab; label: string }[] = [
    // v2: the client's ONE content calendar — first tab, the source of all work
    { id: "content",     label: "Content Calendar" },
    { id: "overview",    label: "Overview" },
    // v3: juniors never see client contacts (API strips them too)
    ...(seesContacts ? [{ id: "contacts" as Tab, label: `Contacts (${client.contacts.length})` }] : []),
    { id: "brand",       label: `Brand (${brandColors.length + brandAssets.length})` },
    ...(seesMoney ? [{ id: "tax" as Tab, label: "Tax & Billing" }] : []),
    { id: "projects",    label: `Projects (${client.projects.length})` },
    // v3: the money tabs need financials.view; the API refuses them anyway
    ...(seesMoney ? [
      { id: "invoices" as Tab, label: "Invoices" },
      { id: "receipts" as Tab, label: "Receipts" },
    ] : []),
    { id: "expenses",    label: "Expenses" },
    { id: "files",       label: "Files" },
    { id: "chat",        label: "Chat" },
    { id: "contracts",   label: "Contracts" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4">
          <ChevronLeft className="w-4 h-4" /> Back to Clients
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            {client.logoUrl ? (
              // object-contain + padding + white bg so logos don't get cropped
              // or styled awkwardly inside the square frame.
              <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center p-1.5 overflow-hidden">
                <img
                  src={client.logoUrl}
                  alt={displayName}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center">
                {primaryContact ? (
                  <Building2 className="w-7 h-7 text-indigo-600" />
                ) : (
                  <span className="text-base font-bold text-indigo-600">{initials}</span>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
                <StatusBadge status={client.status} />
              </div>
              {primaryContact && (
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  {primaryContact.name}
                  {primaryContact.jobTitle ? ` · ${primaryContact.jobTitle}` : ""}
                </p>
              )}
              {client.industry && (
                <p className="text-xs text-gray-400 mt-1">{client.industry}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} loading={archiving} onClick={handleArchive}>
              Archive
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto -mb-5 mt-6">
          <div className="flex gap-1 whitespace-nowrap">
            {tabs.map(({ id: tid, label }) => (
              <button
                key={tid}
                onClick={() => setTab(tid)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === tid
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* ── CONTENT CALENDAR (v2 — the client's ONE calendar) ── */}
        {tab === "content" && <ContentCalendarTab clientId={id} />}

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (() => {
          // ── Financial Summary calculations ──
          const invTotal = (inv: Invoice) =>
            calcInvoiceTotal(inv.lineItems, { discountRate: inv.discountPct, taxRate: inv.taxPct }).total;
          const invoicedTotal = invoices.reduce((s, inv) => s + invTotal(inv), 0);
          // Paid = recorded receipts + PAID invoices that have no receipt
          // against them (paid but recorded only via status) — never both.
          const invoicesWithReceipts = new Set(receipts.map((r) => r.invoiceId).filter(Boolean));
          const paidFromInvoices = invoices
            .filter((inv) => inv.status === "PAID" && !invoicesWithReceipts.has(inv.id))
            .reduce((s, inv) => s + invTotal(inv), 0);
          const paidFromReceipts = receipts.reduce((s, r) => s + Number(r.amount ?? 0), 0);
          const paidTotal = paidFromInvoices + paidFromReceipts;
          const outstanding = Math.max(0, invoicedTotal - paidTotal);
          const expensesTotal = expenses
            .filter((ex) => ex.status === "PAID" || ex.status === "APPROVED")
            .reduce((s, ex) => s + Number(ex.amount ?? 0), 0);
          const netMargin = paidTotal - expensesTotal;
          // v2: client currency override → org currency → USD
          const dominantCurrency = resolveClientCurrency(
            client,
            currentUser?.organization,
          );
          const finStats: { label: string; value: number; color: string; icon: typeof DollarSign }[] = [
            { label: "Invoiced", value: invoicedTotal, color: "text-gray-700", icon: DollarSign },
            { label: "Paid", value: paidTotal, color: "text-emerald-600", icon: CheckCircle2 },
            { label: "Outstanding", value: outstanding, color: "text-amber-600", icon: AlertCircle },
            { label: "Expenses (this client)", value: expensesTotal, color: "text-red-600", icon: ReceiptIcon },
            { label: "Net Margin", value: netMargin, color: netMargin >= 0 ? "text-emerald-600" : "text-red-600", icon: DollarSign },
          ];
          return (
          <div className="max-w-2xl space-y-6">
            {/* v2 Phase 6: current-month package fulfillment */}
            <FulfillmentLine clientId={id} />

            {/* v2 Phase 8: POC/SME follow-ups */}
            <FollowUpsCard clientId={id} />

            {/* Financial summary — needs financials.view (API strips it too) */}
            {seesMoney && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Financial Summary</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {finStats.map(({ label, value, color, icon: Icon }) => (
                  <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="text-[11px] text-gray-500">{label}</span>
                    </div>
                    <p className={`text-base font-semibold ${color}`}>
                      {formatMoney(value, dominantCurrency, { precision: 0 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {[
                { label: "Email", value: client.email, icon: Mail, href: client.email ? `mailto:${client.email}` : undefined },
                { label: "Phone", value: client.phone, icon: Phone, href: client.phone ? `tel:${client.phone}` : undefined },
                { label: "Website", value: client.website, icon: Globe, href: client.website ?? undefined },
                { label: "Address", value: client.address, icon: MapPin },
              ].map(({ label, value, icon: Icon, href }) =>
                value ? (
                  <div key={label} className="flex items-center gap-4 px-5 py-3.5">
                    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 w-16">{label}</span>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                        {value} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-sm text-gray-800">{value}</span>
                    )}
                  </div>
                ) : null
              )}
            </div>

            {clientLinks.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Reference Links</span>
                </div>
                <div className="space-y-2">
                  {clientLinks.map((link) => {
                    const typeLabel: Record<string, string> = {
                      logo: "Logo", drive: "Google Drive", dropbox: "Dropbox",
                      figma: "Figma", notion: "Notion", github: "GitHub",
                      website: "Website", other: "Link",
                    };
                    return (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                      >
                        <span className="text-xs font-medium text-gray-400 w-20 flex-shrink-0">
                          {typeLabel[link.type] ?? link.type}
                        </span>
                        <span className="text-sm text-indigo-600 group-hover:underline truncate flex-1">
                          {link.label || link.url}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {client.notes && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Internal Notes</span>
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{client.notes}</p>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400">
                Added {new Date(client.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                {" · "} Last updated {new Date(client.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          );
        })()}

        {/* ── CONTACTS ── */}
        {tab === "contacts" && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{client.contacts.length} contact{client.contacts.length !== 1 ? "s" : ""}</p>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setContactModal({ open: true })}>
                Add Contact
              </Button>
            </div>

            {client.contacts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <p className="text-sm text-gray-500">No contacts added yet.</p>
                <Button size="sm" className="mt-3" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setContactModal({ open: true })}>
                  Add First Contact
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {client.contacts.map((contact) => (
                  <div key={contact.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-indigo-600">
                          {contact.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                          {contact.isPrimary && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full ring-1 ring-amber-200">
                              <Star className="w-2.5 h-2.5 fill-amber-500" /> Primary
                            </span>
                          )}
                        </div>
                        {contact.jobTitle && <p className="text-xs text-gray-500 mt-0.5">{contact.jobTitle}</p>}
                        <div className="flex flex-wrap gap-3 mt-1.5">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setContactModal({ open: true, editing: contact })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── BRAND ── */}
        {tab === "brand" && (
          <div className="max-w-2xl">
            {/* Logo preview strip */}
            {client.logoUrl && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex items-center gap-4">
                <img
                  src={client.logoUrl}
                  alt="Logo"
                  className="w-16 h-16 object-contain rounded-xl border border-gray-100 bg-gray-50 p-1"
                />
                <div>
                  <p className="text-xs font-medium text-gray-700">Logo URL</p>
                  <a href={client.logoUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline flex items-center gap-1 mt-0.5">
                    <ExternalLink className="w-3 h-3" /> Open original
                  </a>
                </div>
              </div>
            )}

            {/* Live editable brand assets */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <BrandAssetsEditor
                colors={brandColors}
                assets={brandAssets}
                onColorsChange={setBrandColors}
                onAssetsChange={setBrandAssets}
                saving={savingBrand}
                onSave={handleSaveBrand}
              />
            </div>
          </div>
        )}

        {/* ── TAX & BILLING ── */}
        {tab === "tax" && (
          <div className="max-w-2xl">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-1">
                <ReceiptIcon className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-800">Tax Registrations</h3>
              </div>
              <p className="text-xs text-gray-500 mb-5">All applicable tax IDs for this client (GST, VAT, EIN, ABN, etc.)</p>

              {client.taxRegistrations && client.taxRegistrations.length > 0 ? (
                <div className="space-y-3">
                  {/* Header */}
                  <div className="grid grid-cols-3 gap-3 px-1">
                    {["Type", "Number", "Country / Region"].map((h) => (
                      <p key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</p>
                    ))}
                  </div>
                  {client.taxRegistrations.map((tax) => (
                    <div key={tax.id} className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl px-4 py-3 items-center">
                      <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded w-fit">{tax.type}</span>
                      <span className="text-sm font-mono text-gray-800">{tax.number}</span>
                      <span className="text-sm text-gray-600">{tax.country}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                  <ReceiptIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No tax registrations added.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Edit the client to add GST, VAT, EIN and other tax IDs.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PROJECTS ── */}
        {tab === "projects" && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{client.projects.length} project{client.projects.length !== 1 ? "s" : ""}</p>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setProjectModalOpen(true)}>
                New Project
              </Button>
            </div>

            {client.projects.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <FolderOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No projects yet.</p>
                <button onClick={() => setProjectModalOpen(true)} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
                  Create first project
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {client.projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">{project.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{PROJECT_TYPE_LABEL[project.type]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PROJECT_STATUS_COLOR[project.status]}`}>
                        {project.status.replace("_", " ")}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FILES ── */}
        {tab === "files" && (
          <ClientFilesTab clientId={id} projects={client.projects ?? []} />
        )}

        {/* ── INVOICES ── */}
        {tab === "invoices" && (() => {
          const tabInvTotal = (inv: Invoice) =>
            calcInvoiceTotal(inv.lineItems, { discountRate: inv.discountPct, taxRate: inv.taxPct }).total;
          const totalInvoiced = invoices.reduce((sum, inv) => sum + tabInvTotal(inv), 0);
          const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
          const totalPaid = paidInvoices.reduce((sum, inv) => sum + tabInvTotal(inv), 0);
          const totalOutstanding = totalInvoiced - totalPaid;
          const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
            DRAFT: "bg-gray-100 text-gray-600",
            SENT: "bg-blue-50 text-blue-700",
            PAID: "bg-emerald-50 text-emerald-700",
            OVERDUE: "bg-red-50 text-red-600",
            CANCELLED: "bg-gray-100 text-gray-500",
          };

          return (
            <div className="max-w-3xl space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Invoiced", value: totalInvoiced, icon: DollarSign, color: "text-gray-700" },
                  { label: "Paid", value: totalPaid, icon: CheckCircle2, color: "text-emerald-600" },
                  { label: "Outstanding", value: totalOutstanding, icon: AlertCircle, color: "text-amber-600" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                    <p className={`text-lg font-semibold ${color}`}>
                      {formatMoney(value, resolveClientCurrency(client, currentUser?.organization), { precision: 0 })}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</p>
                <Link href={`/invoices?clientId=${id}`}>
                  <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>New Invoice</Button>
                </Link>
              </div>

              {!invoicesLoaded ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl h-14 animate-pulse" />
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No invoices yet.</p>
                  <Link href={`/invoices?clientId=${id}`} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
                    Create first invoice
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Invoice #</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Due Date</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Amount</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoices.map((inv) => {
                        const amount = calcInvoiceTotal(inv.lineItems, { discountRate: inv.discountPct, taxRate: inv.taxPct }).total;
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link href="/invoices" className="font-medium text-gray-900 hover:text-indigo-600 font-mono text-xs">
                                {inv.invoiceNumber}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {inv.project ? (
                                <Link href={`/projects/${inv.project.id}`} className="hover:text-indigo-600 transition-colors">
                                  {inv.project.name}
                                </Link>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLOR[inv.status]}`}>
                                {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">
                              {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "--"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-700 text-sm">
                              {formatMoney(amount, resolveClientCurrency(client, currentUser?.organization), { precision: 0 })}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {inv.status !== "PAID" && (
                                <button
                                  onClick={() => handleInvoiceMarkPaid(inv.id)}
                                  className="px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Mark Paid
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CHAT ── */}
        {tab === "chat" && (
          <div className="max-w-3xl space-y-4">
            {!channelsLoaded ? (
              <div className="space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl h-14 animate-pulse" />
                ))}
              </div>
            ) : channels.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No channels for this client yet.</p>
                {!showCreateChannel ? (
                  <button
                    onClick={() => setShowCreateChannel(true)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <Plus className="w-4 h-4" /> New Channel
                  </button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 justify-center">
                      <input
                        type="text"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                        placeholder="Channel name"
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                        autoFocus
                      />
                      <button
                        onClick={handleCreateChannel}
                        disabled={!newChannelName.trim()}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => { setShowCreateChannel(false); setNewChannelName(""); setNewChannelMemberIds([]); }}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                    {teamUsers.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap justify-center">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[11px] text-gray-500">Members:</span>
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
              </div>
            ) : (
              <div className="flex gap-4 h-[500px]">
                {/* Channel list sidebar */}
                <div className="w-56 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Channels</p>
                    <button
                      onClick={() => setShowCreateChannel(!showCreateChannel)}
                      className="text-indigo-600 hover:text-indigo-700"
                      title="New Channel"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {showCreateChannel && (
                    <div className="px-3 py-2 border-b border-gray-100 space-y-2">
                      <input
                        type="text"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                        placeholder="Channel name"
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      {teamUsers.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {teamUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => setNewChannelMemberIds(prev =>
                                prev.includes(u.id) ? prev.filter(uid => uid !== u.id) : [...prev, u.id]
                              )}
                              className={`px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
                                newChannelMemberIds.includes(u.id)
                                  ? "bg-indigo-100 border-indigo-300 text-indigo-700"
                                  : "border-gray-200 text-gray-500"
                              }`}
                            >
                              {u.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleCreateChannel}
                          disabled={!newChannelName.trim()}
                          className="flex-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => { setShowCreateChannel(false); setNewChannelName(""); setNewChannelMemberIds([]); }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto">
                    {channels.map((ch) => {
                      const typeIcon = ch.type === "CLIENT"
                        ? <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        : <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setActiveChannel(ch)}
                          className={`group/ch w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                            activeChannel?.id === ch.id
                              ? "bg-indigo-50 text-indigo-700"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {typeIcon}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{ch.name}</p>
                            {ch.lastMessage && (
                              <p className="text-[10px] text-gray-400 truncate mt-0.5">{ch.lastMessage.body}</p>
                            )}
                          </div>
                          {ch._count?.messages ? (
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{ch._count.messages}</span>
                          ) : null}
                          {canManageChannels && (
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteChannel(ch.id, ch.name); }}
                              className="hidden group-hover/ch:block text-gray-400 hover:text-red-500 flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Message area */}
                <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
                  {activeChannel ? (
                    <>
                      {/* Channel header */}
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-800">{activeChannel.name}</span>
                        {activeChannel.description && (
                          <span className="text-xs text-gray-400 ml-2 truncate">{activeChannel.description}</span>
                        )}
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {chatLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : chatMessages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <MessageSquare className="w-6 h-6 text-gray-300 mb-2" />
                            <p className="text-xs text-gray-400">No messages yet. Start the conversation.</p>
                          </div>
                        ) : (
                          chatMessages.map((msg) => (
                            <div key={msg.id} className="flex gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[10px] font-bold text-indigo-600">
                                  {msg.authorName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-xs font-medium text-gray-800">{msg.authorName}</span>
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-0.5 break-words">{msg.body}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Compose */}
                      <div className="px-4 py-3 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={composeText}
                            onChange={(e) => setComposeText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                            placeholder={`Message #${activeChannel.name}...`}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={sendingMessage || !composeText.trim()}
                            className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400">Select a channel to view messages</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONTRACTS ── */}
        {tab === "contracts" && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{clientContracts.length} contract{clientContracts.length !== 1 ? "s" : ""}</p>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setContractModalOpen(true)}>New Contract</Button>
            </div>

            {!contractsLoaded ? (
              <div className="space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl h-16 animate-pulse" />
                ))}
              </div>
            ) : clientContracts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No contracts linked to this client.</p>
                <button onClick={() => setContractModalOpen(true)} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
                  Create a contract
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Title</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Signatures</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {clientContracts.map((c) => {
                      const signed = c.parties.filter((p) => p.signedAt).length;
                      const statusColor: Record<string, string> = {
                        DRAFT: "bg-gray-100 text-gray-600",
                        SENT: "bg-blue-50 text-blue-700",
                        PARTIALLY_SIGNED: "bg-amber-50 text-amber-700",
                        FULLY_SIGNED: "bg-emerald-50 text-emerald-700",
                        EXPIRED: "bg-orange-50 text-orange-700",
                        TERMINATED: "bg-red-50 text-red-700",
                      };
                      const statusLabel: Record<string, string> = {
                        DRAFT: "Draft", SENT: "Sent",
                        PARTIALLY_SIGNED: "Partially Signed", FULLY_SIGNED: "Fully Signed",
                        EXPIRED: "Expired", TERMINATED: "Terminated",
                      };
                      const typeLabel: Record<string, string> = {
                        NDA: "NDA", SERVICE_AGREEMENT: "Service Agreement",
                        EMPLOYMENT: "Employment", FREELANCE: "Freelance",
                        PARTNERSHIP: "Partnership", OTHER: "Other",
                      };
                      return (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/contracts/${c.id}`} className="font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                              {c.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{typeLabel[c.type] ?? c.type}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {statusLabel[c.status] ?? c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {signed}/{c.parties.length} signed
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {c.startDate ? new Date(c.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── EXPENSES ── */}
        {tab === "expenses" && (() => {
          const totalAmount = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
          const currency = resolveClientCurrency(client, currentUser?.organization);

          // Group: each project (this client's) + a "Direct (no project)" bucket
          const groups: { key: string; label: string; projectId: string | null; items: Expense[] }[] = [];
          const direct = expenses.filter((e) => !e.projectId);
          const byProject = expenses.filter((e) => !!e.projectId);
          if (direct.length) groups.push({ key: "direct", label: "Direct (no project)", projectId: null, items: direct });
          const projectGroups = byProject.reduce<Record<string, { name: string; items: Expense[] }>>((acc, e) => {
            const pId = e.projectId!;
            if (!acc[pId]) acc[pId] = { name: e.project?.name ?? "Project", items: [] };
            acc[pId].items.push(e);
            return acc;
          }, {});
          Object.entries(projectGroups).forEach(([pId, g]) =>
            groups.push({ key: pId, label: g.name, projectId: pId, items: g.items })
          );

          return (
            <div className="max-w-4xl space-y-4">
              {/* Summary + add button */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-3">
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500">Total Expenses</p>
                    <p className="text-lg font-semibold text-gray-900">{formatMoney(totalAmount, currency)}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500">Count</p>
                    <p className="text-lg font-semibold text-gray-900">{expenses.length}</p>
                  </div>
                </div>
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setExpenseModalOpen(true)}>
                  Add Expense
                </Button>
              </div>

              {!expensesLoaded ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl h-12 animate-pulse" />
                  ))}
                </div>
              ) : expenses.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No expenses recorded yet.</p>
                  <button
                    onClick={() => setExpenseModalOpen(true)}
                    className="mt-3 text-sm text-indigo-600 hover:underline"
                  >
                    Add the first expense
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {groups.map((g) => {
                    const groupTotal = g.items.reduce((s, e) => s + Number(e.amount ?? 0), 0);
                    return (
                      <div key={g.key}>
                        <div className="flex items-center gap-2 mb-2">
                          {g.projectId ? (
                            <FolderOpen className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <DollarSign className="w-4 h-4 text-gray-400" />
                          )}
                          {g.projectId ? (
                            <Link href={`/projects/${g.projectId}`} className="text-sm font-medium text-gray-700 hover:text-indigo-600">
                              {g.label}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-gray-700">{g.label}</span>
                          )}
                          <span className="text-xs text-gray-400">({g.items.length})</span>
                          <span className="ml-auto text-xs font-medium text-gray-500">{formatMoney(groupTotal, currency)}</span>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50/50 dark:bg-slate-800/40 text-xs text-gray-500 uppercase tracking-wide">
                                <th className="text-left px-4 py-2 font-medium">Title</th>
                                <th className="text-left px-4 py-2 font-medium">Category</th>
                                <th className="text-right px-4 py-2 font-medium">Amount</th>
                                <th className="text-left px-4 py-2 font-medium">Date</th>
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                              {g.items.map((exp) => (
                                <tr key={exp.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <p className="text-sm text-gray-800">{exp.title}</p>
                                    {exp.notes && <p className="text-xs text-gray-400 line-clamp-1">{exp.notes}</p>}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-gray-500">
                                    {({
                                      SOFTWARE_TOOLS: "Software & Tools",
                                      FREELANCER_PAYMENT: "Freelancer Payment",
                                      VENDOR_PAYMENT: "Vendor Payment",
                                      STOCK_ASSETS: "Stock Assets",
                                      PRINTING: "Printing",
                                      TRAVEL: "Travel",
                                      ADVERTISING: "Advertising",
                                      OFFICE: "Office",
                                      EQUIPMENT: "Equipment",
                                      COMMISSIONS: "Commissions",
                                      OTHER: "Other",
                                    } as Record<ExpenseCategory, string>)[exp.category]}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-800">
                                    {formatMoney(Number(exp.amount), exp.currency)}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-gray-500">
                                    {new Date(exp.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                      exp.status === "PAID" ? "bg-emerald-50 text-emerald-700"
                                        : exp.status === "APPROVED" ? "bg-blue-50 text-blue-700"
                                        : exp.status === "REJECTED" ? "bg-red-50 text-red-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}>
                                      {exp.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── RECEIPTS ── */}
        {tab === "receipts" && (() => {
          const totalReceived = receipts.reduce((s, r) => s + Number(r.amount ?? 0), 0);
          const currency = resolveClientCurrency(client, currentUser?.organization);
          const METHOD_LABELS: Record<ReceiptMethod, string> = {
            BANK_TRANSFER: "Bank Transfer",
            CASH: "Cash",
            CHECK: "Cheque",
            CARD: "Card",
            UPI: "UPI",
            OTHER: "Other",
          };

          return (
            <div className="max-w-4xl space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-3">
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500">Total Received</p>
                    <p className="text-lg font-semibold text-emerald-600">{formatMoney(totalReceived, currency)}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500">Count</p>
                    <p className="text-lg font-semibold text-gray-900">{receipts.length}</p>
                  </div>
                </div>
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => openReceiptModal()}>
                  Record Receipt
                </Button>
              </div>

              {!receiptsLoaded ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl h-12 animate-pulse" />
                  ))}
                </div>
              ) : receipts.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <ReceiptIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No payments recorded yet.</p>
                  <button
                    onClick={() => openReceiptModal()}
                    className="mt-3 text-sm text-indigo-600 hover:underline"
                  >
                    Record the first payment
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/50 dark:bg-slate-800/40 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 font-medium">Date</th>
                        <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                        <th className="text-left px-4 py-2.5 font-medium">Method</th>
                        <th className="text-left px-4 py-2.5 font-medium">Reference</th>
                        <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
                        <th className="text-left px-4 py-2.5 font-medium">Notes</th>
                        <th className="text-right px-4 py-2.5 font-medium w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {receipts.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 text-gray-700">
                            {new Date(r.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-emerald-600">
                            {formatMoney(Number(r.amount), r.currency)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{METHOD_LABELS[r.method]}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{r.reference || "—"}</td>
                          <td className="px-4 py-3 text-xs">
                            {r.invoice ? (
                              <Link href={`/invoices`} className="text-indigo-600 hover:underline">
                                {r.invoice.invoiceNumber}
                              </Link>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{r.notes || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => openReceiptModal(r)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteReceipt(r.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Expense Modal */}
      <Modal open={expenseModalOpen} onClose={() => setExpenseModalOpen(false)} title="Add Expense" width="max-w-md">
        <form onSubmit={handleAddExpense} className="space-y-4">
          {expenseError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{expenseError}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text" required
              value={expenseForm.title}
              onChange={(e) => setExpenseForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Stock photos for homepage"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount *</label>
              <input
                type="number" required step="0.01" min="0"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={expenseForm.currency}
                onChange={(e) => setExpenseForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="SOFTWARE_TOOLS">Software &amp; Tools</option>
                <option value="FREELANCER_PAYMENT">Freelancer Payment</option>
                <option value="VENDOR_PAYMENT">Vendor Payment</option>
                <option value="STOCK_ASSETS">Stock Assets</option>
                <option value="PRINTING">Printing</option>
                <option value="TRAVEL">Travel</option>
                <option value="ADVERTISING">Advertising</option>
                <option value="OFFICE">Office &amp; Overhead</option>
                <option value="EQUIPMENT">Equipment</option>
                <option value="COMMISSIONS">Commissions</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Project (optional)</label>
            <select
              value={expenseForm.projectId}
              onChange={(e) => setExpenseForm((f) => ({ ...f, projectId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">— Direct to client (no project) —</option>
              {(client?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={expenseForm.notes}
              onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Optional notes…"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={expenseSaving} className="flex-1">Add Expense</Button>
          </div>
        </form>
      </Modal>

      {/* Receipt Modal */}
      <Modal open={receiptModalOpen} onClose={() => setReceiptModalOpen(false)} title={receiptEditing ? "Edit Receipt" : "Record Receipt"} width="max-w-md">
        <form onSubmit={handleSaveReceipt} className="space-y-4">
          {receiptError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{receiptError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount *</label>
              <input
                type="number" required step="0.01" min="0"
                value={receiptForm.amount}
                onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={receiptForm.currency}
                onChange={(e) => setReceiptForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Received On</label>
              <input
                type="date"
                value={receiptForm.receivedAt}
                onChange={(e) => setReceiptForm((f) => ({ ...f, receivedAt: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
              <select
                value={receiptForm.method}
                onChange={(e) => setReceiptForm((f) => ({ ...f, method: e.target.value as ReceiptMethod }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHECK">Cheque</option>
                <option value="CARD">Card</option>
                <option value="UPI">UPI</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Linked Invoice (optional)</label>
            <select
              value={receiptForm.invoiceId}
              onChange={(e) => setReceiptForm((f) => ({ ...f, invoiceId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">— None —</option>
              {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
              <input
                type="text"
                value={receiptForm.reference}
                onChange={(e) => setReceiptForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Txn id / cheque no."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Receipt #</label>
              <input
                type="text"
                value={receiptForm.receiptNumber}
                onChange={(e) => setReceiptForm((f) => ({ ...f, receiptNumber: e.target.value }))}
                placeholder="Internal #"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={receiptForm.notes}
              onChange={(e) => setReceiptForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setReceiptModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={receiptSaving} className="flex-1">{receiptEditing ? "Save Changes" : "Record Receipt"}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Client" width="max-w-2xl">
        <ClientForm
          clientId={client.id}
          initialData={(() => {
            // Use the primary contact for the contact-side fields (falling back
            // to the legacy Client.name/email/phone for older records that
            // pre-date the company-first form).
            const primary = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
            return {
              name: primary?.name ?? client.name,
              companyName: client.companyName ?? client.name ?? "",
              email: primary?.email ?? client.email ?? "",
              phone: primary?.phone ?? client.phone ?? "",
              jobTitle: primary?.jobTitle ?? "",
              website: client.website ?? "",
              industry: client.industry ?? "",
              address: client.address ?? "",
              logoUrl: client.logoUrl ?? "",
              links: clientLinks,
              brandColors: brandColors,
              brandAssets: brandAssets,
              taxRegistrations: client.taxRegistrations ?? [],
              notes: client.notes ?? "",
              status: client.status,
              currency: client.currency ?? "",
            };
          })()}
          onSuccess={() => {
            setEditOpen(false);
            fetchClient();
          }}
        />
      </Modal>

      {/* Contact Modal */}
      <ContactModal
        open={contactModal.open}
        onClose={() => setContactModal({ open: false })}
        clientId={client.id}
        existing={contactModal.editing}
        currentPrimary={client.contacts.find((c) => c.isPrimary) ?? null}
        onSaved={handleContactSaved}
      />

      {/* ── New Project Modal ── */}
      <Modal open={projectModalOpen} title="New Project" onClose={() => setProjectModalOpen(false)} width="max-w-2xl">
        <ProjectForm
          defaultClientId={id}
          onSuccess={(newId) => {
            setProjectModalOpen(false);
            fetchClient(); // refresh project count / list
          }}
          onCancel={() => setProjectModalOpen(false)}
        />
      </Modal>

      {/* ── New Contract Modal ── */}
      <Modal open={contractModalOpen} title="New Contract / NDA" onClose={() => { setContractModalOpen(false); setClientContractForm(EMPTY_CONTRACT_FORM); setClientContractParties([{ ...EMPTY_CLIENT_PARTY }]); }} width="max-w-2xl">
        <form onSubmit={handleAddClientContract} className="space-y-5">
          {clientContractError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{clientContractError}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
            <input value={clientContractForm.title} onChange={(e) => setClientContractForm((f) => ({ ...f, title: e.target.value }))} required
              placeholder="e.g. NDA with Acme Corp"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Contract Type</label>
            <div className="grid grid-cols-3 gap-2">
              {CONTRACT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setClientContractForm((f) => ({ ...f, type: t.value }))}
                  className={`py-2 px-3 rounded-lg border-2 text-xs font-medium transition-colors ${
                    clientContractForm.type === t.value ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input type="date" value={clientContractForm.startDate} onChange={(e) => setClientContractForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input type="date" value={clientContractForm.endDate} onChange={(e) => setClientContractForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contract Value</label>
              <input type="number" step="0.01" value={clientContractForm.value} onChange={(e) => setClientContractForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="0.00 (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <select value={clientContractForm.currency} onChange={(e) => setClientContractForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Parties */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Signing Parties</label>
              <button type="button" onClick={() => setClientContractParties((p) => [...p, { ...EMPTY_CLIENT_PARTY }])}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="w-3 h-3" /> Add Party
              </button>
            </div>
            <div className="space-y-3">
              {clientContractParties.map((party, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Party {i + 1}</span>
                    {clientContractParties.length > 1 && (
                      <button type="button" onClick={() => setClientContractParties((p) => p.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 mb-2 bg-white rounded-lg border border-gray-200 p-0.5 w-fit">
                    {(["CLIENT", "STAKEHOLDER", "USER"] as ContractPartyType[]).map((t) => (
                      <button key={t} type="button" onClick={() => updateClientContractParty(i, "partyType", t)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          party.partyType === t ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {t === "USER" ? "Internal" : t === "CLIENT" ? "Client" : "External"}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {party.partyType === "CLIENT" && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Client (pre-filled)</label>
                        <input value={client.companyName || client.name} disabled
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                        />
                      </div>
                    )}
                    {/* v3: external parties are typed in directly — the name
                        and email fields below are the whole record. */}
                    {party.partyType === "USER" && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Team Member</label>
                        <select value={party.userId} onChange={(e) => updateClientContractParty(i, "userId", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">Pick user…</option>
                          {contractFormUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Name *</label>
                      <input value={party.name} onChange={(e) => updateClientContractParty(i, "name", e.target.value)}
                        placeholder="Full name"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Email</label>
                      <input type="email" value={party.email} onChange={(e) => updateClientContractParty(i, "email", e.target.value)}
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={clientContractForm.notes} onChange={(e) => setClientContractForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
              placeholder="Key terms, special clauses..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => { setContractModalOpen(false); setClientContractForm(EMPTY_CONTRACT_FORM); setClientContractParties([{ ...EMPTY_CLIENT_PARTY }]); }}>Cancel</Button>
            <Button type="submit" loading={clientContractSaving}>Create Contract</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
