import importlib.util
import json
from pathlib import Path
import sys
import threading
import types
import unittest
from http.client import HTTPConnection
from http.server import HTTPServer

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).with_name('laya-server.py'))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.seen = []
        self.original = sys.modules.get('laya.common')
        sys.modules['laya.common'] = types.SimpleNamespace(serialize_state=lambda value: json.dumps(value, ensure_ascii=False))
        def predict(state, questions):
            self.seen.append(state)
            return {'answers': {'route': {'type': 'choice', 'choice': 'a', 'probabilities': {'a': 1}}}}
        agent = types.SimpleNamespace(tok=lambda value, **kw: {'input_ids': list(value)}, cfg={'max_len': 1024, 'head_max_len': 256}, predict=predict)
        self.server = HTTPServer(('127.0.0.1', 0), bridge.handler_for(agent))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        if self.original is None: sys.modules.pop('laya.common', None)
        else: sys.modules['laya.common'] = self.original

    def request(self, state, **headers):
        c = HTTPConnection('127.0.0.1', self.server.server_port)
        body = json.dumps({'state': state, 'questions': {'route': {'type': 'choice', 'instructions': 'Choose', 'criteria': {'a': 'Read'}}}})
        c.request('POST', '/v1/systemone', body, {'Authorization': 'Bearer local-laya', 'Content-Type': 'application/json', **headers})
        r = c.getresponse(); result = (r.status, json.loads(r.read())); c.close(); return result

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


if __name__ == '__main__': unittest.main()
