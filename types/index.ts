// ============================================================
// Shared TypeScript types for the Agency Management Platform
// ============================================================

export type ClientStatus     = "PROSPECT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type ProjectStatus    = "DRAFT" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
export type ProjectType      = "ONE_TIME" | "RETAINER";
export type ServiceType =
  | "website" | "social_media" | "seo" | "geo" | "gmb"
  | "branding" | "logo" | "uiux" | "video" | "photography"
  | "content" | "email_marketing" | "paid_ads" | "app_development"
  | "pr" | "other";
export type TaskStatus       = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED";
export type Priority         = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectRole      = "EDITOR" | "VIEWER";
export type PricingType      = "FIXED" | "RETAINER" | "PER_ITEM";
export type DiscountType     = "PERCENT" | "AMOUNT";

// ── Client Links ─────────────────────────────────────────────

export type ClientLinkType =
  | "logo" | "drive" | "dropbox" | "figma" | "notion"
  | "github" | "website" | "other";

export interface ClientLink {
  id: string;
  label: string;
  url: string;
  type: ClientLinkType;
}

// ── Brand Types ──────────────────────────────────────────────

export type ColorTag =
  | "primary" | "secondary" | "tertiary" | "accent"
  | "background" | "surface" | "text" | "link"
  | "success" | "warning" | "error" | "other";

export type AssetType =
  | "logo" | "icon" | "wordmark" | "guidelines"
  | "typography" | "illustration" | "photography"
  | "pattern" | "social_kit" | "stationery" | "other";

export interface BrandColor {
  id: string;
  hex: string;
  name: string;
  tag: ColorTag;
}

export interface BrandAsset {
  id: string;
  name: string;
  type: AssetType;
  variant: string;
  url: string;
  format: string;
  notes: string;
}

// ── Tax / Billing ────────────────────────────────────────────

export interface TaxRegistration {
  id: string;
  type: string;
  number: string;
  country: string;
}

// ── Users ────────────────────────────────────────────────────

// v3: four permission tiers. MEMBER is the retired v2 tier, kept so rows
// created before the migration still typecheck.
export type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "SMM" | "TEAM" | "MEMBER";

/** v3: a job label an agency defines for itself — never a permission. */
export interface DesignationRole {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  canBeAssignedWork: boolean;
  sortOrder: number;
  _count?: { users: number };
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
}

// ── Client ───────────────────────────────────────────────────

export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  s3Key: string;
  createdAt: string;
}

export interface ClientProject {
  id: string;
  name: string;
  status: ProjectStatus;
  type: ProjectType;
  startDate: string | null;
  endDate: string | null;
}

export interface Client {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  address: string | null;
  logoUrl: string | null;
  links: ClientLink[] | null;
  brandColors: BrandColor[] | null;
  brandAssets: BrandAsset[] | null;
  taxRegistrations: TaxRegistration[] | null;
  notes: string | null;
  status: ClientStatus;
  /** v2: overrides the org currency for everything client-scoped (null = inherit) */
  currency?: string | null;
  /** v2: attention level */
  importance?: "NORMAL" | "IMPORTANT" | "VIP";
  createdAt: string;
  updatedAt: string;
  contacts: ClientContact[];
  files: ClientFile[];
  projects: ClientProject[];
  _count: { projects: number };
}

export type ClientSummary = Pick<
  Client,
  "id" | "name" | "companyName" | "email" | "phone" | "logoUrl" | "status" | "industry" | "createdAt"
> & {
  contacts: Pick<ClientContact, "id" | "name" | "jobTitle" | "isPrimary">[];
  _count: { projects: number };
};

export interface ClientFormData {
  /** Primary contact person's full name */
  name: string;
  /** Company / organization name — the main client identifier */
  companyName: string;
  email: string;
  phone: string;
  /** Primary contact person's job title / role */
  jobTitle: string;
  website: string;
  industry: string;
  address: string;
  logoUrl: string;
  links: ClientLink[];
  brandColors: BrandColor[];
  brandAssets: BrandAsset[];
  taxRegistrations: TaxRegistration[];
  notes: string;
  status: ClientStatus;
  /** v2: "" = inherit organization currency */
  currency?: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  isPrimary: boolean;
}

// ── Projects ─────────────────────────────────────────────────

export interface Project {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  type: ProjectType;
  serviceType: string | null;
  recurringFrequency: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string; logoUrl: string | null };
  tasks?: Task[];
  _count?: { tasks: number };
  progress?: number;
}

export interface ProjectFormData {
  clientId: string;
  name: string;
  description: string;
  type: ProjectType;
  serviceType: string;
  recurringFrequency: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  // ── v3: the project is the commercial unit ──
  /** What the client pays per cycle (ONE_TIME: the whole price). */
  cycleAmount?: string;
  cycleStartDate?: string;
  /** Empty/absent = open-ended. */
  cycleEndDate?: string;
  deliverables?: { creativeTypeId: string; qtyPerCycle: string }[];
  members?: { userId: string; role: "SMM" | "CONTRIBUTOR" }[];
}

