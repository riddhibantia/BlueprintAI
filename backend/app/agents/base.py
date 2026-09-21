"""Deterministic mock LLM + OpenAI-ready adapter (§43: never invent metrics)."""
import time
from app.core.config import settings


def _mock_complete(prompt: str, context: str = "") -> tuple[str, int]:
    head = (context[:400] + " ") if context else ""
    body = f"{head}Generated from: {prompt[:220]}".strip()
    return body, len(body.split())


def complete(prompt: str, context: str = "", system: str = "") -> dict:
    """Returns {text, tokens, latency_ms, provider}. Real OpenAI used only if configured."""
    t0 = time.time()
    if settings.use_openai:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            msgs = []
            if system:
                msgs.append({"role": "system", "content": system})
            msgs.append({"role": "user", "content": (context + "\n\n" + prompt) if context else prompt})
            r = client.chat.completions.create(model=settings.OPENAI_MODEL, messages=msgs, temperature=0.2)
            txt = r.choices[0].message.content or ""
            tok = getattr(r.usage, "total_tokens", len(txt.split())) if getattr(r, "usage", None) else len(txt.split())
            return {"text": txt, "tokens": int(tok), "latency_ms": int((time.time() - t0) * 1000), "provider": "openai"}
        except Exception as e:
            txt, tok = _mock_complete(prompt, context)
            return {"text": f"[openai-fallback] {txt} (err: {e})", "tokens": tok,
                    "latency_ms": int((time.time() - t0) * 1000), "provider": "mock"}
    txt, tok = _mock_complete(prompt, context)
    return {"text": txt, "tokens": tok, "latency_ms": int((time.time() - t0) * 1000), "provider": "mock"}
