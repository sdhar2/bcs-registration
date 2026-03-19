"""
BCS Donation Receipt PDF Generator
Produces a letter-size PDF styled to match the official BCS receipt template.
"""
import io
import os
from datetime import date
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

# ── Constants ──────────────────────────────────────────────────────────────────

PAGE_W, PAGE_H = letter          # 612 × 792 pts
MARGIN         = 0.75 * inch     # 54 pts
CONTENT_W      = PAGE_W - 2 * MARGIN

BLUE  = colors.HexColor('#1E3F8A')   # BCS navy blue
BLACK = colors.black

ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'assets')


def _asset(name: str):
    """Return full path to an asset file, or None if it doesn't exist."""
    path = os.path.join(ASSETS_DIR, name)
    return path if os.path.exists(path) else None


# ── Amount → English words ─────────────────────────────────────────────────────

_ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
]
_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _int_to_words(n: int) -> str:
    """Recursively convert a non-negative integer to English words."""
    if n == 0:
        return ''
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + (' ' + _ONES[n % 10] if n % 10 else '')
    if n < 1_000:
        return _ONES[n // 100] + ' Hundred' + (' ' + _int_to_words(n % 100) if n % 100 else '')
    if n < 1_000_000:
        return _int_to_words(n // 1_000) + ' Thousand' + (' ' + _int_to_words(n % 1_000) if n % 1_000 else '')
    if n < 1_000_000_000:
        return _int_to_words(n // 1_000_000) + ' Million' + (' ' + _int_to_words(n % 1_000_000) if n % 1_000_000 else '')
    return _int_to_words(n // 1_000_000_000) + ' Billion' + (' ' + _int_to_words(n % 1_000_000_000) if n % 1_000_000_000 else '')


def dollars_to_words(amount) -> str:
    """Convert a dollar amount (Decimal/float/int) to written English."""
    try:
        val      = float(amount)
        dollars  = int(val)
        cents    = round((val - dollars) * 100)
        d_words  = _int_to_words(dollars) or 'Zero'
        c_str    = 'No Cents' if cents == 0 else f'{_int_to_words(cents)} Cent{"s" if cents != 1 else ""}'
        return f'{d_words} Dollars and {c_str}'
    except Exception:
        return str(amount)


# ── Member display name ────────────────────────────────────────────────────────

def member_display_name(first: str, spouse, last: str) -> str:
    """Return 'First and Spouse Last' or 'First Last'."""
    if spouse and str(spouse).strip():
        return f'{first} and {spouse.strip()} {last}'
    return f'{first} {last}'


# ── PDF Generation ─────────────────────────────────────────────────────────────

def generate_receipt_pdf(
    member_name: str,
    receipt_number: str,
    receipt_date: date,
    amount,
    event_name: str,
) -> bytes:
    """Generate and return a BCS donation receipt as PDF bytes."""

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)

    top = PAGE_H - MARGIN   # y of top margin line

    # ── Logo (top-left) ────────────────────────────────────────────────────────
    logo_size = 1.15 * inch
    logo_path = _asset('logo.png')

    if logo_path:
        c.drawImage(
            logo_path,
            MARGIN, top - logo_size,
            width=logo_size, height=logo_size,
            preserveAspectRatio=True, mask='auto',
        )
    else:
        # Placeholder box
        c.setStrokeColor(BLUE)
        c.setFillColor(colors.HexColor('#EEF3FB'))
        c.setLineWidth(1.2)
        c.rect(MARGIN, top - logo_size, logo_size, logo_size, fill=1)
        c.setFillColor(BLUE)
        c.setFont('Helvetica-Bold', 7)
        c.drawCentredString(MARGIN + logo_size / 2, top - logo_size / 2 - 3, 'BCS LOGO')

    # ── Org name & address (centred in right portion) ──────────────────────────
    hdr_left  = MARGIN + logo_size + 0.25 * inch
    hdr_right = PAGE_W - MARGIN
    hdr_cx    = (hdr_left + hdr_right) / 2

    c.setFillColor(BLUE)
    c.setFont('Times-BoldItalic', 26)
    c.drawCentredString(hdr_cx, top - 0.32 * inch, 'Bengali Cultural Society')

    c.setFont('Times-Italic', 9.5)
    c.drawCentredString(hdr_cx, top - 0.60 * inch, 'P.O. Box 2045, Voorhees, NJ 08003')
    c.drawCentredString(hdr_cx, top - 0.78 * inch,
                        '(A Non-Profit Organization under Section 501(a) of the IRS Code Section 501(c)(3).)')
    c.drawCentredString(hdr_cx, top - 0.96 * inch, 'EIN: 22-2424690')

    # ── Receipt No. & Date (right-aligned, below org text) ────────────────────
    right_x   = PAGE_W - MARGIN
    rno_y     = top - 1.22 * inch

    c.setFillColor(BLUE)
    c.setFont('Times-BoldItalic', 10)
    label_rno  = 'Receipt No.:'
    label_date = 'Date:'
    val_rno    = f'  {receipt_number}'
    val_date   = f'  {receipt_date.strftime("%-m/%-d/%Y")}'

    # right-align the combined label+value string
    c.drawRightString(right_x, rno_y,            label_rno  + val_rno)
    c.drawRightString(right_x, rno_y - 0.20 * inch, label_date + val_date)

    # ── Thin rule ─────────────────────────────────────────────────────────────
    rule_y = rno_y - 0.10 * inch
    c.setStrokeColor(BLUE)
    c.setLineWidth(0.6)
    c.line(MARGIN, rule_y, PAGE_W - MARGIN, rule_y)

    # ── "Received with thanks from …   [$xxx.xx] " row ───────────────────────
    row_y = rule_y - 0.42 * inch

    # Blue italic label
    c.setFillColor(BLUE)
    c.setFont('Times-BoldItalic', 11)
    label_txt = 'Received with thanks from'
    c.drawString(MARGIN, row_y, label_txt)

    # Member name
    label_w = c.stringWidth(label_txt, 'Times-BoldItalic', 11)
    name_x  = MARGIN + label_w + 0.18 * inch
    c.setFillColor(BLACK)
    c.setFont('Times-Italic', 12)
    c.drawString(name_x, row_y, member_name)

    # Amount box (right side, bordered)
    amt_str = f'${float(amount):,.2f}'
    box_w   = 1.35 * inch
    box_h   = 0.28 * inch
    box_x   = PAGE_W - MARGIN - box_w
    box_y   = row_y - 0.05 * inch
    c.setStrokeColor(BLACK)
    c.setLineWidth(1.5)
    c.rect(box_x, box_y, box_w, box_h, fill=0)
    c.setFillColor(BLACK)
    c.setFont('Helvetica-Bold', 12)
    c.drawCentredString(box_x + box_w / 2, box_y + 0.065 * inch, amt_str)

    # ── Amount in words ────────────────────────────────────────────────────────
    words_y = row_y - 0.38 * inch
    c.setFillColor(BLACK)
    c.setFont('Times-Italic', 12)
    c.drawString(MARGIN, words_y, dollars_to_words(amount))

    # ── "For the purpose of:" ──────────────────────────────────────────────────
    purpose_label_y = words_y - 0.48 * inch
    c.setFillColor(BLUE)
    c.setFont('Times-BoldItalic', 10)
    c.drawString(MARGIN, purpose_label_y, 'For the purpose of:')

    c.setFillColor(BLACK)
    c.setFont('Helvetica', 11)
    c.drawString(MARGIN, purpose_label_y - 0.26 * inch, event_name)

    # ── Received By + Signature ────────────────────────────────────────────────
    sig_label_y = purpose_label_y - 1.10 * inch
    sig_path    = _asset('signature.png')

    # "Received By" text (centred right half of page)
    sig_cx = (PAGE_W / 2 + PAGE_W - MARGIN) / 2
    c.setFillColor(BLUE)
    c.setFont('Times-BoldItalic', 11)
    c.drawCentredString(sig_cx, sig_label_y, 'Received By')

    sig_img_w = 1.80 * inch
    sig_img_h = 0.70 * inch
    sig_img_x = sig_cx - sig_img_w / 2
    sig_img_y = sig_label_y - sig_img_h - 0.05 * inch

    if sig_path:
        c.drawImage(
            sig_path,
            sig_img_x, sig_img_y,
            width=sig_img_w, height=sig_img_h,
            preserveAspectRatio=True, mask='auto',
        )
    else:
        # Plain underline
        c.setStrokeColor(BLACK)
        c.setLineWidth(0.75)
        c.line(sig_img_x, sig_label_y - 0.55 * inch,
               sig_img_x + sig_img_w, sig_label_y - 0.55 * inch)

    c.save()
    buffer.seek(0)
    return buffer.read()
