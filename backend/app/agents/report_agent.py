import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import logging

logger = logging.getLogger("testly_ai.report_agent")

class ReportAgent:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_pdf(self, task_id: str, url: str, test_cases: list, bugs: list, browser: str) -> str:
        pdf_filename = f"report_{task_id}.pdf"
        pdf_path = os.path.join(self.output_dir, pdf_filename)
        
        logger.info(f"Report Generator Agent writing PDF to {pdf_path}")
        
        doc = SimpleDocTemplate(
            pdf_path,
            pagesize=letter,
            rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
        )
        
        styles = getSampleStyleSheet()
        
        # Define custom professional styles in Wine Red theme
        title_style = ParagraphStyle(
            "DocTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#8E1432"), # Wine Red primary
            spaceAfter=5
        )
        
        subtitle_style = ParagraphStyle(
            "DocSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#5C434A"), # Muted wine-charcoal
            spaceAfter=15
        )
        
        h1_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#240209"), # Deep Midnight Wine
            spaceBefore=15,
            spaceAfter=8,
            keepWithNext=True
        )
        
        h2_style = ParagraphStyle(
            "SubSectionHeader",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#4B5563"),
            spaceBefore=10,
            spaceAfter=6,
            keepWithNext=True
        )

        body_style = ParagraphStyle(
            "ReportBody",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=colors.HexColor("#374151"),
            spaceAfter=5
        )
        
        bold_body_style = ParagraphStyle(
            "ReportBodyBold",
            parent=body_style,
            fontName="Helvetica-Bold"
        )
        
        code_style = ParagraphStyle(
            "ReportCode",
            parent=styles["Normal"],
            fontName="Courier",
            fontSize=9,
            textColor=colors.HexColor("#111827"),
            backColor=colors.HexColor("#F3F4F6"),
            borderPadding=6,
            spaceAfter=5
        )

        passed_badge = ParagraphStyle(
            "PassedBadge",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=colors.HexColor("#15803D"),
            backColor=colors.HexColor("#DCFCE7"),
            borderPadding=4
        )

        failed_badge = ParagraphStyle(
            "FailedBadge",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=colors.HexColor("#B91C1C"),
            backColor=colors.HexColor("#FEE2E2"),
            borderPadding=4
        )

        story = []

        # 1. Document Title & Header
        story.append(Paragraph("TESTLY AI — AUTOMATED QUALITY REPORT", title_style))
        story.append(Paragraph("Intelligent autonomous QA agent test execution details", subtitle_style))
        story.append(Spacer(1, 5))

        # 2. Metadata Section (Table)
        total_tests = len(test_cases)
        passed_tests = sum(1 for tc in test_cases if tc["status"] == "PASSED")
        failed_tests = total_tests - passed_tests
        pass_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
        
        meta_data = [
            [Paragraph("Target URL:", bold_body_style), Paragraph(url, body_style)],
            [Paragraph("Execution Browser:", bold_body_style), Paragraph(browser, body_style)],
            [Paragraph("Timestamp:", bold_body_style), Paragraph(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), body_style)],
            [Paragraph("Test Coverage Summary:", bold_body_style), Paragraph(f"Total: {total_tests} | Passed: {passed_tests} | Failed: {failed_tests} ({pass_rate:.1f}% Success)", body_style)],
            [Paragraph("Report Status:", bold_body_style), Paragraph("STABLE" if failed_tests == 0 else "ACTION REQUIRED", failed_badge if failed_tests > 0 else passed_badge)]
        ]
        
        meta_table = Table(meta_data, colWidths=[150, 380])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#E5E7EB")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 15))

        # 3. Test Cases Summary Table
        story.append(Paragraph("Test Execution Summary", h1_style))
        
        summary_headers = ["ID", "Test Case Name", "Category", "Status", "Duration"]
        summary_rows = [[Paragraph(h, bold_body_style) for h in summary_headers]]
        
        for tc in test_cases:
            badge = Paragraph("PASSED", passed_badge) if tc["status"] == "PASSED" else Paragraph("FAILED", failed_badge)
            summary_rows.append([
                Paragraph(tc["id"], body_style),
                Paragraph(tc["name"], body_style),
                Paragraph(tc["category"], body_style),
                badge,
                Paragraph(f"{tc['duration_seconds']}s", body_style),
            ])
            
        summary_table = Table(summary_rows, colWidths=[50, 210, 110, 80, 80])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#EEF2F6")),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 15))

        # 4. Detailed Bug Reports Section
        if bugs:
            story.append(Paragraph("Critical Bug Reports & Analysis", h1_style))
            
            for bug in bugs:
                bug_elements = []
                bug_elements.append(Paragraph(f"{bug['id']}: {bug['name']}", h2_style))
                
                # Metadata box for the bug
                severity_color = "#B91C1C" if bug["severity"] in ["Critical", "High"] else "#D97706"
                sev_badge = ParagraphStyle(
                    "SevBadge",
                    parent=styles["Normal"],
                    fontName="Helvetica-Bold",
                    fontSize=9,
                    textColor=colors.HexColor(severity_color),
                    backColor=colors.HexColor(severity_color).clone(alpha=0.15),
                    borderPadding=4
                )
                
                bug_meta = [
                    [Paragraph("Test Case Association:", bold_body_style), Paragraph(bug["test_case_id"], body_style)],
                    [Paragraph("Severity Level:", bold_body_style), Paragraph(bug["severity"].upper(), sev_badge)],
                    [Paragraph("Root Cause Hypothesis:", bold_body_style), Paragraph(bug["possible_root_cause"], body_style)],
                    [Paragraph("Suggested Correction:", bold_body_style), Paragraph(bug["suggested_fix"], body_style)]
                ]
                bug_table = Table(bug_meta, colWidths=[150, 380])
                bug_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFFBEB") if bug["severity"] != "Critical" else colors.HexColor("#FEF2F2")),
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#FDE68A") if bug["severity"] != "Critical" else colors.HexColor("#FCA5A5")),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('PADDING', (0, 0), (-1, -1), 6),
                ]))
                
                bug_elements.append(bug_table)
                bug_elements.append(Spacer(1, 8))
                
                # Steps to reproduce
                bug_elements.append(Paragraph("Steps to Reproduce", bold_body_style))
                for step in bug["steps_to_reproduce"]:
                    bug_elements.append(Paragraph(f"• {step}", body_style))
                bug_elements.append(Spacer(1, 10))
                
                # Screenshot embedding
                # Check for corresponding test case run screenshot
                tc_run = next((t for t in test_cases if t["id"] == bug["test_case_id"]), None)
                if tc_run and tc_run.get("screenshot"):
                    # Find local screenshot file path
                    screenshot_url = tc_run["screenshot"]
                    # Convert to local filepath: e.g. /static/screenshots/screenshot_TC-004.png -> screenshots/screenshot_TC-004.png
                    filename = os.path.basename(screenshot_url)
                    local_screenshot_path = os.path.join(self.output_dir, filename)
                    
                    if os.path.exists(local_screenshot_path):
                        try:
                            # Embed resized image (width: 440, height: 275)
                            bug_elements.append(Paragraph("Failure Screenshot Capture:", bold_body_style))
                            img_widget = Image(local_screenshot_path, width=440, height=275)
                            bug_elements.append(img_widget)
                        except Exception as img_err:
                            logger.error(f"Failed to embed screenshot in PDF: {img_err}")
                
                bug_elements.append(Spacer(1, 15))
                story.append(KeepTogether(bug_elements))
                
        # 5. Build document
        doc.build(story)
        logger.info(f"Report generation complete. PDF written to {pdf_filename}")
        
        return pdf_filename
