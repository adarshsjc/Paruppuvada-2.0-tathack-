"""check_ollama.py — one-command model integration check.

Run this AFTER you install the model you chose (3B or ~9B):

    python check_ollama.py                 # checks the configured OLLAMA_MODEL
    python check_ollama.py qwen2.5:7b     # checks a specific tag

It verifies, in order:
  1. The Ollama server is reachable.
  2. The model tag exists in `ollama list` (local registry).
  3. One live chat completion works through the same OpenAI-compatible
     endpoint the agent uses (http://localhost:11434/v1).

Then it prints the exact lines to put in backend/.env. No dependencies
beyond the Python standard library.
"""
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.config import settings  # noqa: E402

TIMEOUT = 30


def _get(url: str):
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _post(url: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    tag = sys.argv[1] if len(sys.argv) > 1 else settings.ollama_model
    base = settings.ollama_base_url  # e.g. http://localhost:11434/v1
    root = base.rsplit("/v1", 1)[0]  # http://localhost:11434
    ok = True

    print("=" * 62)
    print("Open Chat — Ollama model integration check")
    print("=" * 62)

    # 1) server up
    try:
        version = _get(f"{root}/api/version")
        print(f"[OK]   Ollama server reachable at {root} (version {version.get('version')})")
    except Exception as e:
        print(f"[FAIL] Ollama server not reachable at {root}: {e}")
        print("       Start it with:  ollama serve   (or launch the Ollama app)")
        return 1

    # 2) model present
    try:
        tags = [m["name"] for m in _get(f"{root}/api/tags").get("models", [])]
        present = any(t == tag or t.split(":")[0] == tag for t in tags)
        if present:
            print(f"[OK]   Model '{tag}' is installed (found in `ollama list`).")
        else:
            ok = False
            print(f"[FAIL] Model '{tag}' is NOT installed.")
            print(f"       Installed tags: {', '.join(tags) or '(none)'}")
            print(f"       Install it with:  ollama pull {tag}")
            print("       Note: 'qwen2.5:9b' does not exist in the registry;")
            print("             Qwen2.5 ships 0.5b/1.5b/3b/7b/14b/32b/72b.")
    except Exception as e:
        ok = False
        print(f"[FAIL] Could not list models: {e}")

    # 3) live completion through the endpoint the agent uses
    try:
        res = _post(f"{base}/chat/completions", {
            "model": tag,
            "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
            "max_tokens": 8,
            "temperature": 0,
        })
        text = (res.get("choices") or [{}])[0].get("message", {}).get("content", "")
        print(f"[OK]   Live completion via {base}/chat/completions -> {text.strip()!r}")
    except Exception as e:
        ok = False
        print(f"[FAIL] Live completion failed: {e}")

    print("-" * 62)
    if ok:
        print("All checks passed. Put these lines in backend/.env:")
        print("  USE_MOCK_LLM=False")
        print(f"  OLLAMA_MODEL={tag}")
        print("Then restart the backend and run the sales-report task in the GUI.")
    else:
        print("Fix the [FAIL] items above and re-run this script.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
