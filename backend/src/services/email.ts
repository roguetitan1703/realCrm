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

// Mix a hex toward white by t (0..1) for a soft on-brand fill/border in email
// clients (which need inline, opacity-free colors).
function mixWhite(hex: string, t: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return '#E8F1EC';
  const c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  const out = c.map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
  return `#${out}`;
}

/** Send a login OTP, branded to the tenant (name + accent colour). */
export async function sendOtpEmail(to: string, code: string, firmName?: string, brandColor?: string): Promise<void> {
  const firm = firmName || 'your workspace';
  const accent = /^#?[a-f\d]{6}$/i.test(String(brandColor || '')) ? brandColor! : '#1E6F52';
  const wash = mixWhite(accent, 0.9);
  const line = mixWhite(accent, 0.72);
  const subject = `${code} is your ${firm} login code`;
  const text =
    `Your login code for ${firm} is ${code}.\n\n` +
    `It expires in 5 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;padding:8px">
      <p style="color:#23231f;font-size:13px;font-weight:700;letter-spacing:0.4px;margin:0 0 14px">${firm}</p>
      <p style="color:#23231f;font-size:15px;margin:0 0 16px">Your login code is:</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:${accent};background:${wash};border:1px solid ${line};border-radius:10px;text-align:center;padding:16px 0;margin:0 0 16px">${code}</div>
      <p style="color:#77756e;font-size:13px;line-height:1.5;margin:0 0 18px">It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
      <p style="color:#9a988f;font-size:11px;margin:0;border-top:1px solid #eee;padding-top:12px">Real Estate by Delpat</p>
    </div>`;
  await sendMail({ to, subject, html, text });
}
