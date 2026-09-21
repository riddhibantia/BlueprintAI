"""Pydantic schemas (API contract, §27)."""
from pydantic import BaseModel


class RegisterIn(BaseModel):
    email: str
    password: str
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
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None


class ClarifyIn(BaseModel):
    answers: str = ""


class IdCode(BaseModel):
    code: str
