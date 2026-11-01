# Installs PostgreSQL 16 + pgvector on Windows via winget (run as Admin).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install_postgres_windows.ps1
winget install -e --id PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements
# After install, in psql:
#   CREATE DATABASE blueprintai; CREATE EXTENSION vector;
# Then set DATABASE_URL=postgresql+psycopg://postgres:<pw>@localhost:5432/blueprintai in .env
Write-Host "PostgreSQL install triggered. Create DB + vector extension manually, then update .env"
