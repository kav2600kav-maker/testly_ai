import os
import sys

# Ensure backend directory is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

# Check for backend folder in frontend/backend or root/backend
backend_dir = os.path.join(parent_dir, "backend")
if not os.path.exists(backend_dir):
    backend_dir = os.path.join(os.path.dirname(parent_dir), "backend")

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
