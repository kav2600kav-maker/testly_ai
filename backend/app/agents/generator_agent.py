import google.generativeai as genai
import logging
import json

logger = logging.getLogger("testly_ai.generator_agent")

class GeneratorAgent:
    def __init__(self, api_key=None):
        self.api_key = api_key
        if api_key:
            genai.configure(api_key=api_key)

    def generate(self, plan: dict, browser: str = "Chrome") -> list:
        logger.info(f"Test Case Generator Agent running for URL: {plan.get('url')}")
        
        test_cases = []
        
        if self.api_key:
            try:
                model = genai.GenerativeModel("gemini-1.5-flash")
                prompt = f"""
                You are the Test Case Generator Agent for 'Testly AI'.
                Given the website analysis plan:
                URL: {plan.get('url')}
                Title: {plan.get('title')}
                Site Type: {plan.get('site_type')}
                Elements Found: {plan.get('elements_found')}
                Recommended Tests: {plan.get('recommended_tests')}
                Target Browser: {browser}
                
                Generate a list of exactly 5 detailed test cases tailored specifically to this site.
                For each test case, provide:
                1. "id": A unique test case ID (e.g., TC-001, TC-002).
                2. "name": A concise title (e.g., Validate Homepage Load).
                3. "description": What this test case covers.
                4. "category": Category of testing (e.g., Functional, UI/UX, Performance, SEO).
                5. "steps": An array of numbered instruction steps (e.g. ["Navigate to site", "Check if title is correct"]).
                6. "expected_result": What indicates success.
                7. "browser": "{browser}"
                
                Ensure the test cases are realistic for this URL. Return ONLY a valid JSON array containing objects with these keys: "id", "name", "description", "category", "steps", "expected_result", "browser".
                """
                response = model.generate_content(prompt)
                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                
                test_cases = json.loads(text)
            except Exception as e:
                logger.warning(f"Gemini API test case generation failed, using fallback: {e}")
                self.api_key = None

        if not self.api_key:
            # Heuristics based fallback test cases
            url = plan.get("url")
            elements = plan.get("elements_found", {"links": 0, "forms": 0, "inputs": 0, "buttons": 0, "images": 0})
            
            # TC-001: General Page Load
            test_cases.append({
                "id": "TC-001",
                "name": "Verify Main Homepage Load and Responsive Structure",
                "description": "Navigate to the site and verify it loads completely with correct metadata and headers.",
                "category": "Functional / SEO",
                "steps": [
                    f"Navigate to {url}",
                    "Wait for the page load event to complete",
                    "Verify the title is not empty",
                    "Check meta tags for SEO compliance"
                ],
                "expected_result": "Page loads successfully with HTTP 200, title matches metadata, viewport is set for responsiveness.",
                "browser": browser
            })
            
            # TC-002: Navigation links check
            test_cases.append({
                "id": "TC-002",
                "name": f"Validate Link Integrity & Hyperlinks ({elements.get('links', 0)} links)",
                "description": "Inspect and validate hyperlinked URLs found on the page to prevent broken navigation.",
                "category": "Functional / Navigation",
                "steps": [
                    "Scan page for HTML anchor tags (hrefs)",
                    "Check all detected relative and absolute links",
                    "Attempt to connect to top 3 navigation links",
                    "Verify status codes are 200 or 300 series (not 404/500)"
                ],
                "expected_result": "Anchor elements have valid links; tested pages return success HTTP codes.",
                "browser": browser
            })
            
            # TC-003: Visual Images Check
            test_cases.append({
                "id": "TC-003",
                "name": f"Audit Image Resource Loading & Accessibility ({elements.get('images', 0)} images)",
                "description": "Verify that all image resources reference active paths and include alternate text attributes.",
                "category": "UI/UX & Visual",
                "steps": [
                    "Identify image tags (img src)",
                    "Verify image source paths exist and load successfully",
                    "Check for alt description attributes on all major elements"
                ],
                "expected_result": "Images render correctly without console failures, accessibility labels (alt) are present.",
                "browser": browser
            })

            # TC-004: Forms and Inputs (Dynamic depending on elements)
            if elements.get("forms", 0) > 0 or elements.get("inputs", 0) > 0:
                test_cases.append({
                    "id": "TC-004",
                    "name": "Verify Interaction Form and Input Validations",
                    "description": "Locate text input fields and verify they accept keyboard strokes and validate formatting.",
                    "category": "Functional / Validation",
                    "steps": [
                        "Locate input fields and form containers",
                        "Verify input attributes (type, placeholder, name)",
                        "Simulate standard keyboard interaction on inputs",
                        "Locate submit button elements"
                    ],
                    "expected_result": "Forms render input fields correctly; inputs allow typing and submit buttons are visible.",
                    "browser": browser
                })
            else:
                test_cases.append({
                    "id": "TC-004",
                    "name": "Verify Core CSS and Layout Flow Check",
                    "description": "Inspect document styles for standard responsive layouts.",
                    "category": "UI/UX & Visual",
                    "steps": [
                        "Examine page container widths and styling",
                        "Check for text overflows or misaligned navigation bars",
                        "Verify header and footer sections are visible"
                    ],
                    "expected_result": "Layout remains aligned, navbar and footer remain functional, no major visual overlapping.",
                    "browser": browser
                })

            # TC-005: Security and Performance checks
            test_cases.append({
                "id": "TC-005",
                "name": "Verify SSL Protocol Security & Load Performance",
                "description": "Verify connection utilizes safe TLS protocols and measure latency of page rendering.",
                "category": "Security / Performance",
                "steps": [
                    f"Check URL connection protocol (HTTPS status)",
                    "Verify SSL Certificate is valid",
                    "Audit load latency metrics for the page structure"
                ],
                "expected_result": "Connection runs securely over HTTPS, page response time is within acceptable limits (< 3 seconds).",
                "browser": browser
            })

        return test_cases
