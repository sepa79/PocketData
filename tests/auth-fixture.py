"""Synthetic PH identity fixture; only for the isolated 8786 browser test app."""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

if os.environ.get("POCKETDATA_QA_AUTH_FIXTURE") != "1":
    raise SystemExit("Explicit isolated QA fixture opt-in is required")


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        valid = self.path == "/api/auth/me" and self.headers.get("Authorization") == "Bearer phweb_pocketdata_browser_fixture"
        document = {"id": "11111111-1111-1111-1111-111111111111", "active": True, "username": "local-admin", "displayName": "Synthetic QA editor", "authProvider": "DEV", "grants": []} if valid else {"error": "Fixture rejects this request"}
        body = json.dumps(document).encode()
        self.send_response(200 if valid else 401)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("127.0.0.1", 18786), FixtureHandler).serve_forever()
