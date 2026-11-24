#!/usr/bin/env python3
"""Build the AUCA pharmacy project proposal as a Word document."""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
FIGURES = DOCS / "figures"
LOGO = DOCS / "auca-logo.png"
OUT = DOCS / "auca-pharmacy-proposal.docx"

SERIF = "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf"
SERIF_BOLD = "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf"

NAVY = (10, 58, 107)
BLUE = (0, 90, 171)
PALE = (244, 247, 251)
LINE = (186, 204, 220)
INK = (28, 36, 48)
WHITE = (255, 255, 255)


def font(size, bold=False):
    return ImageFont.truetype(SERIF_BOLD if bold else SERIF, size)


def rounded(draw, box, radius, fill, outline, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def center_text(draw, center, text, fnt, fill):
    x, y = center
    lines = text.split("\n")
    heights = []
    widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=fnt)
        widths.append(bbox[2] - bbox[0])
        heights.append(bbox[3] - bbox[1])
    total = sum(heights) + (len(lines) - 1) * 6
    top = y - total / 2
    for line, width, height in zip(lines, widths, heights):
        draw.text((x - width / 2, top), line, font=fnt, fill=fill)
        top += height + 6


def draw_architecture():
    image = Image.new("RGB", (1600, 780), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((40, 28), "Pharmacie Ubuzima", font=font(28, True), fill=NAVY)
    boxes = [
        (40, 150, 440, 460, "Browser", "Cashier, pharmacist,\nstock keeper, dispenser,\nand administrator"),
        (580, 150, 1020, 460, "Web application", "Next.js, TypeScript,\nand Tailwind\n\nSales, stock, bills,\nprescriptions, orders,\ninsurance, settings"),
        (1160, 150, 1560, 460, "Database", "PostgreSQL\n\nAn embedded database\nis used when no server\nis configured"),
    ]
    for x1, y1, x2, y2, heading, text in boxes:
        rounded(draw, (x1, y1, x2, y2), 18, PALE, NAVY, 3)
        draw.rectangle((x1, y1, x2, y1 + 58), fill=NAVY)
        center_text(draw, ((x1 + x2) / 2, y1 + 29), heading, font(22, True), WHITE)
        center_text(draw, ((x1 + x2) / 2, (y1 + 58 + y2) / 2 + 6), text, font(20), INK)

    def arrow(x1, x2, y):
        draw.line((x1, y, x2 - 18, y), fill=BLUE, width=4)
        draw.polygon([(x2, y), (x2 - 18, y - 10), (x2 - 18, y + 10)], fill=BLUE)

    arrow(440, 580, 305)
    arrow(1020, 1160, 305)
    draw.text((462, 258), "requests", font=font(16), fill=BLUE)
    draw.text((1040, 258), "records", font=font(16), fill=BLUE)
    rounded(draw, (580, 530, 1020, 720), 18, WHITE, BLUE, 3)
    center_text(
        draw,
        (800, 625),
        "Printed output\nReceipt, purchase order,\ndelivery note, claim form",
        font(20),
        NAVY,
    )
    draw.line((800, 460, 800, 530), fill=BLUE, width=4)
    path = FIGURES / "figure-1-architecture.png"
    image.save(path, "PNG")
    return path


def ellipse_box(cx, cy, w, h):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def draw_actor(draw, x, y, name):
    draw.ellipse((x - 16, y - 78, x + 16, y - 46), outline=NAVY, width=3)
    draw.line((x, y - 46, x, y - 8), fill=NAVY, width=3)
    draw.line((x - 28, y - 32, x + 28, y - 32), fill=NAVY, width=3)
    draw.line((x, y - 8, x - 22, y + 28), fill=NAVY, width=3)
    draw.line((x, y - 8, x + 22, y + 28), fill=NAVY, width=3)
    label = font(18, True)
    bbox = draw.textbbox((0, 0), name, font=label)
    draw.text((x - (bbox[2] - bbox[0]) / 2, y + 36), name, font=label, fill=NAVY)


def draw_usecases():
    image = Image.new("RGB", (1800, 1280), WHITE)
    draw = ImageDraw.Draw(image)
    cases = [
        (620, 180, "Record a counter sale"),
        (620, 360, "Collect a credit payment"),
        (620, 540, "Dispense a prescription"),
        (620, 720, "Open a patient history"),
        (1180, 180, "Keep the drug catalog"),
        (1180, 360, "Order and receive stock"),
        (1180, 540, "Run stock tools"),
        (1180, 720, "Set payments and insurance"),
    ]
    ellipses = {label: (cx, cy, 240, 58) for cx, cy, label in cases}
    actors = {
        "Administrator": (110, 300),
        "Pharmacist": (110, 560),
        "Cashier": (110, 820),
        "Dispenser": (110, 1060),
        "Stock keeper": (1690, 540),
    }
    links = {
        "Administrator": ["Set payments and insurance"],
        "Pharmacist": [
            "Record a counter sale",
            "Collect a credit payment",
            "Dispense a prescription",
            "Open a patient history",
            "Keep the drug catalog",
            "Run stock tools",
        ],
        "Cashier": [
            "Record a counter sale",
            "Collect a credit payment",
            "Dispense a prescription",
            "Open a patient history",
        ],
        "Dispenser": ["Record a counter sale", "Open a patient history"],
        "Stock keeper": ["Keep the drug catalog", "Order and receive stock", "Run stock tools"],
    }
    for actor, names in links.items():
        ax, ay = actors[actor]
        for name in names:
            cx, cy, hw, _hh = ellipses[name]
            x1 = ax + 40 if ax < cx else ax - 40
            x2 = cx - hw if ax < cx else cx + hw
            draw.line((x1, ay, x2, cy), fill=LINE, width=2)

    rounded(draw, (300, 40, 1500, 980), 16, None, NAVY, 3)
    draw.text((320, 52), "Pharmacie Ubuzima", font=font(22, True), fill=NAVY)
    for cx, cy, label in cases:
        draw.ellipse(ellipse_box(cx, cy, 480, 116), fill=PALE, outline=BLUE, width=3)
        center_text(draw, (cx, cy), label, font(20, True), INK)
    for name, (x, y) in actors.items():
        draw_actor(draw, x, y, name)
    draw.text(
        (300, 1100),
        "The administrator can perform every use case. The line shown is the one no other role can do.\nA dispenser's sale waits until a pharmacist checks it.",
        font=font(18),
        fill=INK,
    )
    path = FIGURES / "figure-2-use-cases.png"
    image.save(path, "PNG")
    return path


def draw_er():
    image = Image.new("RGB", (1800, 1360), WHITE)
    draw = ImageDraw.Draw(image)
    specs = [
        ("patient", 40, 40, "Patient", ["name, phone"]),
        ("prescription", 480, 40, "Prescription", ["doctor, status", "patient"]),
        ("item", 920, 40, "Prescription item", ["quantity, dosage", "prescription, drug"]),
        ("drug", 1360, 40, "Drug", ["name, SKU, strength", "prices, barcode"]),
        ("user", 40, 390, "User", ["name, role"]),
        ("sale", 480, 390, "Sale", ["quantity, total", "due date, phone"]),
        ("collection", 920, 390, "Collection", ["amount, method", "sale"]),
        ("batch", 1360, 390, "Drug batch", ["lot, expiry, quantity", "drug"]),
        ("supplier", 40, 740, "Supplier", ["name, phone"]),
        ("order", 480, 740, "Purchase order", ["status", "supplier"]),
        ("order_item", 920, 740, "Order item", ["quantity, cost", "order, drug"]),
        ("insurer", 1360, 740, "Insurer", ["name, cover percent"]),
        ("claim", 920, 1060, "Claim", ["patient share, insurer share", "status, sale, insurer"]),
    ]
    boxes = {key: (x, y, x + 380, y + 160) for key, x, y, _title, _lines in specs}

    def edge(a, b):
        ax1, ay1, ax2, ay2 = boxes[a]
        bx1, by1, bx2, by2 = boxes[b]
        acx, acy = (ax1 + ax2) / 2, (ay1 + ay2) / 2
        bcx, bcy = (bx1 + bx2) / 2, (by1 + by2) / 2
        if abs(acx - bcx) > abs(acy - bcy):
            start = (ax2, acy) if acx < bcx else (ax1, acy)
            end = (bx1, bcy) if acx < bcx else (bx2, bcy)
        else:
            start = (acx, ay2) if acy < bcy else (acx, ay1)
            end = (bcx, by1) if acy < bcy else (bcx, by2)
        draw.line((*start, *end), fill=BLUE, width=3)
        label = font(16, True)
        if abs(start[0] - end[0]) > abs(start[1] - end[1]):
            draw.text((start[0] - 14, start[1] - 22), "1", font=label, fill=BLUE)
            draw.text((end[0] - 16, end[1] - 22), "N", font=label, fill=BLUE)
        else:
            draw.text((start[0] + 8, start[1] + 4), "1", font=label, fill=BLUE)
            draw.text((end[0] + 8, end[1] - 24), "N", font=label, fill=BLUE)

    for left, right in [
        ("patient", "prescription"),
        ("prescription", "item"),
        ("item", "drug"),
        ("drug", "batch"),
        ("user", "sale"),
        ("sale", "collection"),
        ("supplier", "order"),
        ("order", "order_item"),
    ]:
        edge(left, right)

    # Route around the purchase-order row so the claim lines stay in open space.
    label = font(16, True)
    sale_claim = [(670, 550), (670, 650), (1320, 650), (1320, 1140), (1300, 1140)]
    insurer_claim = [(1550, 900), (1550, 1140), (1300, 1140)]
    draw.line(sale_claim, fill=BLUE, width=3)
    draw.line(insurer_claim, fill=BLUE, width=3)
    draw.text((676, 556), "1", font=label, fill=BLUE)
    draw.text((1230, 1110), "N", font=label, fill=BLUE)
    draw.text((1556, 906), "1", font=label, fill=BLUE)

    for key, x, y, title, lines in specs:
        rounded(draw, (x, y, x + 380, y + 160), 12, WHITE, NAVY, 3)
        draw.rectangle((x, y, x + 380, y + 42), fill=NAVY)
        draw.text((x + 14, y + 8), title, font=font(20, True), fill=WHITE)
        cursor = y + 54
        for line in lines:
            draw.text((x + 14, cursor), line, font=font(16), fill=INK)
            cursor += 24

    draw.text(
        (40, 1280),
        "A sale also points at one drug and may point at one patient. Packaging photos, receipt baskets, and insurance cards are further tables.",
        font=font(16),
        fill=INK,
    )
    path = FIGURES / "figure-3-er.png"
    image.save(path, "PNG")
    return path


def set_run_font(run, name="Times New Roman", size=12, bold=False, italic=False, color=None):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_page_number(paragraph):
    run = paragraph.add_run()
    set_run_font(run, size=11)
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)


