#!/usr/bin/env python3
"""Credential-free checks for this approved, disabled review deployment only."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

PREVIEW = "https://finance-tracker-git-feat-remote-exp-27c3b1-andrewoplas-projects.vercel.app"
REPOSITORY = "andrewoplas/finance-tracker"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


opener = urllib.request.build_opener(NoRedirect)


def fetch(url, data=None):
    request = urllib.request.Request(
        url, data=data,
        headers={"User-Agent": "finance-disabled-preview-check", "Accept": "application/json, text/event-stream",
                 **({"Content-Type": "application/json"} if data else {})},
    )
    try:
        response = opener.open(request, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers, response.read(300_000)


def main():
    sha = os.environ.get("GITHUB_SHA", "")
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        raise RuntimeError("A full GitHub commit SHA is required")
    # Public repository status only: no GitHub/Vercel token or cookie is used.
    for attempt in range(24):
        status, _, body = fetch(f"https://api.github.com/repos/{REPOSITORY}/commits/{sha}/status")
        if status != 200:
            raise RuntimeError(f"Public commit-status lookup returned HTTP {status}")
        statuses = json.loads(body)["statuses"]
        vercel = next((entry for entry in statuses if entry["context"] == "Vercel"), None)
        if vercel and vercel["state"] == "success":
            print(json.dumps({"commit": sha, "deployment": "ready", "details": vercel["target_url"]}), flush=True)
            break
        if vercel and vercel["state"] in ("error", "failure"):
            raise RuntimeError("Vercel deployment failed")
        if attempt == 23:
            raise RuntimeError("Vercel readiness was not confirmed within eight minutes")
        time.sleep(20)

    initialize = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-11-25", "capabilities": {},
        "clientInfo": {"name": "unauthenticated-preview-check", "version": "1"},
    }}).encode()
    outcomes = []
    for path, data, expected in [
        ("/api/mcp/expenses", None, "Remote MCP is disabled"),
        ("/.well-known/oauth-protected-resource/api/mcp/expenses", None, "Remote MCP is disabled"),
        ("/api/mcp/expenses", initialize, "Remote MCP is disabled"),
        ("/api/mcp", None, "MCP is disabled"),
    ]:
        status, headers, body = fetch(PREVIEW + path, data)
        content_type = headers.get("Content-Type", "")
        parsed = json.loads(body) if "application/json" in content_type else None
        error = parsed.get("error") if isinstance(parsed, dict) else None
        error_code = error.get("code") if isinstance(error, dict) else None
        if status == 404 and parsed == {"error": expected}:
            if "no-store" not in headers.get("Cache-Control", ""):
                raise RuntimeError("Disabled response must not be cached")
            outcome = "application_disabled"
        elif (status == 401 and "text/html" in content_type
              and headers.get("x-vercel-id")
              and b"Authentication Required" in body):
            outcome = "vercel_authentication_gate_application_unobserved"
        elif (status == 401 and headers.get("x-vercel-id")
              and (error_code == "AUTHENTICATION_REQUIRED" or error == "Authentication Required")):
            outcome = "vercel_authentication_gate_application_unobserved"
        elif status in (302, 303, 307, 308):
            location = urllib.parse.urlparse(headers.get("Location", ""))
            if location.scheme != "https" or location.hostname != "vercel.com" or not location.path.startswith("/sso-api"):
                raise RuntimeError(f"Unexpected redirect for {path}")
            outcome = "vercel_authentication_gate_application_unobserved"
        else:
            # No body/header dump: even an unexpected response must not leak data.
            safe_code = error_code if isinstance(error_code, str) and error_code.isupper() and len(error_code) < 80 else None
            print(json.dumps({"path": path, "status": status, "vercel_response": bool(headers.get("x-vercel-id")),
                              "error_code": safe_code}), flush=True)
            raise RuntimeError(f"Unexpected HTTP {status} ({content_type}) for {path}")
        result = {"method": "POST" if data else "GET", "path": path, "status": status, "result": outcome}
        outcomes.append(result)
        print(json.dumps(result), flush=True)
    print(json.dumps({"preview": PREVIEW, "unauthenticated_access": "denied", "application_responses_observed":
                      all(item["result"] == "application_disabled" for item in outcomes)}), flush=True)


if __name__ == "__main__":
    main()
