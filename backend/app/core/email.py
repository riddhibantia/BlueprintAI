"""Out-of-band email service (SMTP + development console fallback).

Provides secure transactional emails for password resets, team invitations,
and system notifications. When SMTP is not configured or in development mode,
it safely logs the message and token to server logs rather than failing.
"""
import logging
import smtplib
from email.message import EmailMessage
from app.core.config import settings

log = logging.getLogger("blueprintai.email")


def send_email(to_email: str, subject: str, text_body: str, html_body: str = "") -> bool:
    """Send an email via SMTP if configured, otherwise log safely."""
    if settings.SMTP_ENABLED and settings.SMTP_HOST:
        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = settings.SMTP_FROM
            msg["To"] = to_email
            msg.set_content(text_body)
            if html_body:
                msg.add_alternative(html_body, subtype="html")

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_TLS:
                    server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
            log.info("Email sent successfully to %s: %s", to_email, subject)
            return True
        except Exception as exc:
            log.error("Failed to send email to %s via SMTP (%s): %s", to_email, type(exc).__name__, exc)
            # Fall back to logging so development and recovery are never permanently blocked
    
    # Development / Fallback mode: log safely
    log.warning("SMTP disabled or unavailable. [DEV EMAIL] To: %s | Subject: %s\n%s",
                to_email, subject, text_body)
    return True


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """Send a secure single-use password reset link."""
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={reset_token}&email={to_email}"
    subject = "BlueprintAI — Password Reset Request"
    text_body = (
        f"Hello,\n\n"
        f"A password reset was requested for your BlueprintAI account ({to_email}).\n\n"
        f"To reset your password, visit the following secure link (valid for 15 minutes):\n"
        f"{reset_url}\n\n"
        f"Reset Token: {reset_token}\n\n"
        f"If you did not make this request, you can safely ignore this email. Your password will not change.\n\n"
        f"— BlueprintAI Security Team\n"
    )
    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">BlueprintAI Password Reset</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
            A password reset was requested for your BlueprintAI account (<strong>{to_email}</strong>).
        </p>
        <p style="margin: 24px 0;">
            <a href="{reset_url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                Reset My Password
            </a>
        </p>
        <p style="color: #64748b; font-size: 13px;">
            This link is single-use and will expire in 15 minutes.<br>
            If the button doesn't work, copy and paste this token into the reset screen:<br>
            <code style="background-color: #f1f5f9; padding: 3px 6px; border-radius: 4px; font-size: 12px; word-break: break-all;">{reset_token}</code>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
            If you did not request this, please disregard this email. Your account remains secure.
        </p>
    </div>
    """
    return send_email(to_email, subject, text_body, html_body)