/** One line of the deal: "15 × Reel per cycle". */
export interface ProjectDeliverable {
  id: string;
  projectId: string;
  creativeTypeId: string;
  qtyPerCycle: number;
  notes: string | null;
  sortOrder: number;
  creativeType: { id: string; name: string; icon: string | null; color: string | null };
}

/** One billing period of a project — "Aug 2026". */
export interface ProjectCycle {
  id: string;
  projectId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  closedById: string | null;
  closedBy?: { id: string; name: string } | null;
  invoiceId: string | null;
}

// ── Tasks ─────────────────────────────────────────────────────

export interface TaskAssignee {
  userId: string;
  user: User;
}

export interface TaskDependency {
  taskId: string;
  dependsOnId: string;
  dependsOn?: { id: string; title: string; status: TaskStatus };
  task?: { id: string; title: string; status: TaskStatus };
}

export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string | null;
  hours: number;
  date: string;
  notes: string | null;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

export type CommentType = "COMMENT" | "UPDATE";

export interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  type: CommentType;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string; avatarUrl: string | null } | null;
}

// ── v2 Content Calendar ──────────────────────────────────────

export type ContentStatus =
  | "PLANNED" | "ASSIGNED" | "IN_PROGRESS" | "IN_REVIEW"
  | "TEAM_APPROVED" | "CLIENT_APPROVED" | "SCHEDULED" | "POSTED" | "MISSED"
  // v3 submit -> review loop (prisma ContentStatus). These were missing here
  // while the database happily produced them, so any lookup keyed on status
  // came back undefined.
  | "SUBMITTED" | "APPROVED";

export interface CreativeType {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  countsAsShoot: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ContentItemTask {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string | null;
  assignmentStatus?: string;
  assignees: { user: { id: string; name: string; avatarUrl: string | null } }[];
}

export interface ContentItem {
  id: string;
  clientId: string;
  projectId: string | null;
  date: string;
  creativeTypeId: string;
  creativeType: CreativeType;
  topic: string;
  description: string | null;
  referenceUrl: string | null;
  referenceFileId: string | null;
  status: ContentStatus;
  isExtra: boolean;
  isAdHoc: boolean;
  carriedFromId: string | null;
  carriedFrom?: { id: string; date: string } | null;
  countAgainstPrevMonth: boolean;
  postedAt: string | null;
  teamApprovedAt: string | null;
  clientApprovedAt: string | null;
  invoicedInId: string | null;
  reviewToken?: string | null;
  createdBy?: { id: string; name: string } | null;
  client?: { id: string; name: string };
  tasks: ContentItemTask[];
  createdAt: string;
  updatedAt: string;
  /** v3: which project planned this — drives the client roll-up */
  project?: { id: string; name: string } | null;
  /** v3: which billing cycle it belongs to */
  cycleId?: string | null;
  billingIntent?: "INCLUDED" | "EXTRA_BILLABLE" | "COMPLIMENTARY";
  carryMode?: "INSIDE_QUOTA" | "ABOVE_QUOTA" | null;
}

export type AssignmentStatus = "NONE" | "PENDING_HEAD_APPROVAL" | "APPROVED" | "REASSIGNED";
export type DeliveryMethod = "FILE_UPLOAD" | "LINK" | "WHATSAPP" | "SLACK" | "OTHER";

export interface TaskDeliveryRecord {
  id: string;
  method: DeliveryMethod;
  url: string | null;
  note: string | null;
  deliveredAt: string;
  deliveredBy?: { id: string; name: string } | null;
  file?: { id: string; name: string; url: string | null } | null;
}

export interface TaskChangeRequest {
  id: string;
  note: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  requestedBy?: { id: string; name: string } | null;
}

export interface TaskHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  note: string | null;
  changedBy?: { id: string; name: string } | null;
}

export interface Task {
  id: string;
  /** v2: null for general tasks (no project) */
  projectId: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  order: number;
  progress: number;
  estimatedHours: number | null;
  loggedHours: number;
  isClientVisible: boolean;
  showSubtasksToClient: boolean;
  // ── v2 fields ──
  topic?: string | null;
  content?: string | null;
  referenceUrl?: string | null;
  referenceFileId?: string | null;
  extraNote?: string | null;
  clientId?: string | null;
  contentItemId?: string | null;
  preferredAssigneeId?: string | null;
  assignmentStatus?: AssignmentStatus;
  sortOrder?: number;
  isAdHoc?: boolean;
  client?: { id: string; name: string } | null;
  preferredAssignee?: { id: string; name: string } | null;
  manager?: { id: string; name: string } | null;
  assignees: TaskAssignee[];
  children?: Task[];
  _count?: { children: number };
  dependsOn?: TaskDependency[];
  blockedBy?: TaskDependency[];
  createdAt: string;
  updatedAt: string;  /** v3: the project this belongs to — drives the auto lists on /tasks */
  project?: { id: string; name: string } | null;
  /** v3: what kind of work this is */
  kind?: "PLANNING" | "CONTENT_WORK" | "POST" | "GENERAL" | "PERSONAL";
  /** v3: bumped each time the approver asks for changes */
  revision?: number;
  approverId?: string | null;
  /** v3: the SMM who reviews this work, resolved for display. */
  approver?: { id: string; name: string } | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
}

