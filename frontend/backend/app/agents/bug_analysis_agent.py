import google.generativeai as genai
import logging
import json

logger = logging.getLogger("testly_ai.bug_analysis_agent")

class BugAnalysisAgent:
    def __init__(self, api_key=None):
        self.api_key = api_key
        if api_key:
            genai.configure(api_key=api_key)

    def analyze(self, failed_runs: list, url: str) -> list:
        logger.info(f"Bug Analysis Agent analyzing {len(failed_runs)} failed runs on {url}")
        
        bug_reports = []
        if not failed_runs:
            return bug_reports

        if self.api_key:
            try:
                model = genai.GenerativeModel("gemini-1.5-flash")
                prompt = f"""
                You are the Bug Analysis Agent for 'Testly AI'.
                We ran automated tests on {url} and encountered failures.
                Here are the details of the failed runs:
                {json.dumps(failed_runs, indent=2)}
                
                For each failed run, generate a detailed bug report in JSON format containing:
                1. "id": A unique bug ID (e.g. BUG-001, BUG-002).
                2. "test_case_id": The ID of the failed test case.
                3. "name": A concise, clear bug title.
                4. "severity": Severity rating ("Critical", "High", "Medium", "Low").
                5. "description": A paragraph describing the bug.
                6. "steps_to_reproduce": Array of steps for a developer to reproduce this bug manually.
                7. "possible_root_cause": Potential technical explanation.
                8. "suggested_fix": Recommended code adjustment to fix the bug.
                
                Return ONLY a valid JSON list of these bug report objects.
                """
                response = model.generate_content(prompt)
                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                bug_reports = json.loads(text)
            except Exception as e:
                logger.warning(f"Gemini Bug Analysis failed, using fallback: {e}")
                self.api_key = None

        if not self.api_key:
            # Heuristic-based bug analysis generator
            for i, run in enumerate(failed_runs):
                bug_id = f"BUG-{i+1:03d}"
                tc_id = run["id"]
                tc_name = run["name"]
                err = run["error_message"] or "Assertion error occurred"
                
                severity = "Medium"
                pos_root_cause = "The element was not located in the DOM during execution. This could be due to slow loading scripts or dynamic state changes."
                suggested_fix = "Ensure elements are loaded before asserting by utilizing explicit waits, or verify the element selectors correspond with updated codebases."
                
                if "broken" in err.lower() or "404" in err.lower() or "500" in err.lower():
                    severity = "High"
                    pos_root_cause = "Hyperlink points to a path that returns an error status code. The file or route is missing on the server, or the URL contains a syntax error."
                    suggested_fix = "Verify the target route path configuration. If it is an external link, verify that the external service is online."
                elif "https" in err.lower() or "ssl" in err.lower() or "security" in err.lower():
                    severity = "Critical"
                    pos_root_cause = "The website does not force HTTPS redirections or does not support SSL protocols, exposing user connection data to network interception."
                    suggested_fix = "Install valid SSL certificates on the server (e.g. Let's Encrypt) and force HTTP to HTTPS redirection using webserver config files (Nginx/Apache)."
                elif "form" in err.lower() or "input" in err.lower() or "submit" in err.lower():
                    severity = "High"
                    pos_root_cause = "No forms or input tags were discovered, or standard action handles like Submit are missing. This blocks basic interaction funnels."
                    suggested_fix = "Provide standard input wrappers for user queries and ensure buttons have suitable event triggers or type attributes set."

                bug_reports.append({
                    "id": bug_id,
                    "test_case_id": tc_id,
                    "name": f"Validation Failure on: {tc_name}",
                    "severity": severity,
                    "description": f"During execution of test case {tc_id}, a structural validation check failed: {err}",
                    "steps_to_reproduce": [
                        f"Open the target website URL: {url}",
                        f"Perform the workflow steps corresponding to test case {tc_id}",
                        f"Verify the assertion constraint on the page layout"
                    ],
                    "possible_root_cause": pos_root_cause,
                    "suggested_fix": suggested_fix
                })

        return bug_reports
