"""
VDOT Adopt-a-Highway application submission Lambda.

Accepts an applicant's info plus one or more road segments selected on the
/vdot map (pulled live from VDOT/VGIN ArcGIS services by the frontend), fills
out the official VDOT Adopt-A-Highway Permit Application PDF, and emails it
as an attachment via SES.

The blank PDF (vdot_aah_application.pdf) is bundled into the Lambda zip
alongside this file by terraform/vdot.tf. It is the official VDOT AcroForm
found at:
https://www.vdot.virginia.gov/media/vdotvirginiagov/about/programs/adopt-a-highway/Adopt-a-Highway-Application_acc10182023_PM.pdf

Recipient note: while this feature is being piloted, completed applications
are sent to a fixed reviewer address rather than directly to the county's
VDOT residency coordinator, so a human can spot-check submissions before they
reach VDOT. The resolved coordinator (if known) is included in the email body
for reference/forwarding.
"""
import base64
import json
import os
import io
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

import boto3
from botocore.exceptions import ClientError
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader

from vdot_coordinators import get_coordinator

aws_region = os.environ.get('AWS_REGION', 'us-east-1')
ses_client = boto3.client('ses', region_name=aws_region)

SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'info@waterwaycleanups.org')
RECIPIENT_EMAIL = os.environ.get('RECIPIENT_EMAIL', 'jesse@techno-geeks.org')
CC_EMAIL = os.environ.get('CC_EMAIL', 'jesse@waterwaycleanups.org')
ORG_NAME = 'Waterway Cleanups'

PDF_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), 'vdot_aah_application.pdf')

# 0-indexed page number and rect (x0, y0, x1, y1 in PDF points, origin at
# bottom-left) of the "Applicants Signature" field on the official AAH form.
# This field is a real /Sig AcroForm field (a digital signature field), not
# a text field, so pypdf can't fill it with an image/value the normal way --
# instead we draw the applicant's captured signature directly onto the page
# at this position via a reportlab overlay merged on top with pypdf.
SIGNATURE_PAGE_INDEX = 1
SIGNATURE_RECT = (180.6, 233.28, 413.64, 254.16)

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json',
}

GROUP_TYPE_MAP = {
    'family_friends': '/Family/friends',
    'individual': '/Individual',
    'business': '/Business',
    'community_group': '/Community Group',
    'faith_based': '/Faith-based organization',
    'private_club': '/Private Club',
    'government_military': '/Government/military',
    'school_group': '/School Group',
    'other': '/Miscellaneous/other',
}


def respond(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body),
    }


def _truncate(value, max_len):
    value = value or ''
    return value if len(value) <= max_len else value[: max_len - 1] + '\u2026'


def build_route_summary(segments, route_begin=None, route_end=None):
    """Combine one or more selected (contiguous) segments into the four
    Route Info fields on the PDF (Name of Route / Section Begin / Section
    End / Number of miles).

    The official form describes a single contiguous stretch of road, so it
    should show exactly one begin point and one end point for the whole
    selection -- not one pair per individual segment. The frontend enforces
    contiguity and computes the two true dead-end locations of the selected
    chain (skipping over the junctions where segments meet each other), and
    passes them as route_begin/route_end. If those aren't provided (e.g. an
    older client or a direct API call), fall back to the first segment's
    begin and the last segment's end as a reasonable approximation.
    """
    route_names = []
    total_miles = 0.0

    for seg in segments:
        name = (seg.get('routeName') or seg.get('streetName') or 'Unnamed road').strip()
        miles = seg.get('miles')
        try:
            miles = float(miles)
        except (TypeError, ValueError):
            miles = 0.0
        total_miles += miles
        route_names.append(name)

    # De-duplicate route names while preserving order.
    seen = set()
    unique_routes = []
    for n in route_names:
        if n not in seen:
            seen.add(n)
            unique_routes.append(n)

    begin = (route_begin or '').strip()
    end = (route_end or '').strip()
    if not begin and segments:
        begin = (segments[0].get('fromDesc') or segments[0].get('begin') or '').strip()
    if not end and segments:
        end = (segments[-1].get('toDesc') or segments[-1].get('end') or '').strip()

    return {
        'route': _truncate('; '.join(unique_routes), 200),
        'begin': _truncate(begin, 250),
        'end': _truncate(end, 250),
        'miles': f"{total_miles:.2f}",
    }


def decode_signature_image(signature_image):
    """Decode a `data:image/png;base64,...` (or bare base64) string from the
    frontend's signature canvas into raw image bytes, or return None if it's
    missing/unparseable.
    """
    if not signature_image:
        return None
    try:
        if ',' in signature_image and signature_image.strip().startswith('data:'):
            signature_image = signature_image.split(',', 1)[1]
        return base64.b64decode(signature_image)
    except (ValueError, TypeError) as e:
        print(f"Error decoding signature image: {e}")
        return None


