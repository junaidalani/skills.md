import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.config import ROOT

from .fakes import FakeServices, tmpdir


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class SetupTelnyxTests(unittest.TestCase):
    def test_creates_app_and_attaches_number(self):
        svc = FakeServices()
        env = {"TELNYX_API_KEY": "tk", "TELNYX_PHONE_NUMBER": "+15519007793", "TELNYX_BASE_URL": svc.url + "/telnyx",
               "VSA_NO_DOTENV": "1"}
        try:
            with mock.patch.dict(os.environ, env):
                mod = load_script("setup_telnyx")
                rc = mod.main(["--public-url", "https://abc.trycloudflare.com"])
                body = svc.find("/telnyx/call_control_applications")[-1]["json"]
                patch = svc.find("/telnyx/phone_numbers/num-1")[0]
                self.assertEqual(rc, 0)
                self.assertEqual(body["webhook_event_url"], "https://abc.trycloudflare.com/telnyx/webhook")
                self.assertEqual(body["webhook_api_version"], "2")
                self.assertEqual(patch["json"], {"connection_id": "app-1"})
                self.assertEqual(svc.number["connection_id"], "app-1")
                # second run updates instead of duplicating
                self.assertEqual(mod.main(["--public-url", "https://new.example.com"]), 0)
                self.assertEqual(len(svc.apps), 1)
                self.assertTrue(svc.find("/telnyx/call_control_applications/app-1"))
        finally:
            svc.stop()

    def test_rejects_http_url(self):
        env = {"TELNYX_API_KEY": "tk", "TELNYX_PHONE_NUMBER": "+15519007793", "VSA_NO_DOTENV": "1"}
        with mock.patch.dict(os.environ, env):
            mod = load_script("setup_telnyx")
            self.assertEqual(mod.main(["--public-url", "http://insecure.example.com"]), 2)

    def test_requires_credentials(self):
        env = {"TELNYX_API_KEY": "", "TELNYX_PHONE_NUMBER": "", "VSA_NO_DOTENV": "1"}
        with mock.patch.dict(os.environ, env):
            mod = load_script("setup_telnyx")
            self.assertEqual(mod.main(["--public-url", "https://ok.example.com"]), 2)

    def test_write_env_updates_and_appends(self):
        mod = load_script("setup_telnyx")
        d = tmpdir()
        (d / ".env").write_text("A=1\nTELNYX_CONNECTION_ID=\nPUBLIC_BASE_URL=old\n")
        with mock.patch.object(mod, "ROOT", d):
            mod.write_env({"TELNYX_CONNECTION_ID": "app-9", "PUBLIC_BASE_URL": "https://n.example", "NEW": "x"})
        text = (d / ".env").read_text()
        self.assertIn("TELNYX_CONNECTION_ID=app-9", text)
        self.assertIn("PUBLIC_BASE_URL=https://n.example", text)
        self.assertIn("NEW=x", text)
        self.assertIn("A=1", text)


class N8nWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.wf = json.loads((ROOT / "n8n" / "lead-to-email.json").read_text())

    def test_structure(self):
        types = {n["name"]: n["type"] for n in self.wf["nodes"]}
        self.assertEqual(types["Voice agent webhook"], "n8n-nodes-base.webhook")
        self.assertEqual(types["Send Gmail"], "n8n-nodes-base.gmail")
        gmail = next(n for n in self.wf["nodes"] if n["name"] == "Send Gmail")
        self.assertEqual(gmail["parameters"]["sendTo"], "junaidalani2001@gmail.com")
        names = set(types)
        for src, c in self.wf["connections"].items():
            self.assertIn(src, names)
            for branch in c["main"]:
                for link in branch:
                    self.assertIn(link["node"], names)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_format_node_code_runs_in_node(self):
        code = next(n for n in self.wf["nodes"] if n["name"] == "Format lead")["parameters"]["jsCode"]
        payload = {"company": "Sunrise Solar", "channel": "phone", "caller": "+15550001111", "duration": 30,
                   "lead": {"name": "Junaid <b>", "email": "junaidalani2001@gmail.com", "outcome": "lead", "summary": "Wants solar"},
                   "transcript": [{"role": "user", "text": "hi & bye"}]}
        harness = f"const $input = {{ first: () => ({{ json: {{ body: {json.dumps(payload)} }} }}) }};\n" \
                  f"const run = () => {{ {code} }};\nconsole.log(JSON.stringify(run()));"
        f = Path(tempfile.mkdtemp()) / "t.js"
        f.write_text(harness)
        out = subprocess.run(["node", str(f)], capture_output=True, text=True, timeout=20)
        self.assertEqual(out.returncode, 0, out.stderr)
        item = json.loads(out.stdout)[0]["json"]
        self.assertEqual(item["subject"], "[Sunrise Solar] New lead: Junaid <b>")
        self.assertIn("junaidalani2001@gmail.com", item["html"])
        self.assertIn("&lt;b&gt;", item["html"])  # escaped
        self.assertIn("hi &amp; bye", item["html"])


class ProjectFilesTests(unittest.TestCase):
    def test_env_example_has_no_secrets(self):
        text = (ROOT / ".env.example").read_text()
        for secret in ("sk-or-v1", "KEY01A14", "hf_EhgE"):
            self.assertNotIn(secret, text)

    def test_gitignore_protects_env(self):
        self.assertIn(".env", (ROOT / ".gitignore").read_text().splitlines())

    def test_business_yaml_loads(self):
        from app.prompt import load_business
        b = load_business(ROOT / "config" / "business.yaml")
        self.assertTrue(b["products"] and b["faq"] and b["greeting"])


if __name__ == "__main__":
    unittest.main()