def body(document, text, *, indent=True, space_after=0):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    fmt = paragraph.paragraph_format
    fmt.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    fmt.space_after = Pt(space_after)
    fmt.space_before = Pt(0)
    fmt.first_line_indent = Inches(0.5) if indent else Inches(0)
    run = paragraph.add_run(text)
    set_run_font(run)
    return paragraph


def heading(document, text):
    paragraph = document.add_heading(text, level=1)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(16)
    fmt.space_after = Pt(6)
    fmt.line_spacing = 1.15
    fmt.first_line_indent = Inches(0)
    fmt.keep_with_next = True
    for run in paragraph.runs:
        set_run_font(run, size=14, bold=True, color=(10, 58, 107))
    return paragraph


def caption(document, text):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(2)
    fmt.space_after = Pt(10)
    fmt.line_spacing = 1.15
    run = paragraph.add_run(text)
    set_run_font(run, italic=True)
    return paragraph


def add_picture(document, path, width):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(6)
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run()
    run.add_picture(str(path), width=width)


def shade_header(cell):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), "0A3A6B")
    shd.set(qn("w:val"), "clear")
    tc_pr.append(shd)


def add_table(document, headers, rows):
    table = document.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        cell.text = ""
        paragraph = cell.paragraphs[0]
        run = paragraph.add_run(header)
        set_run_font(run, size=11, bold=True, color=(255, 255, 255))
        shade_header(cell)
    for r_index, row in enumerate(rows, start=1):
        for c_index, value in enumerate(row):
            cell = table.rows[r_index].cells[c_index]
            cell.text = ""
            run = cell.paragraphs[0].add_run(value)
            set_run_font(run, size=11)
    spacer = document.add_paragraph()
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = 1
    return table


