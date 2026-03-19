"""
Gmail SMTP email service for sending BCS donation receipts.
Requires a Gmail App Password — see .env for setup instructions.
"""
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List

from .config import settings


def send_receipt_email(
    to_emails: List[str],
    member_name: str,
    receipt_number: str,
    event_name: str,
    amount: float,
    receipt_pdf: bytes,
) -> None:
    """
    Send a BCS donation receipt PDF via Gmail SMTP.

    Raises:
        RuntimeError  – if SMTP credentials are not configured
        smtplib.SMTPException – on delivery failure
    """
    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP credentials are not configured. "
            "Set SMTP_USERNAME and SMTP_PASSWORD in your .env file."
        )

    # ── Build message ──────────────────────────────────────────────────────────
    msg           = MIMEMultipart('mixed')
    msg['From']   = f'Bengali Cultural Society <{settings.SMTP_USERNAME}>'
    msg['To']     = ', '.join(to_emails)
    msg['Subject'] = f'BCS Donation Receipt – {receipt_number}'

    # HTML body
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
      <div style="background:#1E3F8A; padding:20px; text-align:center; border-radius:8px 8px 0 0;">
        <h1 style="color:white; margin:0; font-size:22px; font-style:italic;">
          Bengali Cultural Society
        </h1>
        <p style="color:#C9D8F5; margin:4px 0 0; font-size:12px;">
          P.O. Box 2045, Voorhees, NJ 08003 &nbsp;|&nbsp; EIN: 22-2424690
        </p>
      </div>

      <div style="border:1px solid #d0d8ee; border-top:none; padding:28px; border-radius:0 0 8px 8px;">
        <p style="font-size:15px;">Dear <strong>{member_name}</strong>,</p>
        <p style="font-size:14px; color:#555;">
          Thank you for your generous contribution to the Bengali Cultural Society.
          Please find your official donation receipt attached to this email.
        </p>

        <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px;">
          <tr style="background:#f4f7fe;">
            <td style="padding:10px 14px; color:#1E3F8A; font-weight:bold; width:160px;">Receipt No.</td>
            <td style="padding:10px 14px;">{receipt_number}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; color:#1E3F8A; font-weight:bold;">Amount</td>
            <td style="padding:10px 14px; font-weight:bold; color:#1a7a1a;">${amount:,.2f}</td>
          </tr>
          <tr style="background:#f4f7fe;">
            <td style="padding:10px 14px; color:#1E3F8A; font-weight:bold;">For</td>
            <td style="padding:10px 14px;">{event_name}</td>
          </tr>
        </table>

        <p style="font-size:12px; color:#777; border-top:1px solid #eee; padding-top:16px;">
          BCS is a 501(c)(3) non-profit organization (EIN: 22-2424690).
          Your contribution may be tax-deductible to the extent allowed by law.
          Please retain this receipt for your records.
        </p>

        <p style="font-size:14px; margin-top:24px;">
          With gratitude,<br/>
          <strong style="color:#1E3F8A;">Bengali Cultural Society</strong>
        </p>
      </div>
    </body>
    </html>
    """
    msg.attach(MIMEText(html_body, 'html'))

    # PDF attachment
    pdf_part = MIMEBase('application', 'pdf')
    pdf_part.set_payload(receipt_pdf)
    encoders.encode_base64(pdf_part)
    safe_num = receipt_number.replace('/', '-')
    pdf_part.add_header(
        'Content-Disposition',
        f'attachment; filename="BCS_Receipt_{safe_num}.pdf"',
    )
    msg.attach(pdf_part)

    # ── Send via Gmail SMTP ────────────────────────────────────────────────────
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.sendmail(settings.SMTP_USERNAME, to_emails, msg.as_string())
