"""Comprehensive test suite for RAG, Vector Database, Hybrid Retrieval and Knowledge Grounding."""
import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed, embed_batch, cosine
from app.rag.retriever import retrieve
from app.rag.vector_store import compute_bm25_scores


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_chunking_sentence_boundaries_and_headings():
    """Verify chunking splits on clean sentence boundaries and respects section headings."""
    sample_text = (
        "# 1. System Overview\n"
        + "The system provides zero-trust identity and role-based access control for all internal services. " * 5
        + "\n\n## 2. Architecture and Database Engine\n"
        + "PostgreSQL is configured as the primary persistence engine with high availability and automated replicas. " * 5
        + "\nPgvector handles high-dimensional embedding storage and approximate nearest neighbor search. " * 5
    )
    chunks = chunk_text(sample_text, target=300, overlap=50)
    assert len(chunks) >= 2
    assert all("content" in c and "section" in c for c in chunks)
    sections = [c["section"] for c in chunks]
    assert any("Architecture" in s or "Overview" in s for s in sections)


def test_dense_embeddings_semantic_affinity():
    """Verify dense embeddings capture morphological and semantic relations while staying deterministic."""
    v1 = embed("authentication and identity")
    v2 = embed("authentication and identity")
    assert v1 == v2, "Embeddings must be strictly deterministic"
    assert cosine(v1, v2) > 0.999

    # Related security terminology should score higher than unrelated farming text
    v_login = embed("user sign-in and auth login")
    v_potato = embed("potato harvesting farming agriculture vegetables")

    sim_related = cosine(v1, v_login)
    sim_unrelated = cosine(v1, v_potato)
    assert sim_related > sim_unrelated, f"Expected {sim_related} > {sim_unrelated}"


def test_embed_batch_consistency():
    """Verify batch embedding produces identical vectors to single embed."""
    texts = ["api endpoint routing", "database schema migrations", "rate limiting middleware"]
    batch_vectors = embed_batch(texts)
    assert len(batch_vectors) == 3
    for i, t in enumerate(texts):
        single_vec = embed(t)
        assert cosine(batch_vectors[i], single_vec) > 0.999


def test_bm25_lexical_scoring():
    """Verify BM25 ranking discriminates exact token matches."""
    corpus = [
        {"content": "OAuth2 with PKCE flow for mobile authentication", "section": "sec"},
        {"content": "Database migrations using Alembic and PostgreSQL", "section": "db"},
        {"content": "Frontend styling tokens with CSS variables", "section": "ui"},
    ]
    scores = compute_bm25_scores(["oauth2", "pkce"], [[w.lower() for w in c["content"].split()] for c in corpus])
    assert scores[0] > scores[1]
    assert scores[0] > scores[2]


def test_hybrid_retrieval_prefers_multimodal_evidence():
    """Verify hybrid scoring fuses vector cosine and BM25 lexical correctly."""
    chunks = [
        {"content": "JWT authentication with RS256 signing keys and 15 minute expiration", "section": "Auth Standards", "source": "security-rfp.pdf"},
        {"content": "PostgreSQL database schemas with pgvector extension for similarity search", "section": "Data Model", "source": "database-spec.md"},
        {"content": "Agricultural potato farming harvest rotation", "section": "Farming", "source": "farming.txt"},
    ]
    hits = retrieve(chunks, "JWT authentication token expiration", k=2)
    assert len(hits) == 2
    assert hits[0]["source"] == "security-rfp.pdf"
    assert hits[0]["score"] > 0.5
    assert "similarity" in hits[0]
    assert "lexical" in hits[0]


