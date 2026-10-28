# Graph report

> Built by `scripts/build_graph.py`, a graphify-compatible stand-in. The real graphify package could not be installed here (PyPI blocked). Re-run the real `/graphify .` on your machine for the official output. Code edges come from Python `ast` (EXTRACTED); call links by unique name are INFERRED; nodes marked planned are specified in INTEGRATION_PLAN.md and **not built yet**.

- 370 nodes, 525 edges, 15 communities
- Edge confidence: EXTRACTED 428, INFERRED 97

## Most connected nodes (god nodes)

- **INTEGRATION_PLAN.md** (41 links) `INTEGRATION_PLAN.md`
- **config.py** (28 links) `app/config.py`
- **README.md** (24 links) `README.md`
- **providers.py** (23 links) `app/providers.py`
- **main.py** (22 links) `app/main.py`
- **audio.py** (20 links) `app/audio.py`
- **create_app()** (18 links) `app/main.py`
- **VoiceSession** (18 links) `app/session.py`
- **test_calls.py** (17 links) `tests/test_calls.py`
- **leads.py** (14 links) `app/leads.py`

## Communities

### 0: README, config (40 nodes)
config.py, README.md, BUYER_GUIDE.md, live_check.py, main_async(), setup_telnyx.py

### 1: test_config (37 nodes)
test_config.py, SwitchingProvidersTests, SwitchedProvidersTalkToTheRightServers, EmailTests, ShippedProjectTests, BuildProvidersTests

### 2: INTEGRATION_PLAN, agent (36 nodes)
INTEGRATION_PLAN.md, voice/app/tenancy.py (planned), Postgres (website-owned), GET /api/internal/voice/resolve, voice/app/carriers.py (planned), catalog/providers.json

### 3: test_calls (31 nodes)
test_calls.py, RestApiTests, PhoneCall, PhoneFlowTests, WebChannelTests, EndToEndWithFakeServices

### 4: main, telnyx (30 nodes)
main.py, create_app(), telnyx.py, TelnyxClient, make_session(), WebTransport

### 5: providers, audio (29 nodes)
providers.py, build_providers(), ProviderError, OpenAICompatTTS, OpenAICompatLLM, MockLLM

### 6: test_scripts_and_n8n, fakes (27 nodes)
fakes.py, test_scripts_and_n8n.py, SetupTelnyxTests, ProjectFilesTests, N8nWorkflowTests, SMTPSink

### 7: test_audio_and_providers (26 nodes)
ProviderTests, AudioTests, test_audio_and_providers.py, AudioTests.test_wav_header(), run(), ProviderTests.tearDownClass()

### 8: s2s, audio (24 nodes)
audio.py, S2SSession, s2s.py, resample(), pcm_array(), simulate_call.py

### 9: leads, prompt (24 nodes)
leads.py, prompt.py, Notifier, Store, extract_lead(), clean_lead()

### 10: session, audio (21 nodes)
VoiceSession, session.py, VAD, VoiceSession.feed_pcm16k(), VAD.feed(), split_sentences()

### 11: test_notify_telnyx (21 nodes)
WebhookTests, test_notify_telnyx.py, NotifierTests, TelnyxTests, NotifierTests.test_n8n_webhook_gets_full_record(), WebhookTests.tearDown()

### 12: test_config (10 nodes)
ValidationTests, ValidationTests.test_check_config_script(), ValidationTests.test_custom_needs_base_url(), ValidationTests.test_mock_mode_skips_provider_checks(), ValidationTests.test_good_config_has_no_errors_and_warns_about_defaults(), ValidationTests.test_unknown_provider_lists_choices()

### 13: config (9 nodes)
Settings, Settings.from_raw(), Settings.summary(), Settings.load(), Settings.ws_secret(), Settings.webhook_url()

### 14: build_graph (5 nodes)
build_graph.py, add_node(), label_for(), add_edge(), files()

## Surprising cross-community links (planned website to existing code)

- config.py --generated_from--> catalog/providers.json (INFERRED)
- Settings.from_raw() --uses--> voice/app/tenancy.py (planned) (INFERRED)
- main.py --extends--> voice/app/tenancy.py (planned) (INFERRED)
- providers.py --uses--> POST /api/internal/voice/test-provider (INFERRED)
- telnyx.py --parallels--> voice/app/carriers.py (planned) (INFERRED)
- setup_telnyx.py --reuses--> POST /internal/connect-number (INFERRED)
- INTEGRATION_PLAN.md --specifies--> voice/app/tenancy.py (planned) (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> voice/app/carriers.py (planned) (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> GET /api/internal/voice/resolve (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> POST /api/voice/call-ended (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> POST /api/internal/voice/test-provider (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> POST /internal/connect-number (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> catalog/providers.json (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> Dashboard: Keys (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> Dashboard: Agent builder (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> Dashboard: Numbers (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> Dashboard: Calls & usage (EXTRACTED)
- INTEGRATION_PLAN.md --specifies--> Postgres (website-owned) (EXTRACTED)
- agent.yaml --same_shape_as--> GET /api/internal/voice/resolve (INFERRED)
