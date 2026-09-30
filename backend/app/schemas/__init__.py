"""Pydantic schemas (API contract, §27)."""
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    """New account request (password length enforced at the boundary)."""
    email: str = Field(min_length=3, max_length=254, pattern=r"^\S+@\S+\.\S+$")
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ResetIn(BaseModel):
    """Password reset (self-hosted: no email loop — the account owner resets directly)."""
    email: str = Field(min_length=3, max_length=254)
    new_password: str = Field(min_length=8, max_length=128)


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=4000)
    product_idea: str = Field(default="", max_length=8000)


class RequirementIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=8000)
    type: str = Field(default="functional", max_length=32)
    priority: str = Field(default="medium", max_length=16)
    acceptance_criteria: str = Field(default="", max_length=8000)


class RequirementUpdate(BaseModel):
    """Partial requirement edit; expected_version enables optimistic locking."""
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    expected_version: int | None = None


class ClarifyIn(BaseModel):
    answers: str = ""
    replace: bool = False  # True = delete existing requirements first (no duplicate appends)


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
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="service", min_length=1, max_length=32)
    description: str = Field(default="", max_length=2000)
    boundary: str = Field(default="", max_length=120)
