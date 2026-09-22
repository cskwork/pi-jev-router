import importlib.util
import json
import socket
from pathlib import Path
import sys
import threading
import time
import types
import unittest
from http.client import HTTPConnection

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).with_name('laya-server.py'))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.seen = []
        self.original = sys.modules.get('laya.common')
        sys.modules['laya.common'] = types.SimpleNamespace(serialize_state=lambda value: json.dumps(value, ensure_ascii=False))
        self.release = threading.Event(); self.release.set()
        self.active = []
        def predict(state, questions):
            self.active.append(state)
            self.release.wait(5)
            self.active.remove(state)
            self.seen.append(state)
            return {'answers': {'route': {'type': 'choice', 'choice': 'a', 'probabilities': {'a': 1}}}}
        agent = types.SimpleNamespace(tok=lambda value, **kw: {'input_ids': list(value)}, cfg={'max_len': 1024, 'head_max_len': 256}, predict=predict)
        self.server = bridge.Server(('127.0.0.1', 0), bridge.handler_for(agent, queue_wait=0.5, socket_timeout=0.5))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        if self.original is None: sys.modules.pop('laya.common', None)
        else: sys.modules['laya.common'] = self.original

    def request(self, state, criteria=None, **headers):
        c = HTTPConnection('127.0.0.1', self.server.server_port)
        body = json.dumps({'state': state, 'questions': {'route': {'type': 'choice', 'instructions': 'Choose', 'criteria': criteria or {'a': 'Read'}}}})
        c.request('POST', '/v1/systemone', body, {'Authorization': 'Bearer local-laya', 'Content-Type': 'application/json', **headers})
        r = c.getresponse(); result = (r.status, json.loads(r.read())); c.close(); return result

    def health(self):
        c = HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        c.request('GET', '/health'); r = c.getresponse(); result = json.loads(r.read()); c.close(); return result

    def background(self, state):
        box = {}
        def run():
            try: box['result'] = self.request(state)
            except Exception as error: box['error'] = error
        t = threading.Thread(target=run, daemon=True); t.start(); return t, box

    def test_korean_and_english_state_is_preserved(self):
        for text in ['문서를 확인해 주세요', 'Review the documentation']:
            self.assertEqual(self.request(text)[0], 200)
        self.assertEqual(self.seen, ['문서를 확인해 주세요', 'Review the documentation'])

    def test_oversized_state_is_rejected_before_inference(self):
        self.assertEqual(self.request('x' * 1024)[0], 413)
        self.assertEqual(self.seen, [])

    def test_browser_origins_and_wrong_auth_are_rejected(self):
        self.assertEqual(self.request('test', Origin='https://example.com')[0], 403)
        self.assertEqual(self.request('test', Authorization='Bearer private-key')[0], 403)
        self.assertEqual(self.seen, [])

    def test_health_reports_readiness_busy_state_and_limits(self):
        health = self.health()
        self.assertEqual((health['ready'], health['busy'], health['queued']), (True, False, 0))
        self.assertEqual(health['limits'], bridge.limits())
        self.assertEqual(health['limits']['maxChoices'], 20)

    def test_choice_and_question_limits_match_advertised_limits(self):
        self.assertEqual(self.request('t', criteria={str(i): 'x' for i in range(20)})[0], 200)
        self.assertEqual(self.request('t', criteria={str(i): 'x' for i in range(21)})[0], 422)
        self.assertEqual(self.seen, ['t'])

    def test_incomplete_body_cannot_block_health_and_never_infers(self):
        stalled = socket.create_connection(('127.0.0.1', self.server.server_port))
        stalled.sendall(b'POST /v1/systemone HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer local-laya\r\nContent-Length: 100\r\n\r\n{"state": "partial')
        started = time.monotonic()
        self.assertTrue(self.health()['ready'])
        self.assertLess(time.monotonic() - started, 1.0)
        stalled.settimeout(3)
        response = stalled.recv(4096)
        self.assertIn(b' 408 ', response)
        stalled.close()
        self.assertEqual(self.seen, [])

    def test_inference_is_serialized_and_excess_work_is_rejected_or_expires(self):
        self.release.clear()
        first, first_box = self.background('first')
        for _ in range(50):
            if self.active: break
            time.sleep(0.02)
        self.assertEqual(self.active, ['first'])
        self.assertTrue(self.health()['busy'])
        second, second_box = self.background('second')
        time.sleep(0.1)
        self.assertEqual(self.health()['queued'], 1)
        self.assertEqual(self.request('third')[0], 503, 'queue is bounded: excess work gets an explicit busy response')
        second.join(3)
        self.assertEqual(second_box['result'][0], 503, 'queued work that expires never starts inference')
        self.assertEqual(self.active, ['first'], 'only one inference ran at a time')
        self.release.set()
        first.join(3)
        self.assertEqual(first_box['result'][0], 200)
        self.assertEqual(self.seen, ['first'])
        self.assertFalse(self.health()['busy'])
        self.assertEqual(self.request('after')[0], 200, 'slots are released after completion and expiry')


if __name__ == '__main__': unittest.main()
