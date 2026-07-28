/**
 * ============================================================================
 * ✉️  EMAIL — transactional mail via SMTP (AWS SES, Gmail, or any SMTP host)
 * ============================================================================
 * A single lazily-built nodemailer transporter driven by env. If the SMTP creds
 * are absent, email is simply disabled (emailConfigured() === false) and callers
 * fall back to their other channel — nothing throws at import time. Used today to
 * deliver login OTPs; the same sendMail() serves any future transactional mail.
 * ============================================================================
 */

import nodemailer, { Transporter } from 'nodemailer';

const HOST = process.env.EMAIL_HOST || '';
const PORT = parseInt(process.env.EMAIL_PORT || '587', 10);
const SECURE = process.env.EMAIL_SECURE === 'true';        // true for 465, false for 587/STARTTLS
const USER = process.env.EMAIL_USER || '';
const PASS = process.env.EMAIL_PASSWORD || '';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Real Estate by Delpat';
// SES SMTP usernames aren't valid From addresses; let the sender be set explicitly.
const FROM_ADDRESS = process.env.EMAIL_FROM || USER;

let transporter: Transporter | null = null;
const configured = Boolean(HOST && USER && PASS);

if (configured) {
  transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE,
    auth: { user: USER, pass: PASS },
  });
  console.log(`[Email] SMTP configured (${HOST}:${PORT}).`);
} else {
  console.log('[Email] SMTP not configured (no EMAIL_HOST/USER/PASSWORD). Email delivery disabled.');
}

export function emailConfigured(): boolean {
  return configured;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }): Promise<void> {
  if (!transporter) throw new Error('Email not configured');
  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/** Send a login OTP. `firmName` brands the message to the tenant. */
export async function sendOtpEmail(to: string, code: string, firmName?: string): Promise<void> {
  const firm = firmName || 'your workspace';
  const subject = `${code} is your ${firm} login code`;
  const text =
    `Your login code for ${firm} is ${code}.\n\n` +
    `It expires in 5 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;padding:8px">
      <p style="color:#23231f;font-size:15px;margin:0 0 16px">Your login code for <strong>${firm}</strong> is:</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#1E6F52;background:#E8F1EC;border:1px solid #C4DDD0;border-radius:10px;text-align:center;padding:16px 0;margin:0 0 16px">${code}</div>
      <p style="color:#77756e;font-size:13px;line-height:1.5;margin:0">It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`;
  await sendMail({ to, subject, html, text });
}
