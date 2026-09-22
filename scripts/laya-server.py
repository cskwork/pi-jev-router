#!/usr/bin/env python3
"""Optional loopback bridge for Laya's multilingual checkpoint. No cloud calls."""
import argparse
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 28_000
MAX_QUESTIONS = 20
MAX_CHOICES = 20
# Connection handling is threaded so /health stays responsive, but inference is a
# single slot: one loaded model, one active prediction, a small bounded queue.
QUEUE_SLOTS = 2
QUEUE_WAIT_SECONDS = 5.0
SOCKET_TIMEOUT_SECONDS = 15.0


def limits():
    return {"maxQuestions": MAX_QUESTIONS, "maxChoices": MAX_CHOICES, "maxRequestBytes": MAX_BYTES, "queueSlots": QUEUE_SLOTS, "queueWaitSeconds": QUEUE_WAIT_SECONDS}


def handler_for(agent, queue_wait=QUEUE_WAIT_SECONDS, socket_timeout=SOCKET_TIMEOUT_SECONDS):
    inference = threading.Lock()
    admission = threading.BoundedSemaphore(QUEUE_SLOTS)
    queued = [0]
    counter = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        timeout = socket_timeout  # Abandoned clients cannot hold a connection thread forever.

        def log_message(self, *_args):
            pass  # Never log task text or authorization headers.

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, socket.timeout):
                pass  # The caller may have cancelled its request.

        def do_GET(self):
            if self.path != "/health":
                return self.reply(404, {"model": "laya-multilingual", "ready": False})
            self.reply(200, {"model": "laya-multilingual", "ready": True, "busy": inference.locked(), "queued": queued[0], "limits": limits()})

        def do_POST(self):
            if self.path != "/v1/systemone":
                return self.reply(404, {"message": "Unknown endpoint"})
            if self.headers.get("Origin") or self.headers.get("Authorization") != "Bearer local-laya":
                return self.reply(403, {"message": "Local router requests only"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BYTES:
                    return self.reply(413, {"message": "Local request exceeds byte budget"})
                try:
                    raw = self.rfile.read(size)
                except socket.timeout:
                    return self.reply(408, {"message": "Request body timed out"})
                if len(raw) < size:
                    return self.reply(400, {"message": "Incomplete request body"})
                payload = json.loads(raw)
                state, questions = payload["state"], payload["questions"]
                if not isinstance(state, (str, dict, list)) or not isinstance(questions, dict) or not questions:
                    raise ValueError("Invalid state or questions")
                if len(questions) > MAX_QUESTIONS or any(q.get("type") == "choice" and len(q.get("criteria", {})) > MAX_CHOICES for q in questions.values()):
                    raise ValueError("Local classifier supports at most 20 questions/options")
                # Laya reserves head_max_len tokens for questions/options. Reject
                # oversized state instead of silently classifying its truncated prefix.
                from laya.common import serialize_state
                tokens = agent.tok(serialize_state(state), add_special_tokens=False)["input_ids"]
                if len(tokens) > agent.cfg.get("max_len", 1024) - agent.cfg.get("head_max_len", 256) - 4:
                    return self.reply(413, {"message": "State exceeds Laya multilingual context budget; use Jev"})
            except (ValueError, KeyError, TypeError, AttributeError):
                return self.reply(422, {"message": "Invalid local evaluation request"})
            except Exception:
                return self.reply(500, {"message": "Local evaluation failed"})
            # Validation is complete; now compete for the single inference slot.
            if not admission.acquire(blocking=False):
                return self.reply(503, {"message": "Local evaluator busy; queue is full", "retryable": True})
            try:
                with counter:
                    queued[0] += 1
                acquired = inference.acquire(timeout=queue_wait)
                with counter:
                    queued[0] -= 1
                if not acquired:
                    return self.reply(503, {"message": "Local evaluator busy; request expired while queued", "retryable": True})
                try:
                    result = agent.predict(state, questions)
                except Exception:
                    return self.reply(500, {"message": "Local evaluation failed"})
                finally:
                    inference.release()
                self.reply(200, result)
            finally:
                admission.release()

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--queue-wait", type=float, default=QUEUE_WAIT_SECONDS, help="seconds a request may wait for the inference slot")
    args = parser.parse_args()
    import laya
    # Download/load once before accepting requests. English and Korean use the
    # same multilingual checkpoint, without language-dependent model switching.
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual", device="cpu")
    server = Server(("127.0.0.1", args.port), handler_for(agent, queue_wait=args.queue_wait))
    print(f"Laya multilingual ready at http://127.0.0.1:{args.port}/v1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