def build_signature_overlay(page_width, page_height, signature_bytes):
    """Build a single-page PDF (as bytes) the same size as the target AAH
    page, with the applicant's signature image drawn at SIGNATURE_RECT. This
    gets merged onto the real page with pypdf's merge_page.
    """
    img = ImageReader(io.BytesIO(signature_bytes))
    img_w, img_h = img.getSize()

    x0, y0, x1, y1 = SIGNATURE_RECT
    box_w, box_h = x1 - x0, y1 - y0
    # Scale to fit the signature line's box while preserving aspect ratio;
    # never upscale a small/low-res signature beyond its natural size.
    scale = min(box_w / img_w, box_h / img_h, 1.0)
    draw_w, draw_h = img_w * scale, img_h * scale
    draw_x = x0 + 2  # small left inset so the stroke doesn't touch the line's start
    draw_y = y0 + (box_h - draw_h) / 2  # vertically centered in the box

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(page_width, page_height))
    c.drawImage(img, draw_x, draw_y, width=draw_w, height=draw_h, mask='auto', preserveAspectRatio=True)
    c.showPage()
    c.save()
    return buf.getvalue()


def fill_pdf(applicant, segments, route_begin=None, route_end=None, signature_image=None, signature_date=None):
    """Fill the AAH AcroForm PDF and return the resulting bytes."""
    route_summary = build_route_summary(segments, route_begin, route_end)

    field_values = {
        'Name of Adopting Group / Individual': applicant.get('groupName', ''),
        'Desired title or group name for AAH Sign': _truncate(applicant.get('signTitle', ''), 48),
        'Primary Contact': applicant.get('primaryContactName', ''),
        'Email Address': applicant.get('primaryEmail', ''),
        'Phone home': applicant.get('primaryPhoneHome', ''),
        'work phone': applicant.get('primaryPhoneWork', ''),
        'Mailing Address': applicant.get('primaryAddress', ''),
        'City': applicant.get('primaryCity', ''),
        'State': applicant.get('primaryState', 'VA'),
        'Zipcode': applicant.get('primaryZip', ''),
        'Secondary Contact': applicant.get('secondaryContactName', ''),
        'Email Address_2': applicant.get('secondaryEmail', ''),
        'Phone home_2': applicant.get('secondaryPhoneHome', ''),
        'work_2': applicant.get('secondaryPhoneWork', ''),
        'Mailing Address_2': applicant.get('secondaryAddress', ''),
        'City_2': applicant.get('secondaryCity', ''),
        'State_2': applicant.get('secondaryState', ''),
        'Zipcode_2': applicant.get('secondaryZip', ''),
        'Number of persons between the ages of 10 and 17 participating': str(applicant.get('minorsCount', '0')),
        'Number of Adults participating': str(applicant.get('adultsCount', '')),
        'safety precautions': applicant.get('safetyPrecautions', ''),
        'Name of Route': route_summary['route'],
        'Section Begin': route_summary['begin'],
        'Section End': route_summary['end'],
        'Number of miles': route_summary['miles'],
        'Applicant Signature Date': signature_date or '',
    }
    # Drop empty values so we don't blank out any default field appearance.
    field_values = {k: v for k, v in field_values.items() if v not in (None, '')}

    group_type = GROUP_TYPE_MAP.get(applicant.get('groupType'))
    if group_type:
        field_values['Type of Group'] = group_type

    reader = PdfReader(PDF_TEMPLATE_PATH)
    writer = PdfWriter()
    writer.append(reader)

    for page in writer.pages:
        writer.update_page_form_field_values(page, field_values, auto_regenerate=False)
    writer.set_need_appearances_writer(True)

    signature_bytes = decode_signature_image(signature_image)
    if signature_bytes:
        try:
            sig_page = writer.pages[SIGNATURE_PAGE_INDEX]
            overlay_bytes = build_signature_overlay(
                float(sig_page.mediabox.width), float(sig_page.mediabox.height), signature_bytes
            )
            overlay_page = PdfReader(io.BytesIO(overlay_bytes)).pages[0]
            sig_page.merge_page(overlay_page)
        except Exception as e:
            # Don't fail the whole submission over a bad signature image --
            # the rest of the application is still valid and useful without
            # it, so log and continue rather than raising.
            print(f"Error drawing signature onto PDF: {e}")

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def build_segments_text(segments):
    lines = []
    for i, seg in enumerate(segments, 1):
        name = seg.get('routeName') or seg.get('streetName') or 'Unnamed road'
        jurisdiction = seg.get('jurisdiction', '')
        miles = seg.get('miles', '')
        from_desc = seg.get('fromDesc') or seg.get('begin') or ''
        to_desc = seg.get('toDesc') or seg.get('end') or ''
        parts = [f"{i}. {name}"]
        if jurisdiction:
            parts.append(f"({jurisdiction})")
        if from_desc or to_desc:
            parts.append(f"from {from_desc or '?'} to {to_desc or '?'}")
        if miles:
            parts.append(f"~{miles} mi")
        lines.append(' '.join(parts))
    return '\n'.join(lines) if lines else 'No segment details provided.'


def resolve_coordinator(segments):
    for seg in segments:
        jurisdiction = seg.get('jurisdiction')
        if jurisdiction:
            coord = get_coordinator(jurisdiction)
            if coord:
                return coord
    return None


