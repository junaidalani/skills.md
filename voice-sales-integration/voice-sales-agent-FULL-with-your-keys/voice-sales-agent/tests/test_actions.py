import asyncio
import json
import unittest

from app.actions import Action, ActionRunner, safe_url
from app.providers import MockLLM, MockSTT, MockTTS, Providers
from app.session import VoiceSession

from .fakes import base_settings, tmpdir

CAL = {"type": "calendar", "url": "https://script.google.com/macros/s/X/exec"}
BIZ = {"company": "Sunrise Solar", "agent_name": "Ava", "greeting": "Hello.", "actions": [CAL]}


class Resp:
    def __init__(self, body, status=200, headers=None):
        self._body, self.status_code, self.headers = body, status, headers or {}

    def json(self):
        return self._body


def fake_http(calls, body=None, status=200):
    def post(url, **kw):
        calls.append((url, kw.get("json")))
        return Resp(body if body is not None else {"ok": True, "message": "Slot booked for 3 Nov, 3pm"}, status)
    return post


class FakeTransport:
    out_rate = 8000

    def __init__(self):
        self.audio, self.events, self.ended = [], [], False

    async def send_audio(self, pcm):
        self.audio.append(pcm)

    async def clear(self):
        pass

    async def send_event(self, e):
        self.events.append(e)

    async def hangup(self):
        self.ended = True

    def spoken(self):
        return " ".join(e["text"] for e in self.events if e.get("role") == "assistant" and e.get("partial"))


class ActionRunnerTest(unittest.TestCase):
    def test_confirm_needs_a_later_turn(self):
        calls = []
        r = ActionRunner(BIZ["actions"], http=fake_http(calls))
        reply = 'I have John, 3 November at 3pm. Is that correct? [[ACTION book_appointment {"name": "John", "date": "2026-11-03", "time": "15:00"}]]'
        self.assertEqual(r.handle(reply, user_turns=1), [])  # proposed only
        self.assertEqual(calls, [])
        self.assertEqual(r.handle("Great, one moment. [[CONFIRM]]", user_turns=1), [])  # same turn: ignored
        run = r.handle("Great, one moment. [[CONFIRM]]", user_turns=2)
        self.assertEqual([a.name for a, _ in run], ["book_appointment"])
        self.assertEqual(r.pending, None)

    def test_same_reply_cannot_propose_and_confirm(self):
        r = ActionRunner(BIZ["actions"])
        reply = 'Booked. [[ACTION book_appointment {"name": "A"}]] [[CONFIRM]]'
        self.assertEqual(r.handle(reply, user_turns=5), [])
        self.assertIsNotNone(r.pending)

    def test_execute_success_and_failure(self):
        calls = []
        r = ActionRunner(BIZ["actions"], http=fake_http(calls))
        a = r.actions["book_appointment"]
        note = asyncio.run(r.execute(a, {"name": "John"}, {"call_id": "c1"}))
        self.assertIn("SUCCESS", note)
        self.assertEqual(calls[0][1]["data"], {"name": "John"})
        bad = ActionRunner(BIZ["actions"], http=fake_http([], status=500))
        note = asyncio.run(bad.execute(bad.actions["book_appointment"], {}, {}))
        self.assertIn("FAILED", note)

    def test_model_is_told_about_actions_and_read_back_rule(self):
        p = ActionRunner(BIZ["actions"]).prompt_section()
        self.assertIn("book_appointment", p)
        self.assertIn("[[CONFIRM]]", p)

    def test_speech_never_leaks_half_written_marker(self):
        self.assertEqual(ActionRunner.speech("Sure. [[ACTION book_appointment {\"a\": 1}]"), "Sure. ")
        self.assertEqual(ActionRunner.speech("Sure. [[ACTION x {}]] Bye."), "Sure.  Bye.")

    def test_bad_markers_are_logged_not_raised(self):
        r = ActionRunner(BIZ["actions"])
        self.assertEqual(r.handle("[[ACTION nope {}]] [[ACTION book_appointment not-json]]", 1), [])
        self.assertEqual([x["status"] for x in r.log], ["unknown", "bad_json"])

    def test_follows_apps_script_redirect_and_sends_secret(self):
        seen = []

        def post(url, **kw):
            seen.append(url)
            if len(seen) == 1:
                return Resp({}, 302, {"location": "https://script.googleusercontent.com/macros/echo?x=1"})
            return Resp({"ok": True, "message": "Saved."})

        cfg = {"type": "sheet", "url": "https://script.google.com/macros/s/X/exec", "secret": "s3"}
        r = ActionRunner([cfg], http=post)
        note = asyncio.run(r.execute(r.actions["save_details"], {"name": "Jo"}, {}))
        self.assertIn("SUCCESS", note)
        self.assertEqual(len(seen), 2)

    def test_safe_url(self):
        self.assertFalse(safe_url("http://example.com/hook"))
        self.assertFalse(safe_url("https://127.0.0.1/hook"))
        self.assertFalse(safe_url("https://localhost/hook"))

    def test_bad_config_is_skipped(self):
        r = ActionRunner([{"type": "calendar"}, {"type": "nonsense", "url": "https://x.co"}])
        self.assertFalse(r)


class SessionActionTest(unittest.TestCase):
    def test_propose_then_confirm_runs_action_and_agent_reports_it(self):
        calls, t = [], FakeTransport()
        llm = MockLLM([
            'I have John, 3 November at 3pm. Is that correct? '
            '[[ACTION book_appointment {"name": "John", "date": "2026-11-03", "time": "15:00"}]]',
            "Great, one moment. [[CONFIRM]]",
            "Thanks John, that's booked for 3 November at 3pm. Anything else?",
        ])
        s = VoiceSession(
            settings=base_settings(tmpdir()), providers=Providers(MockSTT(), llm, MockTTS()),
            transport=t, business=BIZ, channel="phone",
            actions=ActionRunner(BIZ["actions"], http=fake_http(calls)),
        )
        async def go():
            await s.start()
            await s.user_text("John, 3 November at 3pm please")
            await asyncio.sleep(0.2)
            first_turn_calls = len(calls)
            await s.user_text("Yes, that's right")
            await asyncio.sleep(0.2)
            return first_turn_calls

        first_turn_calls = asyncio.run(go())
        self.assertEqual(first_turn_calls, 0)  # nothing ran before the caller confirmed
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["data"]["time"], "15:00")
        spoken = t.spoken()
        self.assertNotIn("[[", spoken)
        self.assertIn("Is that correct?", spoken)
        self.assertIn("that's booked", spoken)
        self.assertTrue(any(e.get("type") == "action" for e in t.events))
        self.assertEqual(s.actions.log[0]["ok"], True)


if __name__ == "__main__":
    unittest.main()
