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
export type QuotationStatus  = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONVERTED";
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

export type UserRole = "ADMIN" | "MANAGER" | "MEMBER";

export interface User {
  id: string;
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
  name: string;
  companyName: string;
  email: string;
  phone: string;
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

export interface Task {
  id: string;
  projectId: string;
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
  manager?: { id: string; name: string } | null;
  assignees: TaskAssignee[];
  children?: Task[];
  _count?: { children: number };
  dependsOn?: TaskDependency[];
  blockedBy?: TaskDependency[];
  createdAt: string;
  updatedAt: string;
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
  color: string;
}

// ── Rate Cards ───────────────────────────────────────────────

export interface RateCard {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  pricingType: PricingType;
  unit: string;
  unitPrice: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RateCardFormData {
  name: string;
  description: string;
  category: string;
  pricingType: PricingType;
  unit: string;
  unitPrice: string;
  currency: string;
}

// ── Quotations ───────────────────────────────────────────────

export interface QuotationLineItem {
  id: string;
  quotationId: string;
  rateCardId: string | null;
  title: string;
  description: string | null;
  pricingType: PricingType;
  quantity: number;
  unitPrice: number;
  unit: string | null;
  subtotal: number;
  order: number;
}

export interface Quotation {
  id: string;
  number: string;
  clientId: string;
  title: string;
  description: string | null;
  status: QuotationStatus;
  pricingType: PricingType;
  validUntil: string | null;
  currency: string;
  subtotal: number;
  discountType: DiscountType | null;
  discountValue: number;
  taxRate: number;
  total: number;
  notes: string | null;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string; companyName: string | null; email: string | null; logoUrl: string | null };
  lineItems: QuotationLineItem[];
  project?: { id: string; name: string } | null;
}

export interface QuotationLineItemFormData {
  id?: string;           // undefined = new item
  rateCardId: string;
  title: string;
  description: string;
  pricingType: PricingType;
  quantity: string;
  unitPrice: string;
  unit: string;
}

export interface QuotationFormData {
  clientId: string;
  title: string;
  description: string;
  pricingType: PricingType;
  validUntil: string;
  currency: string;
  discountType: DiscountType | "";
  discountValue: string;
  taxRate: string;
  notes: string;
  terms: string;
  lineItems: QuotationLineItemFormData[];
}

export interface ConvertQuotationData {
  projectName: string;
  projectType: ProjectType;
  startDate: string;
  createTasks: boolean;
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
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: { id: string; name: string; avatarUrl: string | null } | null;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
  versions?: FileVersion[];
  fileTags?: { tag: { id: string; name: string; color: string | null } }[];
  _count?: { comments: number; versions: number };
}

// ── Stakeholders ─────────────────────────────────────────────

export type StakeholderType = "FREELANCER" | "AGENCY" | "VENDOR" | "INTERNAL_TEAM";
export type StakeholderRole = "OWNER" | "ADMIN" | "EXECUTIVE" | "FINANCE" | "MANAGER" | "MEMBER";

export interface Stakeholder {
  id: string;
  name: string;
  type: StakeholderType;
  role: StakeholderRole | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  skills: string[];
  currency: string;
  defaultRate: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { expenses: number; contracts: number };
}

export interface StakeholderFormData {
  name: string;
  type: StakeholderType;
  role: StakeholderRole | "";
  email: string;
  phone: string;
  website: string;
  address: string;
  skills: string;
  notes: string;
}

// ── Expenses ─────────────────────────────────────────────────

export type ExpenseCategory =
  | "SOFTWARE_TOOLS" | "FREELANCER_PAYMENT" | "VENDOR_PAYMENT"
  | "STOCK_ASSETS" | "PRINTING" | "TRAVEL" | "ADVERTISING"
  | "OFFICE" | "EQUIPMENT" | "OTHER";

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
  stakeholderId: string | null;
  userId: string | null;
  isReimbursable: boolean;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  stakeholder?: { id: string; name: string; type: StakeholderType } | null;
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
  stakeholderId: string;
  userId: string;
  isReimbursable: boolean;
  receiptUrl: string;
  notes: string;
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
  stakeholderId: string | null;
  userId: string | null;
  name: string;
  email: string | null;
  signedAt: string | null;
  signatureNote: string | null;
  createdAt: string;
  client?: { id: string; name: string } | null;
  stakeholder?: { id: string; name: string; type: StakeholderType } | null;
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
  stakeholderId: string;
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

export interface CompanySettings {
  id: string;
  name: string;
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

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  isActive: boolean;
  createdAt: string;
}