export interface TaskFormData {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  parentId: string | null;
  managerId: string | null;
  assigneeIds: string[];
  estimatedHours: string;
  // v2 (all optional so old call sites keep compiling)
  topic?: string;
  content?: string;
  referenceUrl?: string;
  referenceFileId?: string | null;
  extraNote?: string;
  clientId?: string;
  preferredAssigneeId?: string;
}

// ── Task Templates ───────────────────────────────────────────

export interface TaskTemplateItem {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  order: number;
  offsetDays: number | null;
  parentOrder: number | null;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  projectType: ProjectType | null;
  items: TaskTemplateItem[];
}

// ── Calendar ─────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;          // ISO date string
  endDate?: string;      // For range events (projects)
  type: "task" | "project";
  status: string;
  priority?: Priority;
  projectId?: string;
  projectName?: string;
  clientName?: string;
  clientId?: string;
  assignees?: string[];
  color: string;
}

// ── Folders ──────────────────────────────────────────────────

export type FolderScope = "PROJECT" | "CLIENT" | "COMMON";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  scope: FolderScope;
  projectId: string | null;
  clientId: string | null;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  children?: Folder[];
  files?: AssetFile[];
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  _count?: { files: number; children: number };
}

export interface FolderFormData {
  name: string;
  scope: FolderScope;
  parentId: string;
  projectId: string;
  clientId: string;
  description: string;
  color: string;
}

// ── Files & Assets ───────────────────────────────────────────

export type FileStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "CHANGES_REQUIRED";
export type FileCommentStatus = "OPEN" | "RESOLVED";
export type MimeCategory = "image" | "video" | "pdf" | "doc" | "other";

export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  s3Key: string;
  url: string | null;
  thumbnailUrl: string | null;
  size: number;
  notes: string | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface FileComment {
  id: string;
  fileId: string;
  versionId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  posX: number | null;
  posY: number | null;
  timestamp: number | null;
  page: number | null;
  status: FileCommentStatus;
  parentId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string; avatarUrl: string | null } | null;
  replies?: FileComment[];
  task?: { id: string; title: string } | null;
}

export interface AssetFile {
  id: string;
  name: string;
  mimeType: string;
  mimeCategory: MimeCategory;
  size: number;
  s3Key: string;
  url: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  status: FileStatus;
  isShared: boolean;
  folderId: string | null;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: { id: string; name: string; avatarUrl: string | null; role?: string } | null;
  folder?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
  versions?: FileVersion[];
  fileTags?: { tag: { id: string; name: string; color: string | null } }[];
  _count?: { comments: number; versions: number };
}

// ── Expenses ─────────────────────────────────────────────────

export type ExpenseCategory =
  | "SOFTWARE_TOOLS" | "FREELANCER_PAYMENT" | "VENDOR_PAYMENT"
  | "STOCK_ASSETS" | "PRINTING" | "TRAVEL" | "ADVERTISING"
  | "OFFICE" | "EQUIPMENT" | "COMMISSIONS" | "OTHER";

export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface Expense {
  id: string;
  title: string;
  description: string | null;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  date: string;
  status: ExpenseStatus;
  projectId: string | null;
  clientId: string | null;
  userId: string | null;
  isReimbursable: boolean;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string; companyName: string | null } | null;
  user?: { id: string; name: string } | null;
}

export interface ExpenseFormData {
  title: string;
  description: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  date: string;
  status: ExpenseStatus;
  projectId: string;
  clientId: string;
  userId: string;
  isReimbursable: boolean;
  receiptUrl: string;
  notes: string;
}

// ── Receipts (payments received from clients) ─────────────────

export type ReceiptMethod =
  | "BANK_TRANSFER" | "CASH" | "CHECK" | "CARD" | "UPI" | "OTHER";

export interface Receipt {
  id: string;
  clientId: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  receivedAt: string;
  method: ReceiptMethod;
  reference: string | null;
  receiptNumber: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string; companyName: string | null } | null;
  invoice?: { id: string; invoiceNumber: string } | null;
}

export interface ReceiptFormData {
  clientId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  receivedAt: string;
  method: ReceiptMethod;
  reference: string;
  receiptNumber: string;
  notes: string;
  attachmentUrl: string;
}

