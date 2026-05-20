"""Config accessor."""
from __future__ import annotations
from pathlib import Path
try: import yaml
except ImportError: yaml = None

ROOT = Path(__file__).resolve().parent.parent
YAML_CONFIG = ROOT / "config.yaml"
_cfg: dict = {}

def _parse_scalar(value: str):
    value = value.split(" #", 1)[0].strip()
    if value.lower() == "true": return True
    if value.lower() == "false": return False
    if value.startswith('"') and value.endswith('"'): return value[1:-1]
    try: return int(value)
    except ValueError: return value

def _parse_basic_yaml(text: str) -> dict:
    data, current, nested = {}, None, None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"): continue
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        if indent == 0 and line.endswith(":"):
            current = data[line[:-1]] = {}
            nested = None; continue
        if current is None: continue
        if indent == 2 and ":" in line:
            k, _, v = line.partition(":")
            k, v = k.strip(), v.strip()
            if v: current[k] = _parse_scalar(v); nested = None
            else: nested = [] if k == "cors_origins" else {}; current[k] = nested
            continue
        if indent == 4 and nested is not None:
            if isinstance(nested, list) and line.startswith("- "): nested.append(_parse_scalar(line[2:]))
            elif isinstance(nested, dict) and ":" in line:
                k, _, v = line.partition(":"); nested[_parse_scalar(k.strip())] = _parse_scalar(v.strip())
    return data

def _load_config() -> dict:
    if not YAML_CONFIG.exists(): raise FileNotFoundError(f"config.yaml not found at {YAML_CONFIG}")
    text = YAML_CONFIG.read_text(encoding="utf-8")
    data = (yaml.safe_load(text) if yaml else _parse_basic_yaml(text)) or {}
    return {"tmdb": data["tmdb"], "signing": data["signing"], "server": data["server"]}

def reload_config() -> dict:
    global _cfg; _cfg = _load_config(); return _cfg

def get_tmdb_key() -> str: return _cfg["tmdb"]["api_key"]
def get_tmdb_base() -> str: return _cfg["tmdb"]["base_url"]
def get_signing_config() -> dict: return _cfg["signing"]
def get_cors_origins() -> list[str]: return _cfg["server"]["cors_origins"]
reload_config()
