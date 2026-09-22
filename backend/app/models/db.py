"""Full data model per spec §25/§26. SQLite-compatible; pgvector used only on Postgres."""
import uuid
from datetime import datetime
from sqlalchemy import (Column, String, Text, DateTime, ForeignKey, Integer, Float, Boolean, JSON)
from app.core.database import Base


def _id():
    return str(uuid.uuid4())


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_id)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, default="")


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, default=_id)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    product_idea = Column(Text, default="")
    owner_id = Column(String, ForeignKey("users.id"))
    status = Column(String, default="draft")  # draft|active|archived
    blueprint_status = Column(String, default="Draft")


class ProjectMember(Base):
    __tablename__ = "project_members"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"))
    role = Column(String, default="editor")  # owner|editor|viewer


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, index=True)  # REQ-001 (stable, human-facing)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    type = Column(String, default="functional")  # functional|non-functional|business-rule|constraint|security
    priority = Column(String, default="medium")
    status = Column(String, default="draft")  # draft|approved|rejected|changed
    acceptance_criteria = Column(Text, default="")
    version = Column(Integer, default=1)


class UserStory(Base, TimestampMixin):
    __tablename__ = "user_stories"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, index=True)  # US-001
    title = Column(String, default="")
    story = Column(Text, default="")  # As a... I want... so that...
    requirement_code = Column(String, default="")  # source REQ link (denormalized) + traceability_links
    status = Column(String, default="draft")


class AcceptanceCriteria(Base):
    __tablename__ = "acceptance_criteria"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    story_id = Column(String, ForeignKey("user_stories.id"))
    text = Column(Text, nullable=False)


class ArchitectureComponent(Base, TimestampMixin):
    __tablename__ = "architecture_components"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    name = Column(String, nullable=False)
    kind = Column(String, default="service")  # frontend|api|service|database|external|queue...
    description = Column(Text, default="")
    boundary = Column(String, default="")  # auth/deployment boundary


class ArchitectureRelationship(Base):
    __tablename__ = "architecture_relationships"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    source = Column(String, nullable=False)
    target = Column(String, nullable=False)
    label = Column(String, default="")


class DatabaseEntity(Base, TimestampMixin):
    __tablename__ = "database_entities"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, default="")  # DB-001 (stable, human-facing)
    name = Column(String, nullable=False)
    description = Column(Text, default="")


class DatabaseField(Base):
    __tablename__ = "database_fields"
    id = Column(String, primary_key=True, default=_id)
    entity_id = Column(String, ForeignKey("database_entities.id"), index=True)
    name = Column(String, nullable=False)
    dtype = Column(String, default="text")
    is_pk = Column(Boolean, default=False)
    is_fk = Column(Boolean, default=False)
    references = Column(String, default="")
    nullable = Column(Boolean, default=True)


class ApiEndpoint(Base, TimestampMixin):
    __tablename__ = "api_endpoints"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, default="")  # API-014
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    auth = Column(String, default="jwt")
    request_schema = Column(JSON, default=dict)
    response_schema = Column(JSON, default=dict)
    status_codes = Column(JSON, default=list)


class SecurityRequirement(Base, TimestampMixin):
    __tablename__ = "security_requirements"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, default="")  # SEC-004
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    scope = Column(String, default="api")  # auth|api|data|infra...


class ImplementationTask(Base, TimestampMixin):
    __tablename__ = "implementation_tasks"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, default="")  # TASK-042
    epic = Column(String, default="")
    title = Column(String, nullable=False)
    requirement_code = Column(String, default="")
    priority = Column(String, default="medium")
    status = Column(String, default="todo")


class TestCase(Base, TimestampMixin):
    __tablename__ = "test_cases"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    code = Column(String, default="")  # TEST-031
    title = Column(String, nullable=False)
    kind = Column(String, default="acceptance")  # unit|integration|api|security|acceptance
    requirement_code = Column(String, default="")
    steps = Column(Text, default="")
    expected = Column(Text, default="")


class TraceabilityLink(Base):
    __tablename__ = "traceability_links"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    source_type = Column(String, nullable=False)  # requirement|story|api|db|security|task|test...
    source_id = Column(String, nullable=False)  # stable code e.g. REQ-001
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    relationship_type = Column(String, default="implements")
    created_at = Column(DateTime, default=datetime.utcnow)


class ConsistencyIssue(Base, TimestampMixin):
    __tablename__ = "consistency_issues"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    check = Column(String, nullable=False)  # req-api, api-db, sec-api, req-test...
    severity = Column(String, default="warning")  # info|warning|conflict
    description = Column(Text, nullable=False)
    affected = Column(JSON, default=list)
    suggestion = Column(Text, default="")
    status = Column(String, default="open")  # open|accepted|rejected|resolved


class ImpactRun(Base):
    __tablename__ = "impact_analysis_runs"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    requirement_code = Column(String, nullable=False)
    affected = Column(JSON, default=list)
    explanation = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base, TimestampMixin):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    name = Column(String, nullable=False)
    source = Column(String, default="upload")
    version = Column(String, default="1.0")
    checksum = Column(String, default="")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(String, primary_key=True, default=_id)
    document_id = Column(String, ForeignKey("documents.id"), index=True)
    page_number = Column(Integer, default=0)
    section = Column(String, default="")
    content = Column(Text, nullable=False)
    meta = Column("metadata", JSON, default=dict)
    embedding = Column(JSON, default=list)  # list[float]; pgvector native column used via migration on Postgres


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    agent = Column(String, nullable=False)
    stage = Column(String, default="")
    input_summary = Column(Text, default="")
    output_summary = Column(Text, default="")
    evidence = Column(JSON, default=list)
    latency_ms = Column(Integer, default=0)
    tokens = Column(Integer, default=0)
    status = Column(String, default="done")
    created_at = Column(DateTime, default=datetime.utcnow)


class ArtifactVersion(Base):
    __tablename__ = "artifact_versions"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    artifact_type = Column(String, nullable=False)
    artifact_code = Column(String, default="")
    version = Column(Integer, default=1)
    content = Column(JSON, default=dict)
    status = Column(String, default="generated")  # generated|approved
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, default="")
    user_id = Column(String, default="")
    action = Column(String, nullable=False)
    detail = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Prd(Base, TimestampMixin):
    __tablename__ = "prds"
    id = Column(String, primary_key=True, default=_id)
    project_id = Column(String, ForeignKey("projects.id"), index=True, unique=True)
    content = Column(JSON, default=dict)
    status = Column(String, default="draft")
