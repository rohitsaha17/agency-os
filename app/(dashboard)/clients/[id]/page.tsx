"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Edit2, Trash2, Plus, Star, Mail, Phone,
  Globe, MapPin, Building2, FileText, FolderOpen,
  ExternalLink, Check, X, Pencil, Receipt, HardDrive, ChevronRight,
  Link2, HardDriveIcon, Image, MessageSquare, Hash, Upload,
  DollarSign, Clock, CheckCircle2, AlertCircle, Send, Users,
} from "lucide-react";
import { BrandAssetsEditor } from "@/components/clients/BrandAssetsEditor";
import type { BrandColor, BrandAsset, ClientLink } from "@/types";
import { Button } from "@/components/ui/Button";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ClientForm } from "@/components/clients/ClientForm";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Client, ContactFormData, ClientContact, ProjectStatus, ProjectType, Quotation, AssetFile, ContractType, ContractPartyType, Stakeholder, User, Invoice, InvoiceStatus, Channel, ChatMessage } from "@/types";
import { ClientHealthCard } from "@/components/ai/ClientHealthCard";

// ── helpers ──────────────────────────────────────────────────
type Tab = "overview" | "contacts" | "brand" | "tax" | "projects" | "quotations" | "files" | "contracts" | "chat" | "invoices";

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
  partyType: ContractPartyType; clientId: string; stakeholderId: string;
  userId: string; name: string; email: string;
};
const EMPTY_CLIENT_PARTY: ClientPartyDraft = {
  partyType: "CLIENT", clientId: "", stakeholderId: "", userId: "", name: "", email: "",
};

