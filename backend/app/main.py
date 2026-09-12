import os
import uuid
import logging
import random
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

# Load environment variables from .env file if present
def load_env_file():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(current_dir)), ".env"),
        os.path.join(os.path.dirname(current_dir), ".env"),
        os.path.join(current_dir, ".env")
    ]
    for env_path in candidates:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            key = k.strip()
                            val = v.strip().strip("'\"")
                            if key and key not in os.environ:
                                os.environ[key] = val
                break
            except Exception:
                pass

load_env_file()


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

# Supabase Configuration & Persistent Database Helpers
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or "https://fsstvpegekjryniwtfru.supabase.co"
SUPABASE_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY") or "sb_publishable_8wuC61Y931d0AVvgTPnt_g_nd4tvPbR"

def save_test_history_to_supabase(history_entry: dict):
    try:
        import urllib.request
        import json
        
        insert_url = f"{SUPABASE_URL}/rest/v1/test_history"
        payload = {
            "url": history_entry.get("url"),
            "browser": history_entry.get("browser", "Chrome"),
            "testing_types": history_entry.get("testing_types", ["Functional"]),
            "status": history_entry.get("status", "completed"),
            "success_rate": history_entry.get("success_rate", 100.0),
            "test_cases_count": history_entry.get("test_cases_count", 0),
            "passed_count": history_entry.get("passed_count", 0),
            "bugs_count": history_entry.get("bugs_count", 0),
            "test_results": history_entry.get("test_results", []),
            "bugs": history_entry.get("bugs", []),
            "plan": history_entry.get("plan", {}),
            "report_url": history_entry.get("report_url"),
            "timestamp": history_entry.get("timestamp"),
            "completed_at": history_entry.get("completed_at")
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            insert_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Prefer": "return=minimal"
            }
        )
        urllib.request.urlopen(req, timeout=6)
        logger.info(f"Persisted test run for {history_entry.get('url')} to Supabase test_history table")
    except Exception as e:
        logger.warning(f"Could not persist test run to Supabase: {e}")

def save_tested_website_to_supabase(url: str, plan: dict):
    try:
        import urllib.request
        import json
        from datetime import datetime, timezone
        
        insert_url = f"{SUPABASE_URL}/rest/v1/tested_websites"
        payload = {
            "url": url,
            "title": plan.get("title", "Audited Page"),
            "site_type": plan.get("site_type", "Landing Page"),
            "technologies": plan.get("technologies", ["HTML5", "CSS3"]),
            "info": plan,
            "last_tested": datetime.now(timezone.utc).isoformat()
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            insert_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Prefer": "return=minimal"
            }
        )
        urllib.request.urlopen(req, timeout=6)
        logger.info(f"Persisted website {url} to Supabase tested_websites table")
    except Exception as e:
        logger.warning(f"Could not persist website to Supabase: {e}")

