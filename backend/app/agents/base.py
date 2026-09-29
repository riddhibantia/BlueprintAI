"""Deterministic mock LLM + OpenAI-ready adapter (§43: never invent metrics)."""
import logging
import time
from app.core.config import settings

log = logging.getLogger("devblueprint.llm")


def _mock_complete(prompt: str, context: str = "") -> tuple[str, int]:
    head = (context[:400] + " ") if context else ""
    body = f"{head}Generated from: {prompt[:220]}".strip()
    return body, len(body.split())


def complete(prompt: str, context: str = "", system: str = "") -> dict:
    """Returns {text, tokens, latency_ms, provider}. Real inference only if configured.

    Any OpenAI-compatible endpoint works via OPENAI_BASE_URL (Gemini, Groq,
    OpenRouter…) — not just api.openai.com. Failures fall back to the mock.
    """
    t0 = time.time()
    if settings.use_openai:
        try:
            from openai import OpenAI
            kwargs: dict = {"api_key": settings.OPENAI_API_KEY, "timeout": 30}
            if settings.OPENAI_BASE_URL:
                kwargs["base_url"] = settings.OPENAI_BASE_URL
            client = OpenAI(**kwargs)
            msgs = []
            if system:
                msgs.append({"role": "system", "content": system})
            msgs.append({"role": "user", "content": (context + "\n\n" + prompt) if context else prompt})
            r = client.chat.completions.create(model=settings.OPENAI_MODEL, messages=msgs, temperature=0.2)
            txt = r.choices[0].message.content or ""
            tok = getattr(r.usage, "total_tokens", len(txt.split())) if getattr(r, "usage", None) else len(txt.split())
            return {"text": txt, "tokens": int(tok), "latency_ms": int((time.time() - t0) * 1000), "provider": "openai"}
        except Exception as e:
            # Never persist upstream error text into artifacts (info leak + prompt
            # pollution). Fall back to deterministic mock; details go to server logs.
            log.warning("openai fallback: %s", type(e).__name__)
            txt, tok = _mock_complete(prompt, context)
            return {"text": f"[openai-fallback] {txt}", "tokens": tok,
                    "latency_ms": int((time.time() - t0) * 1000), "provider": "mock"}
    txt, tok = _mock_complete(prompt, context)
    return {"text": txt, "tokens": tok, "latency_ms": int((time.time() - t0) * 1000), "provider": "mock"}