// ── Contact Form (inline modal) ──────────────────────────────
function ContactModal({
  open, onClose, clientId, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  existing?: ClientContact;
  onSaved: (c: ClientContact) => void;
}) {
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
      if (!res.ok) throw new Error(data.error);
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
  const canManageChannels = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [contactModal, setContactModal] = useState<{ open: boolean; editing?: ClientContact }>({ open: false });
  const [archiving, setArchiving] = useState(false);
  const [brandColors, setBrandColors] = useState<BrandColor[]>([]);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [clientLinks, setClientLinks] = useState<ClientLink[]>([]);
  const [savingBrand, setSavingBrand] = useState(false);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [quotationsLoaded, setQuotationsLoaded] = useState(false);
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [clientContracts, setClientContracts] = useState<import("@/types").Contract[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
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
  const [quotationModalOpen, setQuotationModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [clientContractForm, setClientContractForm] = useState(EMPTY_CONTRACT_FORM);
  const [clientContractSaving, setClientContractSaving] = useState(false);
  const [clientContractError, setClientContractError] = useState<string | null>(null);
  const [clientContractParties, setClientContractParties] = useState<ClientPartyDraft[]>([{ ...EMPTY_CLIENT_PARTY }]);
  const [contractFormStakeholders, setContractFormStakeholders] = useState<Pick<Stakeholder, "id" | "name">[]>([]);
  const [contractFormUsers, setContractFormUsers] = useState<Pick<User, "id" | "name" | "email">[]>([]);

  const fetchClient = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
    if (tab === "quotations" && !quotationsLoaded) {
      fetch(`/api/quotations?clientId=${id}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setQuotations(d); setQuotationsLoaded(true); });
    }
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
  }, [tab, id, quotationsLoaded, filesLoaded, contractsLoaded, invoicesLoaded, channelsLoaded, activeChannel, teamUsers]);

  // Load stakeholders + users when contract modal opens
  useEffect(() => {
    if (contractModalOpen && contractFormStakeholders.length === 0) {
      Promise.all([
        fetch("/api/stakeholders").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
      ]).then(([s, u]) => {
        setContractFormStakeholders(Array.isArray(s) ? s : []);
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
      if (k === "stakeholderId" && v) {
        const s = contractFormStakeholders.find((s) => s.id === v);
        if (s) updated.name = s.name;
      }
      if (k === "userId" && v) {
        const u = contractFormUsers.find((u) => u.id === v);
        if (u) { updated.name = u.name; updated.email = u.email; }
      }
      if (k === "partyType") {
        updated.clientId = ""; updated.stakeholderId = ""; updated.userId = "";
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
        const msg = data?.error || "Failed to create contract";
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
        body: JSON.stringify({ body: composeText.trim(), authorName: "You" }),
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

  const initials = client.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",    label: "Overview" },
    { id: "contacts",    label: `Contacts (${client.contacts.length})` },
    { id: "brand",       label: `Brand (${brandColors.length + brandAssets.length})` },
    { id: "tax",         label: "Tax & Billing" },
    { id: "projects",    label: `Projects (${client.projects.length})` },
    { id: "quotations",  label: "Quotations" },
    { id: "invoices",    label: "Invoices" },
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
              <img src={client.logoUrl} alt={client.name} className="w-14 h-14 rounded-xl object-contain border border-gray-200 bg-gray-50 p-1" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center">
                <span className="text-base font-bold text-indigo-600">{initials}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{client.name}</h1>
                <StatusBadge status={client.status} />
              </div>
              {client.companyName && (
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> {client.companyName}
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
        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="max-w-2xl space-y-6">
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

            {/* AI Client Health */}
            <ClientHealthCard data={{
              clientName: client.name,
              projectCount: client.projects.length,
              activeProjects: client.projects.filter((p: any) => p.status === "ACTIVE").length,
              completedProjects: client.projects.filter((p: any) => p.status === "COMPLETED").length,
              totalRevenue: invoices
                .filter((inv) => inv.status === "PAID")
                .reduce((sum, inv) => sum + (inv.lineItems ?? []).reduce((s, li) => s + Number(li.unitPrice) * Number(li.quantity), 0), 0),
              overdueTasksCount: 0, // Would need task data
              avgProjectProgress: client.projects.length > 0
                ? Math.round(client.projects.reduce((sum: number, p: any) => sum + (p.progress || 0), 0) / client.projects.length)
                : 0,
              lastActivityDate: client.updatedAt,
              contractsActive: clientContracts.filter((c) => c.status === "FULLY_SIGNED" || c.status === "PARTIALLY_SIGNED").length,
              unpaidInvoices: invoices.filter((inv) => inv.status === "SENT" || inv.status === "OVERDUE").length,
              expenseTotal: 0,
              communicationFrequency: client.projects.some((p: any) => p.status === "ACTIVE") ? "medium" : "low",
            }} />

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
        )}

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
                <Receipt className="w-4 h-4 text-gray-400" />
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
                  <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-2" />
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

        {/* ── QUOTATIONS ── */}
        {tab === "quotations" && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{quotations.length} quotation{quotations.length !== 1 ? "s" : ""}</p>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setQuotationModalOpen(true)}>New Quotation</Button>
            </div>

            {!quotationsLoaded ? (
              <div className="space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : quotations.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No quotations yet.</p>
                <button onClick={() => setQuotationModalOpen(true)} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
                  Create first quotation
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {quotations.map((q) => {
                  const statusColor = {
                    DRAFT: "bg-gray-100 text-gray-600",
                    SENT: "bg-blue-50 text-blue-700",
                    APPROVED: "bg-emerald-50 text-emerald-700",
                    REJECTED: "bg-red-50 text-red-600",
                    EXPIRED: "bg-yellow-50 text-yellow-700",
                    CONVERTED: "bg-indigo-50 text-indigo-700",
                  }[q.status] ?? "bg-gray-100 text-gray-600";
                  return (
                    <Link
                      key={q.id}
                      href={`/quotations/${q.id}`}
                      className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 truncate">{q.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{q.number}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-700">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: q.currency, maximumFractionDigits: 0 }).format(Number(q.total))}
                        </span>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor}`}>
                          {q.status.charAt(0) + q.status.slice(1).toLowerCase()}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-400" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FILES ── */}
        {tab === "files" && (() => {
          const commonFiles = files.filter((f) => !f.projectId);
          const projectFiles = files.filter((f) => !!f.projectId);
          const projectGroups = projectFiles.reduce<Record<string, { name: string; files: AssetFile[] }>>((acc, f) => {
            const pId = f.projectId!;
            if (!acc[pId]) acc[pId] = { name: f.project?.name ?? "Project", files: [] };
            acc[pId].files.push(f);
            return acc;
          }, {});

          const FileCard = ({ f }: { f: AssetFile }) => (
            <Link
              key={f.id}
              href="/files"
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-300 transition-colors group"
            >
              {f.mimeCategory === "image" && f.url ? (
                <img src={f.url} alt={f.name} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 bg-gray-50 flex items-center justify-center">
                  <HardDrive className="w-8 h-8 text-gray-300" />
                </div>
              )}
              <div className="px-3 py-2">
                <p className="text-xs font-medium text-gray-800 truncate">{f.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{f.status}</p>
              </div>
            </Link>
          );

          return (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{files.length} file{files.length !== 1 ? "s" : ""}</p>
                <Link href={`/files?clientId=${id}`}>
                  <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>Upload Files</Button>
                </Link>
              </div>

              {/* Upload zone */}
              <Link
                href={`/files?clientId=${id}`}
                className="block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
              >
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Drop files here or click to upload</p>
                <p className="text-xs text-gray-400 mt-1">Files will be linked to this client</p>
              </Link>

              {!filesLoaded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[1,2,3].map((i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl aspect-square animate-pulse" />
                  ))}
                </div>
              ) : files.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <HardDrive className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No files uploaded yet.</p>
                  <Link href={`/files?clientId=${id}`} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
                    Go to Files
                  </Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Client Common Files */}
                  {commonFiles.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FolderOpen className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-medium text-gray-700">Client Common</h3>
                        <span className="text-xs text-gray-400">({commonFiles.length})</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {commonFiles.map((f) => <FileCard key={f.id} f={f} />)}
                      </div>
                    </div>
                  )}

                  {/* Per-Project File Groups */}
                  {Object.entries(projectGroups).map(([pId, group]) => (
                    <div key={pId}>
                      <div className="flex items-center gap-2 mb-3">
                        <FolderOpen className="w-4 h-4 text-indigo-400" />
                        <Link href={`/projects/${pId}`} className="text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors">
                          {group.name}
                        </Link>
                        <span className="text-xs text-gray-400">({group.files.length})</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {group.files.map((f) => <FileCard key={f.id} f={f} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── INVOICES ── */}
        {tab === "invoices" && (() => {
          const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0), 0);
          const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
          const totalPaid = paidInvoices.reduce((sum, inv) => sum + inv.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0), 0);
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
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: invoices[0]?.currency ?? "USD", maximumFractionDigits: 0 }).format(value)}
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
                        const amount = inv.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/invoices/${inv.id}`} className="font-medium text-gray-900 hover:text-indigo-600 font-mono text-xs">
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
                              {new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency, maximumFractionDigits: 0 }).format(amount)}
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
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Client" width="max-w-2xl">
        <ClientForm
          clientId={client.id}
          initialData={{
            name: client.name,
            companyName: client.companyName ?? "",
            email: client.email ?? "",
            phone: client.phone ?? "",
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
          }}
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

      {/* ── New Quotation Modal ── */}
      <Modal open={quotationModalOpen} title="New Quotation" onClose={() => setQuotationModalOpen(false)} width="max-w-4xl">
        <QuotationBuilder
          initialData={{ clientId: id }}
          onSuccess={(newId) => {
            setQuotationModalOpen(false);
            setQuotationsLoaded(false); // force refresh when tab is visited
          }}
          onCancel={() => setQuotationModalOpen(false)}
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
                        {t === "USER" ? "Internal" : t === "CLIENT" ? "Client" : "Stakeholder"}
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
                    {party.partyType === "STAKEHOLDER" && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Stakeholder</label>
                        <select value={party.stakeholderId} onChange={(e) => updateClientContractParty(i, "stakeholderId", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">Pick stakeholder…</option>
                          {contractFormStakeholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    )}
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