def fetch_supabase_history():
    try:
        import urllib.request
        import json
        
        query_url = f"{SUPABASE_URL}/rest/v1/test_history?select=*&order=timestamp.desc&limit=50"
        req = urllib.request.Request(
            query_url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        with urllib.request.urlopen(req, timeout=6) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        logger.warning(f"Failed to fetch test_history from Supabase: {e}")
        return None

def fetch_supabase_websites():
    try:
        import urllib.request
        import json
        
        query_url = f"{SUPABASE_URL}/rest/v1/tested_websites?select=*&order=last_tested.desc&limit=50"
        req = urllib.request.Request(
            query_url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        with urllib.request.urlopen(req, timeout=6) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        logger.warning(f"Failed to fetch tested_websites from Supabase: {e}")
        return None

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
    api_key = profile.get("gemini_api_key", "").strip() or os.environ.get("GEMINI_API_KEY", "").strip() or None
    
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
        # Persist directly to Supabase persistent tables
        save_test_history_to_supabase(history_entry)
        save_tested_website_to_supabase(url, plan)
        
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
    supabase_data = fetch_supabase_history()
    if supabase_data is not None and len(supabase_data) > 0:
        return supabase_data
    return database.get_history()

@app.get("/api/websites")
def get_tested_websites():
    supabase_data = fetch_supabase_websites()
    if supabase_data is not None and len(supabase_data) > 0:
        return supabase_data
    return database.get_websites()

@app.get("/api/profile")
def get_user_profile():
    return database.get_profile()

@app.post("/api/profile")
def update_user_profile(profile: ProfileUpdate):
    update_dict = {k: v for k, v in profile.dict().items() if v is not None}
    return database.update_profile(update_dict)


# =====================================================================
# SMTP OTP PASSWORD RECOVERY SERVICE
# =====================================================================

SMTP_HOST = os.environ.get("SMTP_HOST") or "smtp.gmail.com"
SMTP_PORT = int(os.environ.get("SMTP_PORT") or 587)
SMTP_USER = os.environ.get("SMTP_USER") or "gowthamkaruppaiah6@gmail.com"
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD") or "lgtxygvdubivmogz"
SMTP_SENDER_EMAIL = os.environ.get("SMTP_SENDER_EMAIL") or "gowthamkaruppaiah6@gmail.com"
SMTP_SENDER_NAME = os.environ.get("SMTP_SENDER_NAME") or "Testly AI"

# In-memory OTP cache: { email.lower(): { "otp": "123456", "expires_at": timestamp, "attempts": 0 } }
ACTIVE_OTP_STORE = {}

class SendOtpRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

def dispatch_smtp_email(to_email: str, otp_code: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Testly AI - Password Reset OTP Code: {otp_code}"
    msg["From"] = f"{SMTP_SENDER_NAME} <{SMTP_SENDER_EMAIL}>"
    msg["To"] = to_email

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f8fb; margin: 0; padding: 24px; }}
        .card {{ max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #eaeef4; padding: 36px 30px; box-shadow: 0 10px 30px rgba(36, 2, 9, 0.06); }}
        .badge {{ display: inline-block; width: 44px; height: 44px; background: #8e1432; border-radius: 12px; color: #ffffff; font-weight: bold; font-size: 22px; text-align: center; line-height: 44px; margin-bottom: 16px; }}
        .title {{ color: #240209; font-size: 22px; font-weight: 700; margin: 0 0 8px; }}
        .subtitle {{ color: #5c434a; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }}
        .otp-box {{ background: #fdf2f5; border: 2px dashed #bc355a; border-radius: 12px; padding: 20px 24px; text-align: center; margin: 24px 0; }}
        .otp-code {{ font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #8e1432; font-family: monospace; }}
        .notice {{ font-size: 12.5px; color: #8c737a; line-height: 1.5; margin-top: 18px; }}
        .footer {{ text-align: center; margin-top: 24px; font-size: 11.5px; color: #a09296; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">T</div>
        <h2 class="title">Password Reset Verification</h2>
        <p class="subtitle">We received a request to reset your password for your Testly AI QA account. Enter the 6-digit verification code below:</p>
        
        <div class="otp-box">
          <div class="otp-code">{otp_code}</div>
        </div>

        <p class="notice">
          ⏱️ This OTP code is valid for <strong>10 minutes</strong>.<br>
          🔒 For your security, do not share this code with anyone. If you did not request this, please disregard this email.
        </p>
      </div>
      <div class="footer">
        © 2026 Testly AI • Autonomous QA Intelligence Platform
      </div>
    </body>
    </html>
    """

    plain_text = f"Your Testly AI password reset OTP is: {otp_code}\nThis code will expire in 10 minutes.\nDo not share this code with anyone."

    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    # Attempt 1: Port 587 with STARTTLS
    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_SENDER_EMAIL, to_email, msg.as_string())
        server.quit()
        logger.info(f"Successfully sent OTP email to {to_email} via Port {SMTP_PORT} (STARTTLS)")
        return
    except Exception as e_tls:
        logger.warning(f"SMTP Port {SMTP_PORT} failed ({e_tls}), trying Port 465 (SSL)...")

    # Attempt 2: Port 465 with direct SSL (fallback for environments blocking port 587)
    try:
        server = smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=12)
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_SENDER_EMAIL, to_email, msg.as_string())
        server.quit()
        logger.info(f"Successfully sent OTP email to {to_email} via Port 465 (SSL)")
    except Exception as e_ssl:
        logger.error(f"Both Port 587 and 465 failed: {e_ssl}")
        raise Exception(f"Failed to dispatch email via SMTP (STARTTLS & SSL both failed): {e_ssl}")

@app.post("/api/auth/send-smtp-otp")
@app.post("/auth/send-smtp-otp")
def api_send_smtp_otp(req: SendOtpRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")

    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = time.time() + 600 # 10 minutes

    try:
        dispatch_smtp_email(email, otp_code)
    except Exception as e:
        logger.error(f"Failed to dispatch SMTP email to {email}: {e}")
        raise HTTPException(status_code=500, detail=f"SMTP Error: {str(e)}")

    # Update in-memory cache
    ACTIVE_OTP_STORE[email] = {
        "otp": otp_code,
        "expires_at": expires_at,
        "attempts": 0
    }

    # Persist into Supabase password_reset_otps table (critical for stateless Vercel serverless)
    try:
        import urllib.request
        import json
        from datetime import datetime, timezone
        
        insert_url = f"{SUPABASE_URL}/rest/v1/password_reset_otps"
        iso_expiry = datetime.now(timezone.utc).isoformat()
        payload = json.dumps({
            "email": email,
            "otp_code": otp_code,
            "expires_at": iso_expiry,
            "verified": False,
            "attempts": 0
        }).encode("utf-8")
        
        req_sub = urllib.request.Request(
            insert_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Prefer": "return=minimal"
            }
        )
        urllib.request.urlopen(req_sub, timeout=6)
        logger.info(f"Persisted OTP for {email} into Supabase table")
    except Exception as db_err:
        logger.warning(f"Could not persist OTP to Supabase table: {db_err}")

    logger.info(f"Dispatched SMTP OTP to {email}")
    return {
        "success": True,
        "message": f"6-digit verification OTP dispatched via SMTP to {email}"
    }

@app.post("/api/auth/verify-smtp-otp")
@app.post("/auth/verify-smtp-otp")
def api_verify_smtp_otp(req: VerifyOtpRequest):

    email = req.email.strip().lower()
    entered_otp = req.otp.strip().replace(" ", "")

    # 1. Check in-memory store
    record = ACTIVE_OTP_STORE.get(email)
    if record and time.time() <= record["expires_at"]:
        record["attempts"] += 1
        if record["attempts"] <= 5 and record["otp"] == entered_otp:
            return {"success": True, "valid": True, "message": "OTP verification successful."}

    # 2. Check Supabase database table (essential for stateless Vercel instances)
    try:
        import urllib.request
        import json
        
        query_url = f"{SUPABASE_URL}/rest/v1/password_reset_otps?email=eq.{email}&otp_code=eq.{entered_otp}&verified=eq.false&order=created_at.desc&limit=1"
        req_sub = urllib.request.Request(
            query_url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        with urllib.request.urlopen(req_sub, timeout=6) as response:
            records = json.loads(response.read().decode())
            if records and len(records) > 0:
                rec = records[0]
                # mark verified in table
                try:
                    patch_url = f"{SUPABASE_URL}/rest/v1/password_reset_otps?id=eq.{rec['id']}"
                    patch_req = urllib.request.Request(
                        patch_url,
                        data=json.dumps({"verified": True}).encode("utf-8"),
                        headers={
                            "Content-Type": "application/json",
                            "apikey": SUPABASE_KEY,
                            "Authorization": f"Bearer {SUPABASE_KEY}",
                            "Prefer": "return=minimal"
                        },
                        method="PATCH"
                    )
                    urllib.request.urlopen(patch_req, timeout=4)
                except Exception:
                    pass
                return {"success": True, "valid": True, "message": "OTP verification successful."}
    except Exception as e:
        logger.error(f"Error checking Supabase OTP table: {e}")

    raise HTTPException(status_code=400, detail="Invalid or expired OTP code. Please check your email and try again.")


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

@app.post("/api/auth/reset-password")
@app.post("/auth/reset-password")
def api_reset_password(req: ResetPasswordRequest):
    email = req.email.strip().lower()
    otp = req.otp.strip()
    new_password = req.new_password

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters in length.")

    # Call Supabase RPC reset_user_password
    try:
        import urllib.request
        import json

        rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/reset_user_password"
        payload = json.dumps({
            "user_email": email,
            "otp_token": otp,
            "new_plain_password": new_password
        }).encode("utf-8")

        req_rpc = urllib.request.Request(
            rpc_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )

        with urllib.request.urlopen(req_rpc, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            if data and data.get("success"):
                return {"success": True, "message": "Password updated successfully."}
            else:
                raise HTTPException(status_code=400, detail=data.get("error", "Failed to reset password."))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing reset_user_password RPC: {e}")
        raise HTTPException(status_code=500, detail=f"Database update error: {str(e)}")



