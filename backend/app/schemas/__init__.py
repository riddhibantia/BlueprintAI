"""Pydantic schemas (API contract, §27)."""
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    """New account request (password length enforced at the boundary)."""
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


class ProjectIn(BaseModel):
    name: str
    description: str = ""
    product_idea: str = ""


class RequirementIn(BaseModel):
    title: str
    description: str = ""
    type: str = "functional"
    priority: str = "medium"
    acceptance_criteria: str = ""


class RequirementUpdate(BaseModel):
    """Partial requirement edit; expected_version enables optimistic locking."""
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    expected_version: int | None = None


class ClarifyIn(BaseModel):
    answers: str = ""


class IdCode(BaseModel):
    code: str


class PrdUpdate(BaseModel):
    """PRD edit (§6.4: the PRD remains editable after generation)."""
    content: dict | None = None
    status: str | None = None


class StatusPatch(BaseModel):
    """Status change for tasks and consistency-issue decisions."""
    status: str


class ComponentIn(BaseModel):
    """New architecture component (§8: components, boundaries)."""
    name: str
    kind: str = "service"
    description: str = ""
    boundary: str = ""
