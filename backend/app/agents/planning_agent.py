import requests
from bs4 import BeautifulSoup
import google.generativeai as genai
import logging

logger = logging.getLogger("testly_ai.planning_agent")

class PlanningAgent:
    def __init__(self, api_key=None):
        self.api_key = api_key
        if api_key:
            genai.configure(api_key=api_key)

    def analyze(self, url: str) -> dict:
        logger.info(f"Planning Agent starting analysis for URL: {url}")
        
        # 1. Fetch page HTML structures
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            response = requests.get(url, headers=headers, timeout=10)
            status_code = response.status_code
            html_content = response.text
        except Exception as e:
            logger.error(f"Planning Agent failed to fetch page: {e}")
            return {
                "url": url,
                "status": "error",
                "message": f"Failed to fetch website: {str(e)}",
                "site_type": "Unknown",
                "technologies": [],
                "elements_found": {"links": 0, "forms": 0, "inputs": 0, "buttons": 0},
                "recommended_tests": ["Basic Availability Test"]
            }

        # 2. Extract elements with BeautifulSoup
        soup = BeautifulSoup(html_content, "html.parser")
        title = soup.title.string.strip() if soup.title else "Untitled Page"
        
        # Extract meta description
        meta_desc = ""
        meta_tag = soup.find("meta", attrs={"name": "description"})
        if meta_tag:
            meta_desc = meta_tag.get("content", "")
            
        links = [a.get("href") for a in soup.find_all("a") if a.get("href")]
        forms = soup.find_all("form")
        inputs = soup.find_all("input")
        buttons = soup.find_all("button")
        images = soup.find_all("img")
        
        elements_summary = {
            "links": len(links),
            "forms": len(forms),
            "inputs": len(inputs),
            "buttons": len(buttons),
            "images": len(images)
        }

        # 3. Detect features/technologies
        technologies = []
        if soup.find(id="react-root") or any("react" in str(s) for s in soup.find_all("script")):
            technologies.append("React")
        if soup.find(id="__next") or any("_next" in str(s) for s in soup.find_all("script")):
            technologies.append("Next.js")
        if any("vue" in str(s) for s in soup.find_all("script")):
            technologies.append("Vue.js")
        if "wp-content" in html_content:
            technologies.append("WordPress")
            
        # Classify site type
        site_type = "Landing Page"
        if len(forms) > 0 and any("login" in str(f).lower() or "signin" in str(f).lower() for f in forms):
            site_type = "Web Portal / Authentication Page"
        elif len(forms) > 0 and any("search" in str(f).lower() for f in forms):
            site_type = "Search Directory / Content Hub"
        elif any("cart" in str(a).lower() or "shop" in str(a).lower() or "product" in str(a).lower() for a in links):
            site_type = "E-Commerce Site"
        elif len(links) > 25:
            site_type = "Content / Blog Site"

        # 4. Generate recommendations using Gemini if key is provided, else fallback to standard rule-based
        recommended_tests = []
        analysis_notes = ""
        
        if self.api_key:
            try:
                # LLM execution
                model = genai.GenerativeModel("gemini-1.5-flash")
                prompt = f"""
                You are the Planning Agent for 'Testly AI'.
                Analyze this website metadata and element breakdown:
                URL: {url}
                Title: {title}
                Meta Description: {meta_desc}
                Element Summary: {elements_summary}
                Detected Technologies: {technologies}
                Site Classification: {site_type}
                
                Suggest a testing strategy for this website. Provide:
                1. A brief summary of what this website does.
                2. A list of 4 critical testing scenarios that a tester should execute on this site (e.g. Navigation Integrity, Form Validation, Image Loading, Mobile Responsiveness, SEO Auditing).
                3. Briefly list which elements (buttons, forms, links) are the highest priority.
                
                Respond in clean, standard JSON format with keys: "summary", "critical_scenarios", "priority_elements".
                """
                response = model.generate_content(prompt)
                import json
                # Strip out potential markdown wraps like ```json
                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                
                res_data = json.loads(text)
                recommended_tests = res_data.get("critical_scenarios", [])
                analysis_notes = res_data.get("summary", "")
                priority_elements = res_data.get("priority_elements", "")
            except Exception as e:
                logger.warning(f"Gemini API planning failed, falling back to heuristics: {e}")
                self.api_key = None # trigger fallback

        if not self.api_key:
            # Heuristic-based recommendation engine
            analysis_notes = f"This appears to be a '{site_type}' website titled '{title}' built with standard web technologies."
            if len(technologies) > 0:
                analysis_notes += f" It utilizes {', '.join(technologies)}."
            
            recommended_tests = ["Navigation & Link Integrity Check"]
            if elements_summary["forms"] > 0 or elements_summary["inputs"] > 0:
                recommended_tests.append("Form Input & Validation Verification")
            else:
                recommended_tests.append("Header & Meta Tags SEO Audit")
                
            recommended_tests.append("Visual Consistency & Image Load Check")
            
            if "E-Commerce" in site_type:
                recommended_tests.append("Cart / Navigation Flow Integrity Check")
            elif "Authentication" in site_type:
                recommended_tests.append("Sign-In Form Fields & Button Integrity Check")
            else:
                recommended_tests.append("Responsive Layout & Rendering Test")
            
            priority_elements = f"Primary focus: Inspecting the {elements_summary['links']} links and {elements_summary['forms']} form elements."

        return {
            "url": url,
            "status": "success",
            "title": title,
            "meta_description": meta_desc,
            "site_type": site_type,
            "technologies": technologies,
            "elements_found": elements_summary,
            "analysis_notes": analysis_notes,
            "priority_elements": priority_elements,
            "recommended_tests": recommended_tests
        }
