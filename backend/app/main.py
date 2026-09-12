import os
import uuid
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

from app import database
from app.agents.planning_agent import PlanningAgent
from app.agents.generator_agent import GeneratorAgent
from app.agents.execution_agent import ExecutionAgent
from app.agents.bug_analysis_agent import BugAnalysisAgent
from app.agents.report_agent import ReportAgent

# Set up logs
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("testly_ai")

# Setup directories
if os.environ.get("VERCEL"):
    STATIC_DIR = "/tmp/static"
    SCREENSHOTS_DIR = os.path.join(STATIC_DIR, "screenshots")
    REPORTS_DIR = os.path.join(STATIC_DIR, "reports")
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    STATIC_DIR = os.path.join(BASE_DIR, "app", "static")
    SCREENSHOTS_DIR = os.path.join(STATIC_DIR, "screenshots")
    REPORTS_DIR = os.path.join(STATIC_DIR, "reports")

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

app = FastAPI(title="Testly AI API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Track in-progress operations
ACTIVE_TASKS = {}

class TestRequest(BaseModel):
    url: str
    browser: str = "Chrome"
    testing_types: List[str] = ["Functional"]

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    avatar: Optional[str] = None
    gemini_api_key: Optional[str] = None
    default_browser: Optional[str] = None
    screenshot_quality: Optional[str] = None
    notifications_enabled: Optional[bool] = None

# Background pipeline execution
def run_agent_pipeline(task_id: str, url: str, browser: str, testing_types: List[str]):
    profile = database.get_profile()
    api_key = profile.get("gemini_api_key", "").strip() or None
    
    task_state = ACTIVE_TASKS[task_id]
    
    try:
        # Step 1: Planning Agent
        task_state["status"] = "planning"
        task_state["logs"].append("Planning Agent activated: Inspecting website layout and structures...")
        planner = PlanningAgent(api_key=api_key)
        plan = planner.analyze(url)
        task_state["plan"] = plan
        
        if plan.get("status") == "error":
            raise Exception(plan.get("message", "Planning phase failed."))
            
        task_state["logs"].append(f"Planning complete. Classified site as '{plan['site_type']}'. Detected {plan['elements_found']['links']} links.")

        # Step 2: Generator Agent
        task_state["status"] = "generating"
        task_state["logs"].append("Generator Agent activated: Writing intelligence test assertions...")
        generator = GeneratorAgent(api_key=api_key)
        test_cases = generator.generate(plan, browser)
        task_state["test_cases"] = test_cases
        task_state["logs"].append(f"Generated {len(test_cases)} target test cases.")

        # Step 3: Execution Agent
        task_state["status"] = "executing"
        task_state["logs"].append(f"Execution Agent activated: Initializing {browser} browser interactions...")
        executor = ExecutionAgent(output_dir=SCREENSHOTS_DIR)
        test_results = executor.execute(test_cases, url, browser)
        task_state["test_results"] = test_results
        task_state["test_cases"] = test_results
        
        passed_count = sum(1 for r in test_results if r["status"] == "PASSED")
        task_state["logs"].append(f"Execution finished: {passed_count}/{len(test_results)} passed.")

        # Step 4: Bug Analysis Agent
        task_state["status"] = "analyzing"
        task_state["logs"].append("Bug Analysis Agent activated: Inspecting failure traces and logs...")
        failed_runs = [r for r in test_results if r["status"] == "FAILED"]
        
        analyzer = BugAnalysisAgent(api_key=api_key)
        bugs = analyzer.analyze(failed_runs, url)
        task_state["bugs"] = bugs
        task_state["logs"].append(f"Bug analysis complete. Discovered {len(bugs)} issues.")

        # Step 5: Report Generator Agent
        task_state["status"] = "reporting"
        task_state["logs"].append("Report Generator Agent activated: Formulating PDF summary documents...")
        reporter = ReportAgent(output_dir=REPORTS_DIR)
        pdf_name = reporter.generate_pdf(task_id, url, test_results, bugs, browser)
        report_url = f"/static/reports/{pdf_name}"
        task_state["report_url"] = report_url
        task_state["logs"].append("PDF Report compilation complete.")

        # Complete Task
        task_state["status"] = "completed"
        task_state["completed_at"] = datetime.now().isoformat()
        
        # Save to Database
        history_entry = {
            "id": task_id,
            "url": url,
            "browser": browser,
            "testing_types": testing_types,
            "timestamp": task_state["created_at"],
            "completed_at": task_state["completed_at"],
            "success_rate": round((passed_count / len(test_results)) * 100, 1) if test_results else 0,
            "test_cases_count": len(test_results),
            "passed_count": passed_count,
            "bugs_count": len(bugs),
            "report_url": report_url,
            "test_results": test_results,
            "bugs": bugs,
            "plan": plan
        }
        database.add_history_entry(history_entry)
        database.add_website_info(url, {
            "title": plan["title"],
            "site_type": plan["site_type"],
            "technologies": plan["technologies"]
        })
        
    except Exception as e:
        logger.error(f"Pipeline error for task {task_id}: {e}")
        task_state["status"] = "failed"
        task_state["error"] = str(e)
        task_state["logs"].append(f"CRITICAL PIPELINE EXCEPTION: {str(e)}")

# API Routes
@app.post("/api/test/start")
def start_test(req: TestRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    ACTIVE_TASKS[task_id] = {
        "id": task_id,
        "url": req.url,
        "browser": req.browser,
        "testing_types": req.testing_types,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "logs": ["Testly AI queued pipeline initialization..."],
        "test_cases": [],
        "test_results": [],
        "bugs": [],
        "plan": {},
        "report_url": None
    }
    
    background_tasks.add_task(
        run_agent_pipeline, 
        task_id, 
        req.url, 
        req.browser, 
        req.testing_types
    )
    
    return {"task_id": task_id, "status": "pending"}

@app.get("/api/test/status/{task_id}")
def get_test_status(task_id: str):
    # Check live active tasks first
    if task_id in ACTIVE_TASKS:
        return ACTIVE_TASKS[task_id]
        
    # Check database history if not in active tasks
    historical = database.get_history_by_id(task_id)
    if historical:
        return {
            "id": historical["id"],
            "url": historical["url"],
            "browser": historical["browser"],
            "testing_types": historical["testing_types"],
            "status": "completed",
            "created_at": historical["timestamp"],
            "completed_at": historical["completed_at"],
            "logs": ["Test execution retrieved from database archives."],
            "test_cases": historical["test_results"],
            "test_results": historical["test_results"],
            "bugs": historical["bugs"],
            "plan": historical["plan"],
            "report_url": historical["report_url"]
        }
        
    raise HTTPException(status_code=404, detail="Test execution task not found.")

@app.get("/api/test/history")
def get_test_history():
    return database.get_history()

@app.get("/api/websites")
def get_tested_websites():
    return database.get_websites()

@app.get("/api/profile")
def get_user_profile():
    return database.get_profile()

@app.post("/api/profile")
def update_user_profile(profile: ProfileUpdate):
    update_dict = {k: v for k, v in profile.dict().items() if v is not None}
    return database.update_profile(update_dict)
