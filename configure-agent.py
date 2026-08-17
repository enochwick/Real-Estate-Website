#!/usr/bin/env python3
"""Register Meridian's client tools and prompt on the ElevenLabs agent.

The five tools below must exist on the agent for the voice experience to render
anything — the handlers live in js/drivers/elevenlabs.js and run in the
visitor's browser, but the agent only calls a tool it has been told about.

Usage:

    export ELEVENLABS_API_KEY=...          # never commit this
    python3 configure-agent.py --dry-run   # show what would change
    python3 configure-agent.py             # apply it

The agent id is read from the <meta name="meridian:agent-id"> tag in
index.html, or passed with --agent-id.

Safe to re-run: tools are matched by name and updated in place rather than
duplicated, and existing tool ids already on the agent are preserved.

No key is written anywhere. It is read from the environment and used only for
these requests.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

API = "https://api.elevenlabs.io/v1"
HERE = os.path.dirname(os.path.abspath(__file__))

# ── The tools, mirroring js/drivers/elevenlabs.js ──────────────────────
# Descriptions are written for the agent, not for us: they say when to call.
TOOLS = [
    {
        "type": "client",
        "name": "recommend_residence",
        "description": (
            "Rank the residences against what the visitor has described and show "
            "the best match on screen. Call this once you know something real "
            "about what they want — floor, light, bedroom separation, "
            "entertaining, or budget. Returns the top matches with their codes, "
            "floors, sizes and prices; talk about those and nothing else."
        ),
        "expects_response": True,
        "response_timeout_secs": 20,
        "execution_mode": "immediate",
        "parameters": {
            "type": "object",
            "properties": {
                "brief": {
                    "type": "string",
                    "description": (
                        "What the visitor is looking for, in their own words. "
                        "E.g. 'three bedrooms around five million, high floor, "
                        "west facing, entertains often'."
                    ),
                }
            },
            "required": ["brief"],
        },
    },
    {
        "type": "client",
        "name": "show_residence",
        "description": (
            "Show one specific residence on screen and return its details. Call "
            "this when the visitor asks about a residence by its code. Returns "
            "an error listing the real codes if the code does not exist."
        ),
        "expects_response": True,
        "response_timeout_secs": 20,
        "execution_mode": "immediate",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The residence code, e.g. '44B'.",
                }
            },
            "required": ["code"],
        },
    },
    {
        "type": "client",
        "name": "compare_residences",
        "description": (
            "Compare two residences and show the first on screen. Call this when "
            "the visitor is weighing two against each other. Returns a written "
            "comparison covering floor, outlook, size and price."
        ),
        "expects_response": True,
        "response_timeout_secs": 20,
        "execution_mode": "immediate",
        "parameters": {
            "type": "object",
            "properties": {
                "code_a": {"type": "string", "description": "First residence code, e.g. '41A'."},
                "code_b": {"type": "string", "description": "Second residence code, e.g. '44B'."},
            },
            "required": ["code_a", "code_b"],
        },
    },
    {
        "type": "client",
        "name": "schedule_viewing",
        "description": (
            "Open the enquiry form on screen, pre-filled with the residence "
            "under discussion. Call this only after the visitor has asked to see "
            "somewhere in person. Then tell them the form is on screen and that "
            "you need a name and an email."
        ),
        "expects_response": True,
        "response_timeout_secs": 20,
        "execution_mode": "immediate",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The residence code they want to see, e.g. '47C'.",
                }
            },
            "required": ["code"],
        },
    },
    {
        "type": "client",
        "name": "list_residences",
        "description": (
            "Return every residence currently represented, with codes, floors, "
            "sizes and prices. Call this when the visitor asks what is available "
            "rather than describing what they want."
        ),
        "expects_response": True,
        "response_timeout_secs": 20,
        "execution_mode": "immediate",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
]

FIRST_MESSAGE = (
    "This is Meridian. Tell me what you're looking for and I'll point you at "
    "the two or three worth your time."
)


def request(method, path, key, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "xi-api-key": key,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:500]
        if e.code == 401:
            sys.exit("401 from ElevenLabs — check ELEVENLABS_API_KEY.\n" + detail)
        if e.code == 404:
            sys.exit(f"404 on {method} {path} — check the agent id.\n" + detail)
        sys.exit(f"{e.code} on {method} {path}\n{detail}")


def agent_id_from_index():
    path = os.path.join(HERE, "index.html")
    if not os.path.exists(path):
        return None
    m = re.search(r'name="meridian:agent-id"\s+content="([^"]*)"', open(path).read())
    return (m.group(1).strip() or None) if m else None


def tool_identity(entry):
    """The list endpoint has shifted shape before; accept the variants."""
    tid = entry.get("id") or entry.get("tool_id")
    cfg = entry.get("tool_config") or entry
    return tid, cfg.get("name")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent-id", default=agent_id_from_index())
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("Set ELEVENLABS_API_KEY first:  export ELEVENLABS_API_KEY=...")
    if not args.agent_id:
        sys.exit("No agent id — pass --agent-id, or fill in the meta tag in index.html.")

    prompt = open(os.path.join(HERE, "agent-prompt.md")).read().strip()

    if args.dry_run:
        print(f"agent      : {args.agent_id}")
        print(f"tools      : {', '.join(t['name'] for t in TOOLS)}")
        print(f"prompt     : agent-prompt.md, {len(prompt)} chars")
        print(f"first line : {FIRST_MESSAGE}")
        print("\nNothing sent. Drop --dry-run to apply.")
        return

    # ── Tools: reuse by name so re-runs don't pile up duplicates ──────
    existing = request("GET", "/convai/tools", key)
    entries = existing.get("tools", existing) if isinstance(existing, dict) else existing
    by_name = {}
    for entry in entries or []:
        tid, name = tool_identity(entry)
        if tid and name:
            by_name[name] = tid

    tool_ids = []
    for tool in TOOLS:
        name = tool["name"]
        if name in by_name:
            tid = by_name[name]
            request("PATCH", f"/convai/tools/{tid}", key, {"tool_config": tool})
            print(f"updated  {name}  ({tid})")
        else:
            created = request("POST", "/convai/tools", key, {"tool_config": tool})
            tid = created.get("id") or created.get("tool_id")
            if not tid:
                sys.exit(f"Created {name} but no id came back:\n{json.dumps(created)[:400]}")
            print(f"created  {name}  ({tid})")
        tool_ids.append(tid)

    # ── Agent: merge with whatever is already attached ────────────────
    agent = request("GET", f"/convai/agents/{args.agent_id}", key)
    current = (
        agent.get("conversation_config", {})
        .get("agent", {})
        .get("prompt", {})
        .get("tool_ids", [])
    ) or []
    merged = list(dict.fromkeys([*current, *tool_ids]))

    request(
        "PATCH",
        f"/convai/agents/{args.agent_id}",
        key,
        {
            "conversation_config": {
                "agent": {
                    "prompt": {"prompt": prompt, "tool_ids": merged},
                    "first_message": FIRST_MESSAGE,
                }
            }
        },
    )
    print(f"\nagent updated — prompt, first message, {len(merged)} tool(s) attached.")
    print("Open the site and try: “Something high up with sunset views.”")


if __name__ == "__main__":
    main()