def test_docx_document_ingestion_and_stats(client):
    """Test full document upload (including Word docx), chunking, embedding, query, and stats API."""
    docx = pytest.importorskip("docx")
    import uuid

    # 1. Register & create project
    email = f"rag_tester_{uuid.uuid4().hex[:8]}@dev.blue"
    r = client.post("/auth/register", json={"email": email, "password": "Password123!", "name": "RAG Tester"})
    assert r.status_code == 200
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    p = client.post("/projects", json={"name": "Fintech Platform", "product_idea": "Digital banking with cards"}, headers=headers).json()
    pid = p["id"]

    # 2. Check initial knowledge stats
    stats_initial = client.get(f"/projects/{pid}/knowledge/stats", headers=headers).json()
    init_docs = stats_initial.get("document_count", 0)
    init_chunks = stats_initial.get("chunk_count", 0)
    assert init_docs >= 0
    assert "embedding_provider" in stats_initial
    assert "vector_db" in stats_initial

    # 3. Create an in-memory DOCX file with multiple sections
    doc_file = docx.Document()
    doc_file.add_heading("Banking Security and PCI Compliance Standards", level=1)
    doc_file.add_paragraph("All cardholder data must be tokenized and encrypted with AES-256 at rest and in transit. " * 8)
    doc_file.add_paragraph("API gateways must enforce strict rate limits of 100 requests per minute per IP address. " * 8)
    doc_file.add_heading("Card Issuance Workflows and KYC Verification", level=2)
    doc_file.add_paragraph("Virtual card issuance requires two-factor authentication and identity document verification. " * 8)

    buf = io.BytesIO()
    doc_file.save(buf)
    buf.seek(0)

    # 4. Upload DOCX document
    upload_res = client.post(
        f"/projects/{pid}/documents",
        files={"file": ("fintech_security.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=headers,
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["chunks"] >= 1
    assert "checksum" in upload_data

    # 5. Verify stats updated
    stats_after = client.get(f"/projects/{pid}/knowledge/stats", headers=headers).json()
    assert stats_after["document_count"] == init_docs + 1
    assert stats_after["chunk_count"] > init_chunks

    # 6. Query the knowledge base
    query_res = client.post(
        f"/projects/{pid}/knowledge/query",
        json={"query": "What encryption is required for cardholder data?", "k": 3},
        headers=headers,
    )
    assert query_res.status_code == 200
    query_data = query_res.json()
    assert len(query_data["hits"]) > 0
    top_hit = query_data["hits"][0]
    assert "tokenized" in top_hit["content"] or "encrypted" in top_hit["content"]
    assert top_hit["score"] > 0.3

    # 7. Generate requirements and verify RAG grounding
    gen_res = client.post(
        f"/projects/{pid}/requirements/generate",
        json={"answers": "Need card issuance and banking controls"},
        headers=headers,
    )
    assert gen_res.status_code == 200
    reqs = client.get(f"/projects/{pid}/requirements", headers=headers).json()
    assert len(reqs) >= 8

    # Check AgentRun records knowledge grounding
    runs = client.get(f"/projects/{pid}/runs", headers=headers).json()
    req_run = next((r for r in runs if r["agent"] == "requirements"), None)
    assert req_run is not None
    assert "grounded" in req_run["output"] or "drafted" in req_run["output"]


def test_upload_json_yaml_sql_and_requirements_filtering(client):
    """Verify JSON/YAML/SQL upload support and requirements query filtering."""
    # Register user
    email = "polyglot_knowledge@test.com"
    client.post("/auth/register", json={"email": email, "password": "password123", "name": "Polyglot"})
    login_res = client.post("/auth/login", json={"email": email, "password": "password123"})
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create project
    proj_res = client.post("/projects", json={"name": "Polyglot Project", "product_idea": "Database API gateway"}, headers=headers)
    pid = proj_res.json()["id"]

    # 1. Upload JSON schema
    json_bytes = b'{"openapi": "3.0.0", "info": {"title": "Payment API", "version": "1.0.0"}, "paths": {"/pay": {"post": {"summary": "Process transaction"}}}}'
    res_json = client.post(
        f"/projects/{pid}/documents",
        files={"file": ("openapi.json", json_bytes, "application/json")},
        headers=headers,
    )
    assert res_json.status_code == 200
    assert res_json.json()["chunks"] >= 1

    # 2. Upload YAML config
    yaml_bytes = b"service: payment-gateway\nversion: 2.1\nrate_limit: 100 requests per minute\nsecurity: tls_1_3"
    res_yaml = client.post(
        f"/projects/{pid}/documents",
        files={"file": ("gateway_config.yaml", yaml_bytes, "text/yaml")},
        headers=headers,
    )
    assert res_yaml.status_code == 200
    assert res_yaml.json()["chunks"] >= 1

    # 3. Upload SQL schema
    sql_bytes = b"CREATE TABLE transactions (id UUID PRIMARY KEY, amount NUMERIC(10, 2), currency VARCHAR(3), status VARCHAR(20));"
    res_sql = client.post(
        f"/projects/{pid}/documents",
        files={"file": ("schema.sql", sql_bytes, "text/sql")},
        headers=headers,
    )
    assert res_sql.status_code == 200
    assert res_sql.json()["chunks"] >= 1

    # 4. Generate requirements
    client.post(f"/projects/{pid}/requirements/generate", json={"answers": "high throughput and low latency"}, headers=headers)

    # 5. Test requirements filtering: by status, by type, and by search term
    all_reqs = client.get(f"/projects/{pid}/requirements", headers=headers).json()
    assert len(all_reqs) > 0

    draft_reqs = client.get(f"/projects/{pid}/requirements?status=draft", headers=headers).json()
    assert len(draft_reqs) == len(all_reqs)

    non_existent = client.get(f"/projects/{pid}/requirements?status=rejected", headers=headers).json()
    assert len(non_existent) == 0

    # Search filtering
    first_title_word = all_reqs[0]["title"].split()[0]
    matched = client.get(f"/projects/{pid}/requirements?search={first_title_word}", headers=headers).json()
    assert len(matched) >= 1
    assert any(first_title_word.lower() in r["title"].lower() for r in matched)

