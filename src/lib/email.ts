import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null | undefined;

function transport(): Transporter | null {
  if (cached !== undefined) return cached;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    cached = null;
    return cached;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cached;
}

export function emailReady() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }) {
  const tx = transport();
  if (!tx) throw new Error("Email delivery is not configured.");
  await tx.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER!,
    to,
    subject,
    text,
    html,
  });
}

export function appUrl() {
  return (process.env.APP_URL || "https://agent-caller-rho.vercel.app").replace(/\/$/, "");
}

export async function sendWelcomeEmail({ to, name, businessName }: { to: string; name: string; businessName: string }) {
  const dashboard = `${appUrl()}/dashboard`;
  await sendEmail({
    to,
    subject: "Your Agent Caller workspace is ready",
    text: `Hi ${name},\n\nYour Agent Caller workspace for ${businessName} is open. Sign in at ${dashboard} to add your provider keys, connect a phone number, and start answering calls.\n\nIf you did not create this account, ignore this email.\n\n— Agent Caller`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Your Agent Caller workspace for <strong>${escapeHtml(businessName)}</strong> is open.</p><p><a href="${dashboard}">Open your dashboard</a> to add provider keys, connect a phone number, and start answering calls.</p><p style="color:#667">If you did not create this account, ignore this email.</p><p>— Agent Caller</p>`,
  });
}

export async function sendResetCodeEmail({ to, code }: { to: string; code: string }) {
  await sendEmail({
    to,
    subject: `${code} is your Agent Caller reset code`,
    text: `Your Agent Caller password reset code is ${code}. It expires in 15 minutes. If you did not ask for this, ignore this email — your password has not changed.`,
    html: `<p>Your Agent Caller password reset code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 15 minutes. If you did not ask for this, ignore this email — your password has not changed.</p>`,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