// ── Contracts ─────────────────────────────────────────────────

export type ContractType = "NDA" | "SERVICE_AGREEMENT" | "EMPLOYMENT" | "FREELANCE" | "PARTNERSHIP" | "OTHER";
export type ContractStatus = "DRAFT" | "SENT" | "PARTIALLY_SIGNED" | "FULLY_SIGNED" | "EXPIRED" | "TERMINATED";
export type ContractPartyType = "CLIENT" | "STAKEHOLDER" | "USER";

export interface ContractParty {
  id: string;
  contractId: string;
  partyType: ContractPartyType;
  clientId: string | null;
  userId: string | null;
  name: string;
  email: string | null;
  signedAt: string | null;
  signatureNote: string | null;
  createdAt: string;
  client?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface Contract {
  id: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  projectId: string | null;
  clientId: string | null;
  fileId: string | null;
  startDate: string | null;
  endDate: string | null;
  value: number | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  parties: ContractParty[];
}

export interface ContractPartyFormData {
  partyType: ContractPartyType;
  clientId: string;
  userId: string;
  name: string;
  email: string;
}

export interface ContractFormData {
  title: string;
  type: ContractType;
  projectId: string;
  clientId: string;
  startDate: string;
  endDate: string;
  value: string;
  currency: string;
  notes: string;
  parties: ContractPartyFormData[];
}

// ── Invoices ──────────────────────────────────────────────────

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string | null;
  order: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  projectId: string | null;
  clientId: string;
  status: InvoiceStatus;
  dueDate: string | null;
  currency: string;
  discountPct: number | null;
  taxPct: number | null;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: InvoiceLineItem[];
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string; companyName: string | null } | null;
}

// ── API helpers ───────────────────────────────────────────────

export interface ApiError {
  error: string;
}

// ── Messaging / Chat ──────────────────────────────────────────

export type ChannelType = "GENERAL" | "PROJECT_INTERNAL" | "PROJECT_CLIENT" | "CLIENT" | "DIRECT";
export type ChannelMemberRole = "ADMIN" | "MEMBER";

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: ChannelType;
  projectId: string | null;
  clientId: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string; companyName: string | null } | null;
  members?: ChannelMember[];
  _count?: { messages: number; members: number };
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
}

export interface ChannelMember {
  channelId: string;
  userId: string;
  role: ChannelMemberRole;
  lastReadAt: string | null;
  joinedAt: string;
  user: { id: string; name: string; avatarUrl: string | null; role: string };
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  taskId: string | null;
  parentId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string; avatarUrl: string | null } | null;
  task?: { id: string; title: string } | null;
  attachments?: MessageAttachmentItem[];
  replies?: ChatMessage[];
}

export interface MessageAttachmentItem {
  id: string;
  messageId: string;
  fileId: string;
  file: {
    id: string;
    name: string;
    mimeType: string;
    mimeCategory: string;
    size: number;
    url: string | null;
    thumbnailUrl: string | null;
  };
}

export interface LetterheadConfig {
  logoPosition: "left" | "center" | "right";
  logoSize:     "sm" | "md" | "lg";
  headerBg:     string;
  headerTextColor: "light" | "dark";
  showPhone:    boolean;
  showEmail:    boolean;
  showWebsite:  boolean;
  showAddress:  boolean;
  showAgencyName: boolean;
  footerAlign:  "left" | "center" | "right";
  showFooterDate: boolean;
  showFooterPageNum: boolean;
  font: "sans" | "serif";
}

/**
 * The Organization is the multi-tenant root. Every user, client, project,
 * invoice, etc. belongs to exactly one Organization. Its details (name,
 * logo, address, tax IDs) are used as the agency letterhead on all PDFs.
 */
export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  dateFormat: string;
  taxRegistrations: TaxRegistration[] | null;
  letterheadLogoUrl: string | null;
  letterheadHeader: string | null;
  letterheadFooter: string | null;
  letterheadAddress: string | null;
  letterheadPhone: string | null;
  letterheadEmail: string | null;
  letterheadWebsite: string | null;
  letterheadColor: string;
  letterheadTemplate: string;
  letterheadConfig: string | null;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Kept only for backwards compat during migration. Use Organization. */
export type CompanySettings = Organization;

export type Designation =
  | "SMM" | "DESIGNER" | "EDITOR" | "HEAD_OF_DESIGN"
  | "PHOTOGRAPHER" | "SME" | "POC" | "OTHER";

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  /** v2 enum, deprecated — read only for pre-v3 rows */
  designation?: Designation | null;
  /** v3: the job label row this person holds */
  jobTitle?: Pick<DesignationRole, "id" | "name" | "slug" | "canBeAssignedWork"> | null;
  isActive: boolean;
  createdAt: string;
}
