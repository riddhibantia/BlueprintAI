"""Init DB (creates tables + pgvector extension if Postgres)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.core.database import init_db
init_db()
print("DB initialized OK")
