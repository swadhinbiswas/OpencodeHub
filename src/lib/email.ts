/**
 * Email Service
 * Handles sending emails using nodemailer
 */

import { logger } from "./logger";

const SMTP_HOST = import.meta.env.SMTP_HOST;
const SMTP_PORT = parseInt(import.meta.env.SMTP_PORT || "587");
const SMTP_USER = import.meta.env.SMTP_USER;
const SMTP_PASSWORD = import.meta.env.SMTP_PASSWORD;
const SMTP_FROM = import.meta.env.SMTP_FROM || "noreply@opencodehub.local";
const SITE_URL = import.meta.env.SITE_URL || "http://localhost:4321";

export interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

let transporter: any = null;

async function getTransporter() {
    if (transporter) return transporter;

    if (!SMTP_HOST) {
        logger.warn("SMTP not configured, emails will be logged only");
        return null;
    }

    try {
        const nodemailer = await import("nodemailer");
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: SMTP_USER ? {
                user: SMTP_USER,
                pass: SMTP_PASSWORD,
            } : undefined,
        });

        // Verify connection
        await transporter.verify();
        logger.info("SMTP connection verified");
        return transporter;
    } catch (error) {
        logger.error({ error }, "Failed to create SMTP transporter");
        return null;
    }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
    try {
        const transport = await getTransporter();

        if (!transport) {
            // Log email for development/testing
            logger.info({
                to: options.to,
                subject: options.subject
            }, "Email would be sent (SMTP not configured)");
            return true;
        }

        await transport.sendMail({
            from: SMTP_FROM,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
        });

        logger.info({ to: options.to, subject: options.subject }, "Email sent");
        return true;
    } catch (error) {
        logger.error({ error, to: options.to }, "Failed to send email");
        return false;
    }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resetUrl = `${SITE_URL}/reset-password?token=${token}`;

    return sendEmail({
        to: email,
        subject: "Reset your OpenCodeHub password",
        text: `
You requested a password reset for your OpenCodeHub account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.
    `.trim(),
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0d1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #161b22; border-radius: 12px; border: 1px solid #30363d;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 24px; color: #f0f6fc; font-size: 24px;">Reset Your Password</h1>
              <p style="margin: 0 0 24px; color: #8b949e; font-size: 16px; line-height: 1.5;">
                You requested a password reset for your OpenCodeHub account. Click the button below to set a new password.
              </p>
              <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #22d3ee, #a855f7); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Reset Password
              </a>
              <p style="margin: 24px 0 0; color: #6e7681; font-size: 14px;">
                This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #30363d;">
              <p style="margin: 0; color: #6e7681; font-size: 12px;">
                © ${new Date().getFullYear()} OpenCodeHub. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    });
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const verifyUrl = `${SITE_URL}/verify-email?token=${token}`;

    return sendEmail({
        to: email,
        subject: "Verify your OpenCodeHub email",
        text: `
Welcome to OpenCodeHub!

Please verify your email by clicking the link below:
${verifyUrl}

This link will expire in 24 hours.
    `.trim(),
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0d1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #161b22; border-radius: 12px; border: 1px solid #30363d;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 24px; color: #f0f6fc; font-size: 24px;">Welcome to OpenCodeHub! 🎉</h1>
              <p style="margin: 0 0 24px; color: #8b949e; font-size: 16px; line-height: 1.5;">
                Thanks for signing up! Please verify your email address to get started.
              </p>
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #22d3ee, #a855f7); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Verify Email
              </a>
              <p style="margin: 24px 0 0; color: #6e7681; font-size: 14px;">
                This link will expire in 24 hours.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #30363d;">
              <p style="margin: 0; color: #6e7681; font-size: 12px;">
                © ${new Date().getFullYear()} OpenCodeHub. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    });
}