def build_email(applicant, segments, pdf_bytes):
    group_name = applicant.get('groupName', 'Unnamed group')
    segments_text = build_segments_text(segments)
    coordinator = resolve_coordinator(segments)

    coordinator_line = (
        f"Suggested VDOT residency coordinator: {coordinator['residency']} "
        f"<{coordinator['email']}>"
        if coordinator
        else "Suggested VDOT residency coordinator: not automatically resolved for the selected segment(s); "
             "look one up at https://www.virginiadot.org/programs/prog-aah-coords.asp"
    )

    text_body = f"""A new VDOT Adopt-a-Highway application was submitted through waterwaycleanups.org/vdot.

Group/Individual: {group_name}
Primary contact: {applicant.get('primaryContactName', '')} <{applicant.get('primaryEmail', '')}>

Selected road segment(s):
{segments_text}

{coordinator_line}

The completed application PDF is attached. Please review before forwarding
to the VDOT coordinator.
"""

    html_body = f"""<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height:1.5;">
<h2>New VDOT Adopt-a-Highway Application</h2>
<p>Submitted through <a href="https://waterwaycleanups.org/vdot/">waterwaycleanups.org/vdot</a>.</p>
<p><strong>Group/Individual:</strong> {group_name}<br/>
<strong>Primary contact:</strong> {applicant.get('primaryContactName', '')}
&lt;{applicant.get('primaryEmail', '')}&gt;</p>
<p><strong>Selected road segment(s):</strong></p>
<pre style="background:#f3f4f6; padding:12px; border-radius:6px; white-space:pre-wrap;">{segments_text}</pre>
<p>{coordinator_line}</p>
<p>The completed application PDF is attached. Please review before forwarding to the VDOT coordinator.</p>
</body></html>"""

    msg = MIMEMultipart('mixed')
    msg['Subject'] = f"VDOT Adopt-a-Highway Application: {group_name}"
    msg['From'] = f"{ORG_NAME} <{SENDER_EMAIL}>"
    msg['To'] = RECIPIENT_EMAIL
    msg['Cc'] = CC_EMAIL
    reply_to = applicant.get('primaryEmail') or SENDER_EMAIL
    msg['Reply-To'] = reply_to

    body = MIMEMultipart('alternative')
    body.attach(MIMEText(text_body, 'plain', 'utf-8'))
    body.attach(MIMEText(html_body, 'html', 'utf-8'))
    msg.attach(body)

    safe_name = ''.join(c for c in group_name if c.isalnum() or c in (' ', '-', '_')).strip() or 'application'
    filename = f"VDOT-AAH-Application-{safe_name}.pdf".replace(' ', '-')

    part = MIMEApplication(pdf_bytes, _subtype='pdf')
    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
    msg.attach(part)

    return msg


def validate_applicant(applicant):
    errors = []
    if not applicant.get('groupName'):
        errors.append('groupName is required')
    if not applicant.get('signTitle'):
        errors.append('signTitle is required')
    if not applicant.get('primaryContactName'):
        errors.append('primaryContactName is required')
    if not applicant.get('primaryEmail'):
        errors.append('primaryEmail is required')
    return errors


def handle_submit(body):
    applicant = body.get('applicant') or {}
    segments = body.get('segments') or []
    route_begin = body.get('routeBegin')
    route_end = body.get('routeEnd')
    signature_image = body.get('signatureImage')
    signature_date = body.get('signatureDate')

    errors = validate_applicant(applicant)
    if not segments:
        errors.append('At least one road segment must be selected')
    if not signature_image:
        errors.append('A signature is required')
    if errors:
        return respond(400, {'success': False, 'message': '; '.join(errors)})

    try:
        pdf_bytes = fill_pdf(applicant, segments, route_begin, route_end, signature_image, signature_date)
    except Exception as e:
        print(f"Error filling PDF: {e}")
        return respond(500, {'success': False, 'message': 'Failed to generate application PDF'})

    try:
        msg = build_email(applicant, segments, pdf_bytes)
        ses_client.send_raw_email(
            Source=SENDER_EMAIL,
            Destinations=[RECIPIENT_EMAIL, CC_EMAIL],
            RawMessage={'Data': msg.as_string()},
        )
    except ClientError as e:
        print(f"SES error sending application email: {e}")
        return respond(502, {'success': False, 'message': 'Failed to send application email'})
    except Exception as e:
        print(f"Unexpected error sending application email: {e}")
        return respond(500, {'success': False, 'message': 'Unexpected error sending application email'})

    return respond(200, {
        'success': True,
        'message': "Your application has been submitted! We'll review it and send it to the appropriate "
                    "VDOT Adopt-a-Highway coordinator.",
    })


def handler(event, context):
    method = event.get('httpMethod', '')

    if method == 'OPTIONS':
        return respond(200, {'message': 'CORS preflight successful'})

    if method != 'POST':
        return respond(405, {'success': False, 'message': 'Method not allowed'})

    try:
        body = json.loads(event.get('body') or '{}')
    except (json.JSONDecodeError, TypeError):
        return respond(400, {'success': False, 'message': 'Invalid JSON'})

    return handle_submit(body)