def configure_styles(document):
    normal = document.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(12)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    heading_style = document.styles["Heading 1"]
    heading_style.font.name = "Times New Roman"
    heading_style.font.size = Pt(14)
    heading_style.font.bold = True
    heading_style.font.color.rgb = RGBColor(10, 58, 107)


def configure_section(section, *, footer=False):
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.left_margin = Inches(1.5)
    section.right_margin = Inches(1)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.header.is_linked_to_previous = False
    section.footer.is_linked_to_previous = False
    if footer:
        paragraph = section.footer.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run("Pharmacie Ubuzima  ·  ")
        set_run_font(run, size=11)
        add_page_number(paragraph)


def title_line(document, text, *, size=12, bold=False, space_before=0, space_after=0):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(space_before)
    fmt.space_after = Pt(space_after)
    fmt.line_spacing = 1.15
    run = paragraph.add_run(text)
    set_run_font(run, size=size, bold=bold, color=(10, 58, 107) if bold else None)


def build():
    FIGURES.mkdir(parents=True, exist_ok=True)
    architecture = draw_architecture()
    usecases = draw_usecases()
    er = draw_er()

    document = Document()
    configure_styles(document)
    configure_section(document.sections[0], footer=False)

    add_picture(document, LOGO, Inches(1.6))
    title_line(document, "ADVENTIST UNIVERSITY OF CENTRAL AFRICA", size=16, bold=True, space_before=8)
    title_line(document, "Faculty of Information Technology", size=13, bold=True)
    title_line(document, "Department of Software Engineering", size=13, bold=True, space_after=8)
    title_line(
        document,
        "PHARMACIE UBUZIMA: A WEB-BASED PHARMACY MANAGEMENT SYSTEM FOR A NEIGHBOURHOOD PHARMACY IN KIMIRONKO, KIGALI",
        size=14,
        bold=True,
        space_before=8,
        space_after=8,
    )
    title_line(
        document,
        "A project proposal submitted in partial fulfilment of the requirements for a bachelor's degree",
        size=12,
        space_after=10,
    )
    title_line(document, "Student: Barigye Peter Muhumuza", size=12, space_before=6)
    title_line(document, "Student ID: 22352", size=12)
    title_line(document, "Registration number: ______________________________", size=12)
    title_line(document, "Supervisor: ______________________________", size=12, space_after=10)
    title_line(document, "Kigali, Rwanda", size=12, space_before=6)
    title_line(document, "November 2026", size=12)

    document.add_section(WD_SECTION.NEW_PAGE)
    configure_section(document.sections[1], footer=True)

    heading(document, "2. Abstract")
    body(
        document,
        "A neighbourhood pharmacy in Kimironko, Kigali, has to sell medicine, watch expiry dates, follow a prescription, collect money that is paid later, and work out what an insurer pays and what the patient pays. When those records sit in separate books, the counter cannot see one picture of the same sale. This proposal describes Pharmacie Ubuzima, a web-based prototype that keeps those tasks in one system for a single retail pharmacy.",
    )
    body(
        document,
        "The prototype was built iteratively with Next.js, TypeScript, and Tailwind, and it stores its records in PostgreSQL. Staff sign in as an administrator, a pharmacist, a stock keeper, a cashier, or a dispenser. A sale can be taken in the base unit, a strip, or a pack, and it can be settled at once by cash, mobile money, or card, or left as credit with a due date and a phone number. Stock is kept in lots and issued from the earliest expiry. Prescriptions are linked to patients. Supplier orders can be printed, and so can a delivery note and an insurance claim form.",
    )
    body(
        document,
        "The prototype does not produce a receipt signed by the Rwanda Revenue Authority, it does not submit a claim to RSSB or to a private insurer, and it does not send an SMS or a WhatsApp reminder. Those limits are stated so that the proposal describes the system that exists.",
    )

    heading(document, "3. Background of the study")
    body(
        document,
        "Community pharmacy in Rwanda is a regulated service, not only a shop. The National Pharmacy Council describes the work of a community pharmacist as processing prescriptions, caring for the patient at the time of supply, giving information, and managing the supply of pharmaceutical products (National Pharmacy Council, 2021). The same standard expects the pharmacy to keep records of purchases and of stock. The Joint FIP/WHO guidelines treat the supply of medicines of assured quality, advice to the patient, and the rational use of medicines as the core of good pharmacy practice (World Health Organization, 2011).",
    )
    body(
        document,
        "A retail pharmacy must also be licensed. Rwanda FDA requires a responsible pharmacist for a retail pharmacy and sets the conditions under which the premises may operate (Rwanda Food and Drugs Authority, 2022). Pricing sits inside a national rule as well. In August 2025 Rwanda FDA set the maximum mark-up for a retail pharmacy at 33.5 percent of the relevant cost (Rwanda Food and Drugs Authority, 2025). Pharmacie Ubuzima records the selling price the pharmacy enters. It does not calculate or enforce that national ceiling.",
    )
    body(
        document,
        "Payment at a Kigali counter is not only cash. The Rwanda Social Security Board states that its medical scheme pays 85 percent of the cost of eligible services and prescribed medication, and that the beneficiary pays 15 percent (Rwanda Social Security Board, n.d.). A World Health Organization review of African insurance schemes described the same split for RSSB medical insurance at private pharmacies, with the pharmacy submitting a monthly claim for the remaining share (World Health Organization Regional Office for Africa, 2016). Mutuelle de Santé, the community-based scheme, was brought under RSSB in 2015. Military Medical Insurance and private insurers sit beside those schemes. A neighbourhood pharmacy therefore meets patients whose covers are not the same.",
    )
    body(
        document,
        "The case for this proposal is one neighbourhood pharmacy counter in Kimironko, Gasabo District, Kigali. The working name of the prototype is Pharmacie Ubuzima. The counter sells by the tablet, the strip, or the box. Some customers pay at once. Some take the medicine and pay later, and the pharmacy then needs the name, the phone number, and a date by which the balance is due. Prescriptions come from prescribers outside the pharmacy. Orders go out to suppliers and goods come back with a lot number and an expiry date. The prototype is built for that counter. It is not a hospital pharmacy and it is not a national insurance platform.",
    )

    heading(document, "4. Problem statement")
    body(
        document,
        "The problem is that the records of one sale are easy to split apart. The stock book may show a quantity. The till may show a payment. A notebook may show a customer who still owes money. A prescription may sit in a file. An insurer's share may be worked out on paper at the end of the month. None of those records has to agree with the others, and a mistake in one of them is hard to trace back to the sale that caused it.",
    )
    body(
        document,
        "Three practical failures follow. First, stock can be sold from a lot that expires sooner while a later lot is left on the shelf, or a return can be put back without a reason. Second, credit can be remembered by name alone, so a partial payment has no history against the original sale. Third, the patient's share and the insurer's share can be guessed differently by two members of staff, and the paper claim then does not match the receipt. The pharmacy needs one system in which the sale, the lot, the credit, the prescription, and the insurance quote are the same event.",
    )

    heading(document, "5. Objectives")
    body(
        document,
        "The general objective is to provide a working web prototype that lets a neighbourhood pharmacy in Kimironko record counter sales, stock, credit, prescriptions, supplier orders, and insurance quotes in one place.",
    )
    body(document, "The specific objectives are the following.")
    objectives = [
        "To record a counter sale in the base unit, a strip, or a pack, and to print a receipt for that sale.",
        "To mark a sale as credit, store the customer's name, phone number, and due date, and record a later payment that is partial or complete.",
        "To keep stock in lots, issue the earliest expiry first, and record a return, damage, expiry, or a stock count.",
        "To add a drug in three steps, covering identity and price, stock and supplier, and packaging photos, with a barcode or a copy from a drug already on file, a strength split into a number and a unit, and base units and pack units kept in settings.",
        "To record a prescription, link it to a patient, and show that patient's earlier prescriptions and sales.",
        "To raise a supplier order, receive the goods into stock, and print the order and the delivery note.",
        "To keep local rules for RSSB, Mutuelle, MMI, and private insurers, quote the patient's share and the insurer's share on a sale, and print a claim form.",
        "To let an administrator set the payment methods and the staff roles used at the counter.",
    ]
    for index, text in enumerate(objectives, start=1):
        body(document, f"{index}. {text}", indent=False)

    heading(document, "6. Scope of the project")
    body(
        document,
        "The project covers one retail counter. In scope are counter sales, bills and collections, inventory and lots, the drug catalog, prescriptions and patient history, supplier orders and the printed documents that go with them, stock tools, payment settings, and insurance settings. The five roles are administrator, pharmacist, stock keeper, cashier, and dispenser. Money is recorded in Rwandan francs. A payment method either settles at once or leaves a balance. The methods shipped with the prototype are cash, mobile money, card, and credit.",
    )
    body(
        document,
        "The place is Kimironko, Kigali. The time scope of the proposal is the prototype as it stands in November 2026, together with the review and write-up that follow it. The prototype is software for that counter. It was not measured in a formal study of many pharmacies.",
    )
    body(
        document,
        "Several things that a reader might expect are outside the scope, and they are outside it on purpose. The receipt is not an electronic billing machine receipt signed by the Rwanda Revenue Authority. The claim form is printed for the pharmacy to handle. The software does not send it to RSSB, MMI, Mutuelle, or a private insurer. The software does not send an SMS or a WhatsApp message when a balance falls due or when a prescription is ready. It does not enforce the Rwanda FDA retail mark-up. It does not replace the pharmacist's professional judgement.",
    )

    heading(document, "7. Significance of the study")
    body(
        document,
        "For the pharmacy, the significance is practical. One sale updates the stock lot, the receipt, the amount still owed, and, where a cover applies, the split between the patient and the insurer. A cashier can see who owes what without searching a separate notebook. A stock keeper can see which lots expire first. A pharmacist can look at a patient's earlier supplies before dispensing again.",
    )
    body(
        document,
        "For the patient, the same record means the price, the directions, and the insurance quote come from the sale rather than from a second calculation. The prototype does not submit the claim, so the patient is not told that an insurer has accepted it.",
    )
    body(
        document,
        "For the student, the project is a chance to apply software design to a real counter: roles, a relational store, printed documents, and rules that differ by insurer. Adventist University of Central Africa requires a research project of at least one semester and at most one academic year, and a topic that does not follow the project guidelines can be cancelled (Adventist University of Central Africa, n.d.). This proposal is the statement of that project.",
    )

    heading(document, "8. Literature review")
    body(
        document,
        "The published material that bears on this project falls into three groups: standards for pharmacy practice, descriptions of health insurance payment in Rwanda, and software that serves a clinic rather than a retail counter.",
    )
    body(
        document,
        "On practice, the National Pharmacy Council's Good Pharmacy Practice in Rwanda (2021) sets out what a community pharmacy does. The pharmacist processes prescriptions, supplies prescription and non-prescription products, counsels the patient, monitors use, and manages the supply chain. Procurement and storage are part of that duty, including records of purchases for inventory control. The World Health Organization and the International Pharmaceutical Federation published the parent standard in 2011. It defines good pharmacy practice as practice that responds to the needs of the people who use the service, and it requires supply of medicines of assured quality, information and advice, and promotion of rational use (World Health Organization, 2011). Those documents justify keeping the prescription, the supply, and the stock movement together. They do not specify a software product.",
    )
    body(
        document,
        "On payment, the World Health Organization Regional Office for Africa (2016) described medicine reimbursement in selected African schemes, including Rwanda. It reported that RSSB medical insurance covered eligible medicines at private pharmacies, that the patient paid 15 percent at the pharmacy, and that the provider submitted a monthly claim for the remaining 85 percent, with processing taking about 30 days on average. The current RSSB medical scheme page still states the 85 percent and 15 percent split for eligible services and prescribed medication (Rwanda Social Security Board, n.d.). Mutuelle, Military Medical Insurance, and private insurers are different covers. The prototype keeps a local reading of those schemes. RSSB is seeded at 85 percent for eligible prescribed medicines. Mutuelle is seeded at zero percent at this private counter until a formulary rule is added, because the public-facility scheme is not assumed to pay a private Kimironko till. Military Medical Insurance and named private insurers can be given a percentage, a list, and a spending limit. A drug can also carry its own RSSB or Mutuelle percentage when that option is switched on. None of this is a live feed from the insurer.",
    )
    body(
        document,
        "On related systems, OpenMRS is an open-source medical record platform built for clinics and hospitals. It stores clinical data and supports implementations that need a patient record (OpenMRS, n.d.). It is the wrong shape for this counter. A neighbourhood pharmacy needs a selling price for a strip and for a box, a lot with an expiry date, a credit bill with a due date and a later collection, a supplier order, and a paper claim. A hospital record does not do that work. Commercial pharmacy packages exist in other markets. This proposal does not review a named commercial product, because no such product was studied here. The gap this prototype fills is the single counter described above: sales, lots, credit, prescriptions, supplier documents, and a local insurance quote, with the limits already stated.",
    )

    heading(document, "9. Methodology")
    body(
        document,
        "The prototype was built in iterations. Each iteration added one counter task, checked it, and left the earlier tasks working. The tasks followed the specific objectives: a sale, then credit and collections, then lots and returns, then the drug catalog, then prescriptions and patients, then supplier orders, then insurance and payment settings. The method is constructive. It produces a system. It does not sample pharmacies or test a hypothesis about them.",
    )
    body(
        document,
        "The tools are Next.js for the web application, TypeScript for the program, and Tailwind for the layout. The store is PostgreSQL. When the application is run without a database server, it uses an embedded PostgreSQL-compatible database so the same schema can be tried on one computer. Staff sign in, and each role can open only the parts of the counter assigned to it. Automated tests check the behaviour that is easy to get wrong, including the shape of a drug record and the way a bill shows a payment taken at the counter.",
    )
    body(
        document,
        "Figure 1 shows the architecture. The member of staff uses a browser. The browser talks to the web application. The application reads and writes the database. Printed documents are produced by the application for the receipt, the purchase order, the delivery note, and the claim form. There is no connection in this diagram to the Rwanda Revenue Authority or to an insurer, because those connections were not built.",
    )
    add_picture(document, architecture, Inches(5.6))
    caption(document, "Figure 1. System architecture of Pharmacie Ubuzima")
    body(
        document,
        "Figure 2 shows the use cases and the five roles. The administrator can perform every use case, and is the only role that changes payment methods and insurance settings. The pharmacist sells, collects, dispenses, opens a patient history, maintains the catalog, and runs stock tools. The cashier sells, collects, dispenses, and opens a patient history. The dispenser records a sale, which stays pending until a pharmacist checks it, and can open a patient history. The stock keeper maintains the catalog, orders and receives stock, and runs the stock tools. Ordering from a supplier is limited to the administrator and the stock keeper.",
    )
    add_picture(document, usecases, Inches(5.6))
    caption(document, "Figure 2. Use cases of Pharmacie Ubuzima")
    body(
        document,
        "Figure 3 shows the main records and how they relate. A patient has many prescriptions, and a prescription has many items, each item pointing at one drug. A drug has many batches. A user records many sales. A sale has many collections, which is how a credit balance is paid down. A supplier has many purchase orders, and each order has many items that point at drugs. An insurer has many claims, and a claim points at the sale it came from. The caption under the figure records three further links that were left off the drawing so it would stay readable: a sale points at one drug and may point at one patient; packaging photos hang off the drug; a basket groups the lines of one receipt; and a patient policy stores the member number a patient holds with an insurer.",
    )
    add_picture(document, er, Inches(5.6))
    caption(document, "Figure 3. Main data relationships in Pharmacie Ubuzima")
    body(
        document,
        "Two design choices need a short explanation because they are easy to misunderstand. The strength of a drug is stored as a number and a unit, so that 200 mg is not entered once as 200mg and again as 0.2 g. The opening stock asks for both the base quantity and the number of packs, and the quantity must divide evenly by the packs, so that 20 tablets in 2 blisters means 10 tablets in a blister from the start. Base units and pack units are chosen from a list that the administrator maintains. They are not typed freely on every new drug.",
    )
    body(
        document,
        "The insurance quote is also local. The application looks first at a percentage stored on the drug when the insurance option for that drug is on. Otherwise it uses the insurer's rule for the category, the generic name, or the brand. The result is a patient amount and an insurer amount on the sale. The claim can be drafted and printed. Marking a claim does not transmit it.",
    )

    heading(document, "10. Work plan and budget")
    body(
        document,
        "The academic bulletin allows from one semester to one academic year for the project (Adventist University of Central Africa, n.d.). The prototype described in this proposal already runs. The plan below therefore separates the work that is done from the work that remains for supervision and submission. The dates are a plan for the write-up. They are not a claim about how many days each earlier build took.",
    )
    add_table(
        document,
        ["Activity", "Status", "Period"],
        [
            ["Proposal", "This document", "November 2026"],
            ["Architecture, use cases, and data design", "Described above", "November 2026"],
            ["Working prototype of the counter", "Built", "Completed with this proposal"],
            ["Supervisor review and corrections", "Not yet done", "December 2026"],
            ["Testing notes and final write-up", "Not yet done", "January 2027"],
        ],
    )
    caption(document, "Table 1. Work plan")
    body(
        document,
        "No external budget was raised. The figures in Table 2 are indicative costs of finishing the academic submission on a computer the student already owns. They are not an invoice and they are not a request for funds. The software used has no licence fee for this project. The prototype does not need a hosted server.",
    )
    add_table(
        document,
        ["Item", "Estimate (RWF)", "Basis"],
        [
            ["Computer", "0", "Already owned"],
            ["Software licences", "0", "No fee for the tools used"],
            ["Printing and binding", "15,000", "Proposal copies and sample forms"],
            ["Internet during the write-up", "20,000", "Indicative"],
            ["Hosting", "0", "The prototype runs locally"],
            ["Total", "35,000", "Indicative, not a grant"],
        ],
    )
    caption(document, "Table 2. Indicative budget")

    heading(document, "11. References")
    references = [
        "Adventist University of Central Africa. (n.d.). Academic bulletin 2021–2025. Kigali: Adventist University of Central Africa. https://web.auca.ac.rw/documents/academic-bulletin.pdf",
        "National Pharmacy Council. (2021). Good pharmacy practice in Rwanda. Kigali: National Pharmacy Council.",
        "OpenMRS. (n.d.). OpenMRS. https://openmrs.org",
        "Rwanda Food and Drugs Authority. (2022). Regulations governing licensing of public and private manufacturers, distributors, wholesalers and retailers of medical products. Kigali: Rwanda FDA.",
        "Rwanda Food and Drugs Authority. (2025). Guidelines for the implementation of mark-ups across the pharmaceutical supply and distribution chain (Doc. No. ODDG/RES/GDL/001). Kigali: Rwanda FDA.",
        "Rwanda Social Security Board. (n.d.). Medical scheme (RAMA). Retrieved 24 November 2026, from https://rssb.rw/schemes/medical-scheme",
        "World Health Organization. (2011). Joint FIP/WHO guidelines on good pharmacy practice: Standards for quality of pharmacy services (WHO Technical Report Series No. 961, Annex 8). Geneva: World Health Organization.",
        "World Health Organization Regional Office for Africa. (2016). Assessment of medicine pricing and reimbursement systems in health insurance schemes in selected African countries. Brazzaville: WHO Regional Office for Africa.",
    ]
    for text in references:
        body(document, text, indent=False, space_after=6)

    document.core_properties.author = "Barigye Peter Muhumuza"
    document.core_properties.title = "Pharmacie Ubuzima: a web-based pharmacy management system"
    document.core_properties.subject = "AUCA final-year project proposal"
    document.core_properties.category = "Project proposal"
    document.save(OUT)
    print(OUT)


if __name__ == "__main__":
    build()
