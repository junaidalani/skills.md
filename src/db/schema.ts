import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    resetCodeHash: text("reset_code_hash"),
    resetCodeExpiresAt: timestamp("reset_code_expires_at", { withTimezone: true }),
    resetAttempts: integer("reset_attempts").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    planId: text("plan_id").default("starter").notNull(),
    status: text("status").default("trial").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("tenants_slug_unique").on(table.slug)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    role: text("role").default("owner").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("memberships_user_tenant_unique").on(table.userId, table.tenantId),
    index("memberships_tenant_idx").on(table.tenantId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").default("Front desk agent").notNull(),
    greeting: text("greeting").default("Thanks for calling. I’m the AI assistant for this business. How can I help?").notNull(),
    systemPrompt: text("system_prompt").default("Be helpful, concise, and never collect payment card details.").notNull(),
    businessInfo: jsonb("business_info").$type<Record<string, unknown>>().default({}),
    voiceSettings: jsonb("voice_settings").$type<Record<string, unknown>>().default({}),
    transferRules: jsonb("transfer_rules").$type<Record<string, unknown>>().default({}),
    afterHours: jsonb("after_hours").$type<Record<string, unknown>>().default({}),
    serviceSettings: jsonb("service_settings").$type<Record<string, unknown>>().default({}),
    language: text("language").default("en-US").notNull(),
    active: boolean("active").default(true).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agents_tenant_idx").on(table.tenantId)],
);

export const phoneNumbers = pgTable(
  "phone_numbers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    e164: text("e164").notNull(),
    telnyxNumberId: text("telnyx_number_id"),
    telnyxOrderId: text("telnyx_order_id"),
    status: text("status").default("pending").notNull(),
    forwardFrom: text("forward_from"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("phone_numbers_e164_unique").on(table.e164),
    index("phone_numbers_tenant_idx").on(table.tenantId),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    numberId: uuid("number_id").references(() => phoneNumbers.id, { onDelete: "set null" }),
    externalCallId: text("external_call_id"),
    fromE164: text("from_e164"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec").default(0).notNull(),
    outcome: text("outcome").default("answered").notNull(),
    recordingUrl: text("recording_url"),
    costEstimateCents: integer("cost_estimate_cents").default(0).notNull(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calls_tenant_external_unique").on(table.tenantId, table.externalCallId),
    index("calls_tenant_started_idx").on(table.tenantId, table.startedAt),
    index("calls_tenant_outcome_idx").on(table.tenantId, table.outcome),
  ],
);

export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }).notNull(),
  turns: jsonb("turns").$type<Array<{ role: string; text: string; at?: string }>>().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("transcripts_call_unique").on(table.callId), index("transcripts_tenant_idx").on(table.tenantId)]);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    reason: text("reason"),
    fields: jsonb("fields").$type<Record<string, unknown>>().default({}),
    status: text("status").default("new").notNull(),
    notes: text("notes"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("leads_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    keyCiphertext: text("key_ciphertext"),
    keyLast4: text("key_last4"),
    keyVersion: integer("key_version").default(1).notNull(),
    mode: text("mode").default("byok").notNull(),
    status: text("status").default("not-tested").notNull(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestResult: text("last_test_result"),
    monthlySpendCapCents: integer("monthly_spend_cap_cents"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("provider_credentials_tenant_kind_unique").on(table.tenantId, table.kind),
    index("provider_credentials_tenant_idx").on(table.tenantId),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    minutes: integer("minutes").default(0).notNull(),
    billed: boolean("billed").default(false).notNull(),
    period: text("period").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("usage_events_tenant_period_idx").on(table.tenantId, table.period)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").default("trialing").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("subscriptions_tenant_unique").on(table.tenantId)],
);

export const widgetKeys = pgTable(
  "widget_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    publicKey: text("public_key").notNull(),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().default([]),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("widget_keys_public_unique").on(table.publicKey), uniqueIndex("widget_keys_tenant_unique").on(table.tenantId), index("widget_keys_tenant_idx").on(table.tenantId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target"),
    ip: text("ip"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_log_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    kind: text("kind").notNull(),
    configCiphertext: text("config_ciphertext"),
    status: text("status").default("not-connected").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("integrations_tenant_kind_unique").on(table.tenantId, table.kind)],
);

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});
