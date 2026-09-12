import json
import os
import shutil
from datetime import datetime

if os.environ.get("VERCEL"):
    DB_FILE = "/tmp/db.json"
    template_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db.json")
    if not os.path.exists(DB_FILE) and os.path.exists(template_db):
        try:
            shutil.copyfile(template_db, DB_FILE)
        except Exception:
            pass
else:
    DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db.json")

DEFAULT_DB = {
    "profile": {
        "name": "QA Engineer",
        "role": "Lead Developer / Tester",
        "avatar": "",
        "gemini_api_key": os.environ.get("GEMINI_API_KEY", ""),
        "default_browser": "Chrome",
        "screenshot_quality": "High",
        "notifications_enabled": True
    },
    "history": [],
    "websites": []
}

def load_db():
    if not os.path.exists(DB_FILE):
        save_db(DEFAULT_DB)
        return DEFAULT_DB
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_DB

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

def get_profile():
    db = load_db()
    return db.get("profile", DEFAULT_DB["profile"])

def update_profile(profile_data):
    db = load_db()
    db["profile"].update(profile_data)
    save_db(db)
    return db["profile"]

def get_history():
    db = load_db()
    return db.get("history", [])

def get_history_by_id(task_id):
    db = load_db()
    for entry in db.get("history", []):
        if entry.get("id") == task_id:
            return entry
    return None

def add_history_entry(entry):
    db = load_db()
    if "history" not in db:
        db["history"] = []
    db["history"].insert(0, entry)  # Prepend to show newest first
    save_db(db)
    return entry

def update_history_entry(task_id, updated_data):
    db = load_db()
    for i, entry in enumerate(db.get("history", [])):
        if entry.get("id") == task_id:
            db["history"][i].update(updated_data)
            save_db(db)
            return db["history"][i]
    return None

def get_websites():
    db = load_db()
    return db.get("websites", [])

def add_website_info(url, info):
    db = load_db()
    if "websites" not in db:
        db["websites"] = []
    
    # Remove existing entry for same url if exists
    db["websites"] = [w for w in db["websites"] if w.get("url") != url]
    
    entry = {
        "url": url,
        "last_tested": datetime.now().isoformat(),
        "info": info
    }
    db["websites"].append(entry)
    save_db(db)
    return entry
