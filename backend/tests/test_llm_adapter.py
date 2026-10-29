"""LLM adapter: configured path is really used; failures are labelled, not hidden."""
import sys
import types

from app.agents.base import complete
from app.core.config import settings


def _install_fake_openai(monkeypatch, *, fail=False, captured=None):
    class FakeCompletions:
        def create(self, **kwargs):
            if captured is not None:
                captured.update(kwargs)
            if fail:
                raise RuntimeError("upstream is down")
            message = types.SimpleNamespace(content="real model answer")
            usage = types.SimpleNamespace(total_tokens=7)
            return types.SimpleNamespace(
                choices=[types.SimpleNamespace(message=message)], usage=usage)

    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.init_kwargs = kwargs
            self.chat = types.SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setitem(sys.modules, "openai",
                        types.SimpleNamespace(OpenAI=FakeOpenAI))


def _configure(monkeypatch, provider="openai", key="test-key"):
    monkeypatch.setattr(settings, "LLM_PROVIDER", provider)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", key)


def test_mock_is_the_default(monkeypatch):
    _configure(monkeypatch, provider="mock", key="")
    out = complete("draft requirements", "context")
    assert out["provider"] == "mock"
    assert not out["text"].startswith("[openai-fallback]")


def test_configured_provider_is_actually_called(monkeypatch):
    _configure(monkeypatch)
    captured = {}
    _install_fake_openai(monkeypatch, captured=captured)
    out = complete("draft requirements", "retrieved standards", system="be terse")

    assert out["provider"] == "openai"
    assert out["text"] == "real model answer"
    assert out["tokens"] == 7
    assert captured["model"] == settings.OPENAI_MODEL
    assert captured["temperature"] == 0.2
    roles = [m["role"] for m in captured["messages"]]
    assert roles == ["system", "user"]
    assert "retrieved standards" in captured["messages"][1]["content"]


def test_upstream_failure_falls_back_and_is_labelled(monkeypatch):
    _configure(monkeypatch)
    _install_fake_openai(monkeypatch, fail=True)
    out = complete("draft requirements", "retrieved standards")

    assert out["provider"] == "mock"
    assert out["text"].startswith("[openai-fallback]")
    # The fallback still answers; it never persists the upstream error text.
    assert "upstream is down" not in out["text"]
