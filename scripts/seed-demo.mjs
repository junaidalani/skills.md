import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import pg from "pg";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const email = "demo@agent-caller.com";
const password = "agent-caller-demo";

function hashPassword(value) {
  const salt = randomBytes(16);
  const derived = scryptSync(value, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const existing = await client.query(
    `select u.id from users u
     left join memberships m on m.user_id = u.id
     left join tenants t on t.id = m.tenant_id
     where u.email = $1 or t.name = 'Northstar Heating & Air'
     order by case when u.email = $1 then 0 else 1 end
     limit 1`,
    [email],
  );
  let userId;
  if (existing.rows.length) {
    userId = existing.rows[0].id;
    await client.query("update users set email = $1, password_hash = $2, name = $3 where id = $4", [email, hashPassword(password), "Taylor Morgan", userId]);
  } else {
    const inserted = await client.query(
      "insert into users (id, email, password_hash, name) values ($1, $2, $3, $4) returning id",
      [randomUUID(), email, hashPassword(password), "Taylor Morgan"],
    );
    userId = inserted.rows[0].id;
  }

  let tenantId;
  const membership = await client.query("select tenant_id from memberships where user_id = $1 limit 1", [userId]);
  if (membership.rows.length) {
    tenantId = membership.rows[0].tenant_id;
    await client.query("update tenants set status = 'active', plan_id = 'growth' where id = $1", [tenantId]);
  } else {
    const tenant = await client.query(
      "insert into tenants (id, name, slug, plan_id, status) values ($1, $2, $3, 'growth', 'active') returning id",
      [randomUUID(), "Northstar Heating & Air", `northstar-${randomUUID().slice(0, 6)}`],
    );
    tenantId = tenant.rows[0].id;
    await client.query("insert into memberships (user_id, tenant_id, role) values ($1, $2, 'owner')", [userId, tenantId]);
  }

  let agent = await client.query("select id from agents where tenant_id = $1 limit 1", [tenantId]);
  if (!agent.rows.length) {
    agent = await client.query(
      `insert into agents (id, tenant_id, name, greeting, business_info, voice_settings, service_settings)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        randomUUID(),
        tenantId,
        "Northstar call assistant",
        "Thanks for calling Northstar Heating & Air. I’m the AI assistant. How can I help today?",
        JSON.stringify({ businessName: "Northstar Heating & Air", businessHours: "Monday–Friday, 7:00 AM–6:00 PM", services: "AC repair, heating, maintenance, installation" }),
        JSON.stringify({ tone: "Warm and professional" }),
        JSON.stringify({ leadCapture: true, voicemail: true, transfer: false, appointmentBooking: false, smsTextBack: false, callRecording: false }),
      ],
    );
  }
  const agentId = agent.rows[0].id;

  await client.query("delete from calls where tenant_id = $1", [tenantId]);
  await client.query("delete from leads where tenant_id = $1", [tenantId]);

  const number = await client.query("select id from phone_numbers where tenant_id = $1 limit 1", [tenantId]);
  let numberId = number.rows[0]?.id;
  if (!numberId) {
    const insertedNumber = await client.query(
      "insert into phone_numbers (id, tenant_id, agent_id, e164, status) values ($1, $2, $3, $4, 'active') returning id",
      [randomUUID(), tenantId, agentId, "+14155550138"],
    );
    numberId = insertedNumber.rows[0].id;
  }

  const callSeeds = [
    { hoursAgo: 1, name: "Jordan Lee", phone: "+14155550127", outcome: "answered", seconds: 222, summary: "Jordan requested an urgent AC repair. Collected the service address and a callback number.", lead: { name: "Jordan Lee", phone: "+14155550127", reason: "AC repair · urgent", status: "new" } },
    { hoursAgo: 3, name: "Casey Williams", phone: "+14155550181", outcome: "answered", seconds: 138, summary: "Casey booked a system tune-up for next week and asked for a confirmation call.", lead: { name: "Casey Williams", phone: "+14155550181", reason: "System tune-up", status: "contacted" } },
    { hoursAgo: 5, name: "Sam Patel", phone: "+16285550114", outcome: "answered", seconds: 246, summary: "Sam asked for an installation quote and shared the property details.", lead: { name: "Sam Patel", phone: "+16285550114", reason: "New installation quote", status: "new" } },
    { hoursAgo: 27, name: "Alex Rivera", phone: "+14155550163", outcome: "voicemail", seconds: 114, summary: "After-hours leak report. Message saved and flagged for the morning team.", lead: { name: "Alex Rivera", phone: "+14155550163", reason: "After-hours leak", status: "new" } },
    { hoursAgo: 51, name: "Morgan Chen", phone: "+14155550192", outcome: "answered", seconds: 189, summary: "Maintenance question answered from the service list; caller asked for a callback.", lead: { name: "Morgan Chen", phone: "+14155550192", reason: "Maintenance question", status: "won" } },
    { hoursAgo: 74, name: "Priya Shah", phone: "+15105550146", outcome: "answered", seconds: 156, summary: "New-customer inquiry about heating options in an older home.", lead: { name: "Priya Shah", phone: "+15105550146", reason: "Heating options", status: "contacted" } },
  ];

  let index = 0;
  for (const seed of callSeeds) {
    const callId = randomUUID();
    const startedAt = new Date(Date.now() - seed.hoursAgo * 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + seed.seconds * 1000);
    await client.query(
      `insert into calls (id, tenant_id, agent_id, number_id, from_e164, started_at, ended_at, duration_sec, outcome, summary, cost_estimate_cents)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [callId, tenantId, agentId, numberId, seed.phone, startedAt, endedAt, seed.seconds, seed.outcome, seed.summary, Math.round((seed.seconds / 60) * 4)],
    );
    await client.query(
      "insert into transcripts (id, tenant_id, call_id, turns, summary) values ($1, $2, $3, $4, $5)",
      [
        randomUUID(),
        tenantId,
        callId,
        JSON.stringify([
          { role: "assistant", text: "Thanks for calling Northstar Heating & Air. I’m the AI assistant. How can I help today?" },
          { role: "caller", text: seed.summary },
          { role: "assistant", text: "Thanks — I’ve captured those details. What’s the best number and time for the team to call you back?" },
        ]),
        seed.summary,
      ],
    );
    await client.query(
      "insert into leads (id, tenant_id, call_id, name, phone, reason, status) values ($1, $2, $3, $4, $5, $6, $7)",
      [randomUUID(), tenantId, callId, seed.lead.name, seed.lead.phone, seed.lead.reason, seed.lead.status],
    );
    await client.query(
      "insert into usage_events (id, tenant_id, call_id, minutes, period) values ($1, $2, $3, $4, $5)",
      [randomUUID(), tenantId, callId, Math.ceil(seed.seconds / 60), new Date().toISOString().slice(0, 7)],
    );
    index += 1;
  }

  console.log(`Seeded demo login: ${email} / ${password}`);
  console.log(`Workspace: Northstar Heating & Air (${tenantId}), ${index} calls`);
} finally {
  await client.end();
}
