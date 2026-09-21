#!/usr/bin/env python3
"""Optional loopback bridge for Laya's multilingual checkpoint. No cloud calls."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

MAX_BYTES = 28_000


def handler_for(agent):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log task text or authorization headers.

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass  # The caller may have cancelled its request.

        def do_GET(self):
            self.reply(200 if self.path == "/health" else 404,
                       {"model": "laya-multilingual", "ready": self.path == "/health"})

        def do_POST(self):
            if self.path != "/v1/systemone":
                return self.reply(404, {"message": "Unknown endpoint"})
            if self.headers.get("Origin") or self.headers.get("Authorization") != "Bearer local-laya":
                return self.reply(403, {"message": "Local router requests only"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BYTES:
                    return self.reply(413, {"message": "Local request exceeds byte budget"})
                payload = json.loads(self.rfile.read(size))
                state, questions = payload["state"], payload["questions"]
                if not isinstance(state, (str, dict, list)) or not isinstance(questions, dict) or not questions:
                    raise ValueError("Invalid state or questions")
                if len(questions) > 20 or any(q.get("type") == "choice" and len(q.get("criteria", {})) > 20 for q in questions.values()):
                    raise ValueError("Local classifier supports at most 20 questions/options")
                # Laya reserves head_max_len tokens for questions/options. Reject
                # oversized state instead of silently classifying its truncated prefix.
                from laya.common import serialize_state
                tokens = agent.tok(serialize_state(state), add_special_tokens=False)["input_ids"]
                if len(tokens) > agent.cfg.get("max_len", 1024) - agent.cfg.get("head_max_len", 256) - 4:
                    return self.reply(413, {"message": "State exceeds Laya multilingual context budget; use Jev"})
                result = agent.predict(state, questions)
                self.reply(200, result)
            except (ValueError, KeyError, TypeError, AttributeError):
                self.reply(422, {"message": "Invalid local evaluation request"})
            except Exception:
                self.reply(500, {"message": "Local evaluation failed"})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    import laya
    # Download/load once before accepting requests. English and Korean use the
    # same multilingual checkpoint, without language-dependent model switching.
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual", device="cpu")
    server = HTTPServer(("127.0.0.1", args.port), handler_for(agent))
    print(f"Laya multilingual ready at http://127.0.0.1:{args.port}/v1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
