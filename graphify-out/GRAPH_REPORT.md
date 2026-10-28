# Graph Report - voice-sales-integration  (2026-10-25)

## Corpus Check
- 431 files · ~446,935 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 21 file(s) not represented in the graph (top: (none) 14, .example 2, .arm64 1)

## Summary
- 8546 nodes · 24756 edges · 321 communities (213 shown, 108 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 4965 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Python Stdlib Imports
- Email & Crypto Utilities
- Parler TTS Archive
- Agent Audio Processing
- Pipeline Arguments & Config
- Backend Config & Handlers
- LLM Chat Layer
- Ambiguous Python Imports
- OpenAI Realtime Core
- Realtime Events & Messages
- Ambiguous Imports Cluster
- CLI Entry Points
- Realtime Service Internals
- Realtime Responses
- TTS Benchmarking
- MLX & OpenAI Types
- Config & Client Settings
- Browser Demo Frontend
- Conversation History
- Realtime Audio Client
- Chat Completions Tests
- Hub Utils & Imports
- Realtime Event Handlers
- Audio Input Notifier
- Chat Generation Logic
- Smart Turn VAD
- Response Prefetch
- Whisper STT Tests
- Chat Tool Calls
- Kokoro TTS Handler
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 198
- Community 199
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- Community 207
- Community 208
- Community 209
- Community 210
- Community 211
- Community 212
- Community 214
- Community 215
- Community 216
- Community 217
- Community 218
- Community 219
- Community 220
- Community 221
- Community 222
- Community 223
- Community 224
- Community 225
- Community 226
- Community 227
- Community 228
- Community 229
- Community 230
- Community 231
- Community 232
- Community 233
- Community 234
- Community 235
- Community 236
- Community 237
- Community 238
- Community 239
- Community 240
- Community 241
- Community 242
- Community 243
- Community 244
- Community 245
- Community 246
- Community 247
- Community 248
- Community 249
- Community 250
- Community 251
- Community 252
- Community 253
- Community 255
- Community 256
- Community 257
- Community 258
- Community 259
- Community 260
- Community 261
- Community 262
- Community 264
- Community 265
- Community 266
- Community 267
- Community 268
- Community 269
- Community 271
- Community 272
- Community 273
- Community 274
- Community 276
- Community 277
- Community 279
- Community 280
- Community 281
- Community 282
- Community 284
- Community 285
- Community 287
- Community 288
- Community 289
- Community 290
- Community 293
- Community 294
- Community 296
- Community 297
- Community 298
- Community 299
- Community 318
- Community 319
- Community 320

## God Nodes (most connected - your core abstractions)
1. `SpeculativeTurnTracker` - 267 edges
2. `Chat` - 247 edges
3. `TTSInput` - 190 edges
4. `AssistantOutputEvent` - 159 edges
5. `SpeechStartedEvent` - 141 edges
6. `RealtimeService` - 134 edges
7. `EndOfResponse` - 134 edges
8. `LLMResponseChunk` - 124 edges
9. `RuntimeConfig` - 117 edges
10. `CancelScope` - 117 edges

## Surprising Connections (you probably didn't know these)
- `Search proxy (same-origin /search route holding SERPER_API_KEY server-side)` --semantically_similar_to--> `AES-256-GCM tenant key encryption with key_version rotation`  [INFERRED] [semantically similar]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/vendor/speech-to-speech/demo/CONTEXT.md → INTEGRATION_PLAN.md
- `Usage limits (per-day talk-time metering by sign-in tier, deployed Space only)` --semantically_similar_to--> `Per-tenant plan limits (maxConcurrent, maxCallSeconds, minutesRemaining)`  [INFERRED] [semantically similar]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/vendor/speech-to-speech/demo/README.md → INTEGRATION_PLAN.md
- `OpenAI Realtime Engine` --semantically_similar_to--> `Voice Sales Agent (product architecture)`  [INFERRED] [semantically similar]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/vendor/speech-to-speech/src/speech_to_speech/api/openai_realtime/README.md → voice-sales-agent-PRODUCT-for-buyers/voice-sales-agent/README.md
- `Agent Dashboard (admin.html, FULL build)` --semantically_similar_to--> `Agent Dashboard (admin.html, PRODUCT build)`  [INFERRED] [semantically similar]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/web/admin.html → voice-sales-agent-PRODUCT-for-buyers/voice-sales-agent/web/admin.html
- `Voice Sales Agent Demo Page (demo.html, FULL build)` --semantically_similar_to--> `Voice Sales Agent Demo Page (demo.html, PRODUCT build)`  [INFERRED] [semantically similar]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/web/demo.html → voice-sales-agent-PRODUCT-for-buyers/voice-sales-agent/web/demo.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Voice sales agent single-tenant integration** — voice_sales_integration_integration_plan, voice_sales_integration_agent, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_agent, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_readme, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_buyer_guide, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_docker_compose [INFERRED 0.95]
- **Speech-to-speech browser demo frontend** — voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_readme, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_demo_readme, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_demo_context, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_demo_design, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_demo_index, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_demo_docs_adr_0001_docker_space_with_search_proxy [EXTRACTED 1.00]
- **Speech-to-speech CI and release automation** — voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech__github_workflows_ci, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech__github_workflows_omnivoice, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech__github_workflows_publish, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech__github_workflows_star_history, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech__github_dependabot, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_agents [INFERRED 0.95]
- **OpenAI Realtime engine core components** — voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_realtime_engine, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_realtime_service, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_cancel_scope, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_lm_output_processor, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_runtime_config, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_transcription_notifier, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_vad_readme_vad_handler, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_llm_readme_language_model_handler, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_stv_readme_speech_to_visemes [EXTRACTED 1.00]
- **Mac example pipeline stages** — voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_example_configs_mac_mac_pipeline, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_vad_readme_silero_backend, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_stt_readme_parakeet_tdt_stt_handler, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_llm_readme_language_model_handler, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_tts_readme_qwen3_tts_backend [EXTRACTED 1.00]
- **Voice Sales Agent product stack** — voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_readme_voice_sales_agent, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_buyer_guide_buyer_setup_guide, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_agent_agent_yaml_configuration, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_docker_compose_agent_service, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_docker_compose_tunnel_profile, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_docker_compose_n8n_profile, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_requirements_python_dependencies, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_web_admin_agent_dashboard, voice_sales_integration_voice_sales_agent_product_for_buyers_voice_sales_agent_web_demo_voice_sales_agent_demo, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_src_speech_to_speech_api_openai_realtime_readme_realtime_engine [EXTRACTED 1.00]
- **Star History Chart Depicts Repository Growth Trend** — voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_assets_star_history_star_history, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_assets_star_history_huggingface_speech_to_speech_repo, voice_sales_integration_voice_sales_agent_full_with_your_keys_voice_sales_agent_vendor_speech_to_speech_assets_star_history_star_growth_trend [EXTRACTED 1.00]

## Communities (321 total, 108 thin omitted)

### Community 0 - "Python Stdlib Imports"
Cohesion: 0.05
Nodes (17): detect_language_from_text(), PartialTranscription, TurnGateAction, record_response_e2e(), record_response_tts_ttfa(), int2float(), _is_device_available(), is_npu_available() (+9 more)

### Community 1 - "Email & Crypto Utilities"
Cohesion: 0.02
Nodes (51): to_wav(), image_url_to_pil(), audio_to_wav_base64(), _b64_pcm(), _build_ulaw_decode(), decode_with_ffmpeg(), normalize_spoken_email(), pcm_array() (+43 more)

### Community 2 - "Parler TTS Archive"
Cohesion: 0.03
Nodes (69): ParlerTTSHandler, main(), LMOutputProcessor, CancelScope, EndOfResponse, PipelineMessage, TTSInput, Drama3TTSHandler (+61 more)

### Community 3 - "Agent Audio Processing"
Cohesion: 0.03
Nodes (47): _build_ulaw_decode(), decode_with_ffmpeg(), normalize_spoken_email(), pcm_array(), resample(), ulaw_decode(), ulaw_encode(), Up2 (+39 more)

### Community 4 - "Pipeline Arguments & Config"
Cohesion: 0.04
Nodes (67): ModuleArguments, LocalRealtimeServerArguments, VADHandlerArguments, BackendCapabilities, BackendSelection, BackendSpec, build_backend_registry(), create_backend_handler() (+59 more)

### Community 5 - "Backend Config & Handlers"
Cohesion: 0.04
Nodes (50): MeloTTSHandlerArguments, ParlerTTSHandlerArguments, ChatCompletionsLanguageModelHandlerArguments, ChatTTSHandlerArguments, Drama3TTSHandlerArguments, FacebookMMSTTSHandlerArguments, FasterWhisperSTTHandlerArguments, KittenTTSHandlerArguments (+42 more)

### Community 6 - "LLM Chat Layer"
Cohesion: 0.07
Nodes (18): Chat, _assistant_msg_with_parts(), _fc(), _fco(), _system(), TestAddItem, TestChatInit, TestSystemMessages (+10 more)

### Community 7 - "Ambiguous Python Imports"
Cohesion: 0.05
Nodes (19): base_settings(), FakeServices, make_pcm(), message_text(), SMTPSink, _H, tmpdir(), EndToEndWithFakeServices (+11 more)

### Community 8 - "OpenAI Realtime Core"
Cohesion: 0.05
Nodes (33): RealtimeService, AudioInputCompletedEvent, SpeechStoppedEvent, TranscriptionCompletedEvent, test_final_transcription_reopen_is_one_item_until_response(), conn_id(), test_audio_arriving_during_manual_generation_remains_available_for_next_request(), generate() (+25 more)

### Community 9 - "Realtime Events & Messages"
Cohesion: 0.06
Nodes (19): AssistantOutputEvent, AssistantToolCallReadyEvent, AssistantTextPart, test_delete_waits_for_overlapping_queued_response(), test_generated_assistant_is_deletable_by_wire_id(), TestPackagedAudioClient, _audio(), output_24khz() (+11 more)

### Community 10 - "Ambiguous Imports Cluster"
Cohesion: 0.05
Nodes (18): base_settings(), FakeServices, make_pcm(), message_text(), SMTPSink, _H, tmpdir(), EndToEndWithFakeServices (+10 more)

### Community 11 - "CLI Entry Points"
Cohesion: 0.05
Nodes (76): parse_command(), parse_talk_arguments(), parse_arguments(), _help_exposes_flag(), main(), _require_modules(), _run_installed_cli_help(), _validate_darwin_dependency_pins() (+68 more)

### Community 12 - "Realtime Service Internals"
Cohesion: 0.06
Nodes (13): PartialTranscriptionEvent, PipelineEvent, ResponseFailedEvent, SpeechStartedEvent, TranscriptionFailedEvent, voice(), test_delete_committed_speech_before_transcription_preserves_other_item(), TestSDKVoiceTurn (+5 more)

### Community 13 - "Realtime Responses"
Cohesion: 0.07
Nodes (10): ResponseGenerationDoneEvent, GenerateResponseRequest, test_filtered_provider_message_does_not_steal_visible_reply_identity(), test_disabled_audio_revision_replaces_input_without_generation(), test_disabled_response_retains_transcript_and_accepts_explicit_request(), test_disabling_automatic_responses_does_not_cancel_existing_work(), _update(), TestDeferConversationItemsDuringResponse (+2 more)

### Community 14 - "TTS Benchmarking"
Cohesion: 0.04
Nodes (37): benchmark_handler(), BenchmarkResult, build_benchmark_targets(), main(), normalize_qwen3_mlx_quantizations(), print_results(), save_results(), transcript_for_log() (+29 more)

### Community 15 - "MLX & OpenAI Types"
Cohesion: 0.04
Nodes (17): tool_call_ids(), ToolCall, _tool_calls_from_accum(), _split_top_level_calls(), format_language_instruction(), _has_unclosed_markdown_fence(), language_name_for_prompt(), _protect_markdown_code() (+9 more)

### Community 16 - "Config & Client Settings"
Cohesion: 0.08
Nodes (57): _check_composition(), _client_settings(), _client_type(), ConfigDocument, ConfigurationError, _error(), _is_env(), _json_value() (+49 more)

### Community 17 - "Browser Demo Frontend"
Cohesion: 0.03
Nodes (67): aboutBtn, aboutClose, aboutModal, account, audioOutputHint, buildDirectWsUrl(), camPip, camVideo (+59 more)

### Community 18 - "Conversation History"
Cohesion: 0.05
Nodes (21): AssistantResponseDoneEvent, ResponseHistory, AudioOutput, _audio(), main(), barge_in(), finish_response(), settle_audio() (+13 more)

### Community 19 - "Realtime Audio Client"
Cohesion: 0.05
Nodes (32): load_realtime_tool_module(), RealtimeAudioClient, RealtimeServer, LocalAudioArguments, RealtimeServerArguments, ResolvedConfig, _adapt(), build_configured_client() (+24 more)

### Community 20 - "Chat Completions Tests"
Cohesion: 0.06
Nodes (43): _chunk(), _drive(), _FakeChat, _FakeClient, _FakeCompletions, _FakeStream, _make_handler(), _tc_delta() (+35 more)

### Community 21 - "Hub Utils & Imports"
Cohesion: 0.05
Nodes (25): make(), build(), main(), prepare(), test_space_update_removes_source_deleted_in_the_next_revision(), _run_node(), test_adapter_delegates_tools_to_realtime_session(), test_adapter_uses_stock_sdk_transport_for_each_mode() (+17 more)

### Community 22 - "Realtime Event Handlers"
Cohesion: 0.07
Nodes (4): ResponseHandler, _generate_id(), is_out_of_band(), response_wants_audio()

### Community 23 - "Audio Input Notifier"
Cohesion: 0.04
Nodes (34): AudioInputNotifier, VADAudio, _dispatch_transcription(), test_vllm_realtime_final_commit_reaches_response_log(), test_disabled_diarization_preserves_plain_transcript(), final_stt_event(), transcribe(), test_faster_whisper_silent_final_leaves_no_pending_stt() (+26 more)

### Community 24 - "Chat Generation Logic"
Cohesion: 0.05
Nodes (29): CompactionResult, make_assistant_message(), make_user_message(), _call(), _output(), test_delete_call_preserves_output_but_omits_orphan_from_model(), test_delete_invalidates_compaction_snapshot(), test_delete_output_requires_replacement_before_response() (+21 more)

### Community 25 - "Smart Turn VAD"
Cohesion: 0.09
Nodes (49): SmartTurnResult, test_vad_decision_reaches_terminal_response_metadata(), _audio_bytes(), clock(), _drain_text_events(), _drive_final_segment(), _handler_after_soft_ended_turn(), _RecordingStreamingSTT (+41 more)

### Community 26 - "Response Prefetch"
Cohesion: 0.04
Nodes (15): ResponsePrefetchTransaction, _simulate_session_end_drain(), TestCleanup, TestClientEventDispatch, blocked_send_events(), TestDrainRelease, test_prefetch_cleanup_failure_restores_consumed_image_and_history(), test_claimed_prefetch_releases_tts_worker_for_synthesis() (+7 more)

### Community 27 - "Whisper STT Tests"
Cohesion: 0.06
Nodes (36): FakeInfo, FakeSegment, FakeWhisperModel, handler_module(), make_handler(), run(), test_absent_language_is_treated_as_auto_detect(), test_auto_is_removed_from_gen_kwargs() (+28 more)

### Community 28 - "Chat Tool Calls"
Cohesion: 0.09
Nodes (9): _assistant(), _make_stub_compactor(), TestAddItemEviction, TestAppendToolOutput, TestCompaction, TestTurnOrdering, _texts(), _user() (+1 more)

### Community 29 - "Kokoro TTS Handler"
Cohesion: 0.04
Nodes (19): active_turn_latency_tracker(), KokoroTTSHandler, acquire_mlx_lock(), MLXLockContext, _owner_snapshot(), _record_lock_acquired(), _record_lock_released(), release_mlx_lock() (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (30): assert_input_lifecycle_contract(), assert_openai_schema(), assert_response_lifecycle_contract(), RealtimeClientHistory, _pcm_bytes(), _run_scenario(), test_contract_checker_catches_a_content_part_closed_twice(), test_contract_checker_catches_a_status_contradiction() (+22 more)

### Community 31 - "Community 31"
Cohesion: 0.10
Nodes (45): SpeculativeTurnTracker, TestTurnLifecycleOwnership, infer(), test_queued_final_keeps_latency_until_notifier_consumes_it(), test_stt_worker_discards_latency_when_revision_changes_during_inference(), infer(), test_current_turn_synthesizes_and_commits_using_current_tracker_api(), test_stale_keyed_terminal_preserves_cleanup_identity() (+37 more)

### Community 32 - "Community 32"
Cohesion: 0.14
Nodes (47): TranscriptionFailure, VLLMRealtimeSTTHandler, _append_events(), _handler(), _SocketFactory, test_caller_deadline_does_not_wait_for_session_setup_or_close(), test_cancel_and_session_reuse_fence_late_results(), finish_turn() (+39 more)

### Community 33 - "Community 33"
Cohesion: 0.05
Nodes (53): Agent settings (voice-sales-integration/agent.yaml), Business configuration (Sunrise Solar: greeting, products, FAQ, policies, collect, goal), listening provider slot (speech to text), llm provider slot (the brain), voice provider slot (text to speech), Graph report, INTEGRATION PLAN: add the AI voice agent to the website, Build order (12 working days, one coder) (+45 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (57): llama.cpp Gemma LLM Service (docker-compose), speech-to-speech Pipeline Service (docker-compose), build_configured_server(resolved, stop_event, local), load_config(path), resolve_config(document, names, environ, include_client, client_only), validate_config(document), YAML Pipeline Configuration, OpenAI-compatible STT Backend (+49 more)

### Community 35 - "Community 35"
Cohesion: 0.06
Nodes (28): _answer_sort_key(), available_subsets(), build_subset(), describe(), EvalItem, load_dataset_metadata(), load_pcm16_mono(), load_subset() (+20 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (31): _print_progress(), aggregate(), build_report(), compare_reports(), Comparison, ComparisonRow, ItemResult, _latency() (+23 more)

### Community 37 - "Community 37"
Cohesion: 0.05
Nodes (17): _pcm_bytes(), _recv(), drive_direct_audio_reopen(), queue_get(), record_server_event(), start(), wait_until(), process() (+9 more)

### Community 38 - "Community 38"
Cohesion: 0.05
Nodes (24): builder(), build(), Handler, test_bounded_stop_retains_resources_until_worker_finishes(), test_cleanup_error_does_not_stop_reverse_cleanup(), build(), test_client_log_conflict_and_single_explicit_choice(), test_construction_failure_cleans_partial_resources_in_reverse() (+16 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (36): done_tool_executor(), function_call(), output_item_added(), RecordingConnection, response_created(), response_done(), test_audio_client_can_disable_tool_follow_up_response(), test_audio_client_cancellation_during_blocked_delivery_releases_counters_once() (+28 more)

### Community 40 - "Community 40"
Cohesion: 0.06
Nodes (7): ParakeetTDTSTTHandler, PartialTranscription, test_live_transcription_clears_terminal_line_before_each_update(), test_live_transcription_truncates_terminal_updates(), test_live_transcription_uses_lines_for_non_terminal_logs(), test_on_session_end_resets_streaming_state(), test_show_progressive_transcription_returns_combined_text()

### Community 41 - "Community 41"
Cohesion: 0.08
Nodes (37): _capture_create(), fake_create(), _chat_chunk(), _chat_tool_delta(), _make_audio_request(), _make_handler(), _make_oob_request(), _make_runtime_config() (+29 more)

### Community 42 - "Community 42"
Cohesion: 0.07
Nodes (8): BuildProvidersTests, find_secrets(), load(), run(), ShippedProjectTests, SwitchedProvidersTalkToTheRightServers, SwitchingProvidersTests, ValidationTests

### Community 43 - "Community 43"
Cohesion: 0.07
Nodes (8): BuildProvidersTests, find_secrets(), load(), run(), ShippedProjectTests, SwitchedProvidersTalkToTheRightServers, SwitchingProvidersTests, ValidationTests

### Community 44 - "Community 44"
Cohesion: 0.06
Nodes (27): main(), call(), write_env(), run_realtime_audio_client(), _command_parser(), _extract_legacy_mode(), main(), _run_file_command() (+19 more)

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (25): _PendingReopen, TurnPhase, test_process_waits_for_pending_reopen_and_drops_stale_end_of_response(), run_process(), test_process_waits_for_pending_reopen_and_drops_stale_tts_input(), run_process(), test_process_waits_for_reopen_grace_and_drops_stale_end_of_response(), run_process() (+17 more)

### Community 46 - "Community 46"
Cohesion: 0.06
Nodes (18): build_session_update(), listen_and_play_realtime(), _make_client(), RealtimeAudioClientConfig, _run_audio_session(), receive_events(), _ToolExecutionResult, _wait_for_stop() (+10 more)

### Community 47 - "Community 47"
Cohesion: 0.10
Nodes (33): make_operation(), audio(), blocked_upload_endpoint(), ControlledOperation, handler_factory(), _operation(), stalled_stt_endpoint(), serve() (+25 more)

### Community 48 - "Community 48"
Cohesion: 0.08
Nodes (3): AudioHandler, InputItemState, PendingInputTerminal

### Community 49 - "Community 49"
Cohesion: 0.14
Nodes (30): run_item(), config(), FakeSocket, install(), pcm_for(), test_a_correct_spoken_answer_is_graded_and_timed(), test_a_question_split_into_several_turns_is_flagged(), test_a_rejected_connection_is_reported_as_an_item_error() (+22 more)

### Community 50 - "Community 50"
Cohesion: 0.10
Nodes (28): PipelineUnit, SpeechToSpeechVisemesEvent, _audio_cleanup_only(), _audio_generation(), _audio_payload(), _audio_response_key(), _clean_unit(), _send_loop_for() (+20 more)

### Community 52 - "Community 52"
Cohesion: 0.06
Nodes (16): _build_chat_optional_kwargs(), _chat_messages(), ChatCompletionsApiModelHandler, _request_chat_completions(), _to_chat_content_part(), _to_chat_tool_choice(), _to_chat_tools(), make_user_audio_message() (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.08
Nodes (6): _apply_update(), RuntimeConfig, _parse_session(), TestApplySessionUpdate, create_response(), test_session_auto_reset_keeps_transcript_when_language_detection_fails()

### Community 54 - "Community 54"
Cohesion: 0.07
Nodes (21): _append_event(), build_session_update(), _consume(), ensure_current(), iter_chunks(), open_session(), _ResponseCapture, run_subset() (+13 more)

### Community 55 - "Community 55"
Cohesion: 0.08
Nodes (26): judge_results(), judge_one(), JudgeConfig, _normalize_reply(), _user_prompt(), CategorySpec, extract_answer(), _extract_for_spec() (+18 more)

### Community 56 - "Community 56"
Cohesion: 0.10
Nodes (21): Wav2Vec2STVHandler, audio(), done(), make_handler(), __call__(), infer(), pcm(), test_batch_timestamps_continue_across_audio_segments() (+13 more)

### Community 57 - "Community 57"
Cohesion: 0.08
Nodes (15): main_async(), report(), consume_until_response_done(), _lb_allocate_session(), _lb_send_event(), load_pcm16_mono_16k(), main(), run_all() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.06
Nodes (17): SessionState, build_error_event(), rtc_configuration_from_env(), create_app(), _claim_unit(), lifespan(), pool_endpoint(), realtime_endpoint() (+9 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (21): config(), FireRedFrameResult, FireRedStreamer, FireRedVadIterator, load_firered_streamer(), _FakeFireRedStream, _frame(), test_firered_discards_rejected_candidate_audio_without_padding() (+13 more)

### Community 60 - "Community 60"
Cohesion: 0.08
Nodes (10): WebRTCSession, on_connection_state_change(), on_datachannel(), on_dc_close(), on_dc_open(), on_track(), captured_audio_sender(), _on_client_event() (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.11
Nodes (37): _detecting_processor(), _process_in_thread(), _processor(), _session_with_language(), _spoken_tts_input(), test_ambiguous_assistant_chunk_does_not_force_a_tts_language(), test_audio_output_keeps_response_identity(), test_auto_tts_language_uses_assistant_text_instead_of_stt_language() (+29 more)

### Community 62 - "Community 62"
Cohesion: 0.12
Nodes (22): _FriendlyEventRenderer, handle_server_event(), PlaybackBuffer, test_audio_client_accumulates_incremental_user_transcription_deltas(), test_audio_client_clears_snapshots_and_deltas_on_transcription_failed(), test_audio_client_clears_unplayed_audio_on_barge_in(), test_audio_client_clears_unplayed_audio_when_response_is_cancelled(), test_audio_client_does_not_allocate_transcript_state_for_direct_audio_turns() (+14 more)

### Community 63 - "Community 63"
Cohesion: 0.11
Nodes (5): BaseOpenAICompatibleHandler, _flush(), _GenState, _Turn, test_remote_handler_closes_owned_client_once()

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (32): HttpTranscriptionResult, _audio(), _FakeOperation, _handler(), _run_final(), _run_progressive(), test_explicit_auto_removes_setup_language_from_stt_request(), test_final_request_does_not_wait_for_in_flight_progressive() (+24 more)

### Community 65 - "Community 65"
Cohesion: 0.06
Nodes (8): make_system_message(), SpeechLatencyAnchor, test_active_create_delete_replace_preserves_order_and_error_correlation(), test_delete_discards_hidden_prefetch_and_late_write(), test_delete_uncommitted_speech_does_not_remove_input_state(), test_spoken_user_is_deletable_by_wire_id(), TestHandleResponseCancel, test_cancelled_inflight_llm_cannot_recreate_latency_tracker()

### Community 66 - "Community 66"
Cohesion: 0.12
Nodes (25): FakeSequences, make_handler(), run(), test_auto_mode_reuses_the_encoder_output_instead_of_re_encoding(), test_auto_mode_uses_detect_language_and_forces_the_result(), test_detect_language_failure_is_survivable(), test_detection_does_not_mutate_shared_gen_kwargs(), test_detection_restores_the_ambient_grad_mode() (+17 more)

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (11): Transcription, SenseVoiceSTTHandler, TranscriptionNotifier, transcribe(), _notifier(), test_diarization_status_logs_without_transcript(), test_empty_final_transcription_reenables_listening_without_runtime_config(), test_empty_final_transcription_still_emits_completion_after_partial() (+3 more)

### Community 68 - "Community 68"
Cohesion: 0.09
Nodes (4): test_direct_audio_request_preserves_wire_identity(), TestConnectionLifecycle, TestHandleSessionUpdate, TestParseClientEvent

### Community 69 - "Community 69"
Cohesion: 0.07
Nodes (29): _audible_stream_chunk(), test_apply_session_voice_override_accepts_supported_custom_voice_speaker(), test_apply_session_voice_override_ignores_unsupported_custom_voice_speaker(), test_apply_session_voice_override_warns_for_non_file_for_base_model(), test_estimate_max_new_tokens_can_exceed_default_ceiling_when_raised(), test_estimate_max_new_tokens_respects_configured_cap(), test_estimate_max_new_tokens_scales_with_utterance_length(), test_estimate_max_new_tokens_uses_cjk_speaking_rate() (+21 more)

### Community 70 - "Community 70"
Cohesion: 0.11
Nodes (7): _ToolCallCoordinator, execute(), done(), _ToolCoordinatorError, _ToolResponseBatch, _validate_tool_config(), code()

### Community 72 - "Community 72"
Cohesion: 0.11
Nodes (23): LanguageModelHandler, StreamContext, FunctionTool, build_block_regex(), build_tool_system_prompt(), build_voice_system_prompt(), _stream_context(), test_local_audio_streaming_preserves_whitespace_across_chunks() (+15 more)

### Community 73 - "Community 73"
Cohesion: 0.11
Nodes (14): OmniVoiceTTSHandler, FakeModel, install_fake_omnivoice(), make_handler(), test_process_drops_audio_when_cancelled_during_blocking_generation(), test_process_resamples_clips_and_pads_16khz_blocks(), test_process_selects_clone_design_or_auto_mode(), test_process_stops_emitting_blocks_after_cancellation() (+6 more)

### Community 74 - "Community 74"
Cohesion: 0.10
Nodes (10): _dispatch_client_event(), Viseme, _FakeTransport, _make_unit(), test_conversation_delete_uses_shared_data_channel_dispatch(), test_viseme_send_rechecks_response_and_session_before_audio(), send_events(), test_visemes_use_current_webrtc_data_channel_before_media_audio() (+2 more)

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (19): ParaformerSTTHandler, _quiet_consoles(), test_paraformer_final_records_stt_duration(), timed_generate(), test_paraformer_progressive_does_not_record_stt(), test_sensevoice_final_records_stt_duration(), test_sensevoice_progressive_does_not_record_stt(), _vad_audio() (+11 more)

### Community 76 - "Community 76"
Cohesion: 0.12
Nodes (14): VADIterator, _FakeVADModel, _finish_utterance(), test_active_speech_samples_include_hysteresis_band_and_exclude_trailing_silence(), test_brief_silence_is_preserved_when_speech_resumes(), test_final_samples_are_kept_until_vad_declares_done(), test_pre_speech_padding_is_prepended_to_final_utterance(), test_speech_buffer_keeps_prefix_out_of_active_speech_buffer() (+6 more)

### Community 77 - "Community 77"
Cohesion: 0.13
Nodes (23): FakeModel, FakeResult, _lock_held_by_other_thread(), make_handler(), run(), test_auto_language_reports_the_detected_language(), test_concurrent_process_calls_are_serialized(), generate() (+15 more)

### Community 78 - "Community 78"
Cohesion: 0.11
Nodes (4): MeloTTSHandler, BaseHandler, test_tts_handler_forwards_provider_usage_after_cancellation(), test_tts_handler_forwards_response_events_without_processing_them()

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (16): ensure_private_dataset(), push_report(), report_filename(), slugify(), main(), FakeApi, report(), test_a_local_report_loads_from_disk() (+8 more)

### Community 80 - "Community 80"
Cohesion: 0.08
Nodes (4): TokenUsageEvent, TestHandleAudioCommit, TestMakeError, TestUsageMetricsTracking

### Community 81 - "Community 81"
Cohesion: 0.08
Nodes (3): BaseLanguageModelHandler, flush_text(), abort_mlx_generation()

### Community 82 - "Community 82"
Cohesion: 0.09
Nodes (13): _clip(), ElevenLabsTTS, HFWhisperSTT, work(), OpenAICompatLLM, work(), put(), work() (+5 more)

### Community 83 - "Community 83"
Cohesion: 0.09
Nodes (13): _lb_leave(), _load_balancer_headers(), _parse_ice_servers(), queue_end(), _queue_id(), queue_leave(), search(), SearchRequest (+5 more)

### Community 84 - "Community 84"
Cohesion: 0.11
Nodes (16): attach(), _client_ip(), current_access_token(), current_oauth(), _field(), oauth_login_required_reason(), _oauth_token(), _oauth_token_expired() (+8 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (4): codedError(), S2sRealtimeClient, sdk(), fixture()

### Community 86 - "Community 86"
Cohesion: 0.07
Nodes (13): calls(), _webrtc_calls_url(), _mock_whoami(), get(), test_failed_whoami_falls_back_without_blocking_retry(), get(), test_me_reuses_whoami_resolution_and_retries_next_request(), get() (+5 more)

### Community 87 - "Community 87"
Cohesion: 0.10
Nodes (15): SpeakerSegment, Inputs, make_diarizer(), Model, Processor, test_arbitrary_boundaries_preserve_cache_overlap_and_timestamps(), test_empty_session_does_not_call_model(), test_from_pretrained_defaults_to_available_accelerator() (+7 more)

### Community 88 - "Community 88"
Cohesion: 0.16
Nodes (23): ResponsesFunctionCall, drive_llm(), _finish(), _items(), _message(), _message_payload(), _stream(), test_assistant_message_payload_survives_complete_reasoning_tool_continuation() (+15 more)

### Community 89 - "Community 89"
Cohesion: 0.09
Nodes (25): remove_markdown(), remove_unspeechable(), _supported_languages(), test_every_stt_language_has_an_llm_language_name(), test_language_names_are_lowercase_and_non_empty(), test_remove_markdown_does_not_eat_multiplication(), test_remove_markdown_does_not_pair_independent_compact_operators(), test_remove_markdown_is_streaming_safe_across_split_deltas() (+17 more)

### Community 90 - "Community 90"
Cohesion: 0.10
Nodes (13): SmartTurnAnalyzer, _FakeAnalyzer, _handler_with_smart_turn(), _result(), test_analyzer_always_uses_cpu_execution_provider(), test_complete_turn_selects_default_speculative_grace(), test_default_model_download_uses_v32_cpu_variant(), test_incomplete_turn_selects_longer_speculative_grace() (+5 more)

### Community 91 - "Community 91"
Cohesion: 0.08
Nodes (4): make_mp3(), AudioTests, ProviderTests, run()

### Community 92 - "Community 92"
Cohesion: 0.10
Nodes (17): _add(), begin(), budget_for(), _connect(), end(), hash_key(), heartbeat(), init() (+9 more)

### Community 93 - "Community 93"
Cohesion: 0.11
Nodes (16): _error_response(), _ErrorDetail, _ErrorEnvelope, _forward_and_account(), LLMProxyConfig, LLMProxyUsage, mount_llm_proxy(), _mount_passthrough() (+8 more)

### Community 94 - "Community 94"
Cohesion: 0.13
Nodes (23): _handler(), test_drama3_credentials_and_sampling(), test_drama3_sglang_request_and_resampled_audio(), __aiter__(), test_drama3_startup_rejects_incompatible_server(), test_invalid_configuration_fails_before_warmup(), _chat_chunk(), _client() (+15 more)

### Community 95 - "Community 95"
Cohesion: 0.12
Nodes (19): load_report(), _add_run_arguments(), build_parser(), _build_subset(), _compare(), main(), redact_server_args(), _run() (+11 more)

### Community 96 - "Community 96"
Cohesion: 0.09
Nodes (12): _clip(), ElevenLabsTTS, work(), OpenAICompatLLM, work(), put(), work(), OpenAICompatSTT (+4 more)

### Community 98 - "Community 98"
Cohesion: 0.08
Nodes (5): add_supported_item(), build_active_chat(), ChatItemError, _ensure_id(), TestBuildActiveChat

### Community 99 - "Community 99"
Cohesion: 0.12
Nodes (21): _handler(), _session(), _speak(), test_client_voice_for_another_language_is_used_in_that_language(), test_english_fallback_uses_configured_variant(), test_english_reply_keeps_configured_american_voice(), test_language_switch_without_client_voice_restores_cli_voice(), test_response_voice_overrides_session_only_for_that_response() (+13 more)

### Community 100 - "Community 100"
Cohesion: 0.11
Nodes (4): ProviderResponseEnd, TextDelta, _response_end(), ResponsesApiModelHandler

### Community 101 - "Community 101"
Cohesion: 0.15
Nodes (6): OpenAICompatibleSTTHandler, _TranscriptionRequest, _WindowedTurn, test_http_stt_final_request_reaches_response_log_without_progressive_time(), test_openai_stt_encodes_mono_pcm16_16khz_wav(), test_cut_is_bounded_without_silence_and_prefers_a_quiet_frame_when_present()

### Community 102 - "Community 102"
Cohesion: 0.16
Nodes (31): _ack_session_update(), _completion_event(), _is_final_commit(), on_send(), on_send(), on_send(), on_send(), on_send() (+23 more)

### Community 103 - "Community 103"
Cohesion: 0.09
Nodes (4): _CancelCriteria, _Processor, _Tokenizer, VisionLanguageModelHandler

### Community 104 - "Community 104"
Cohesion: 0.19
Nodes (21): AssistantToolCallPart, _normalize_assistant_output_fields(), audio(), create(), finish(), speech(), test_cancel_after_first_audio_cannot_record_again(), test_cancelled_speech_does_not_anchor_independent_retry() (+13 more)

### Community 105 - "Community 105"
Cohesion: 0.08
Nodes (4): _configure_audio_sender(), _DataChannelInbox, _PacketCapture, TestBargeInAfterResponseDone

### Community 107 - "Community 107"
Cohesion: 0.09
Nodes (9): _install_fake_nemo(), _quiet_console(), test_cli_orukeet_defaults(), test_orukeet_empty_checkpoint_filename_errors(), test_orukeet_missing_nemo_names_the_extra(), test_orukeet_reports_detected_language_per_final(), test_orukeet_reports_greek_with_real_language_detection(), test_orukeet_setup_downloads_and_restore_from() (+1 more)

### Community 108 - "Community 108"
Cohesion: 0.08
Nodes (4): RealtimeBaseHandler, _stable_transcript_words(), _transcript_words(), SessionHandler

### Community 109 - "Community 109"
Cohesion: 0.17
Nodes (21): _event(), _handler(), _streaming_endpoint(), serve(), test_cancel_then_new_response_discards_buffered_old_audio(), test_environment_key_and_explicit_override(), test_failures_are_attributed_and_do_not_become_success(), test_fragmented_sse_preserves_samples_and_pads_only_tail() (+13 more)

### Community 110 - "Community 110"
Cohesion: 0.21
Nodes (16): RecordingDiarizer, running(), test_discarded_candidate_does_not_leak_intervals_into_next_utterance(), test_inflight_tail_uses_ready_prefix_without_waiting_or_mutating_sent_metadata(), test_invalid_queue_bound_is_rejected(), test_model_failure_invalidates_pending_and_can_recover_next_session(), test_overflow_invalidates_session_without_blocking_or_relabelling(), test_reopened_prefix_can_finish_after_later_revision_is_queued() (+8 more)

### Community 111 - "Community 111"
Cohesion: 0.13
Nodes (7): _first_language_code(), OpenAIRealtimeProtocol, _ProtocolEvent, _remote_error_message(), StreamingSTTProtocol, VLLMRealtimeProtocol, test_vllm_protocol_is_separate_from_openai_wire_shape()

### Community 112 - "Community 112"
Cohesion: 0.12
Nodes (18): _handler(), _quiet_console(), test_cancelled_or_discarded_audio_cannot_record_another_response(), generate(), test_empty_audio_leaves_latency_unset(), test_language_reload_is_excluded_from_ttfa(), generate(), test_preserves_first_audio_across_later_segments() (+10 more)

### Community 113 - "Community 113"
Cohesion: 0.09
Nodes (10): _resume_speech(), test_committed_turn_remains_valid_after_conversation_advances(), test_committing_wait_commits_after_pending_reopen_is_cancelled(), test_committing_wait_drops_confirmed_reopen(), test_late_commit_from_superseded_turn_is_rejected(), test_processing_hold_catches_reopen_started_during_wait(), test_processing_hold_survives_cancelled_reopen_candidate(), test_reused_turn_id_after_reset_is_not_reported_as_committed() (+2 more)

### Community 114 - "Community 114"
Cohesion: 0.15
Nodes (8): MLXLockStat, TurnLatencyTracker, test_format_log_line_shows_settle_named_lock_and_cut_tts(), test_log_platform_and_export_fields(), test_repeated_lock_waits_are_summed_per_handler(), test_turn_latency_tracker_first_write_wins_for_ttfa_and_e2e(), test_turn_latency_tracker_format_log_line(), test_turn_latency_tracker_record()

### Community 115 - "Community 115"
Cohesion: 0.15
Nodes (23): provider_create(), _make_function_call_done_event(), _make_output_item_done_event(), _make_stream(), _make_text_delta_event(), fake_create(), test_audio_streaming_preserves_provider_whitespace_across_chunks(), test_cancelled_text_tool_turn_rolls_back_ordered_call() (+15 more)

### Community 116 - "Community 116"
Cohesion: 0.14
Nodes (9): @openai/agents, @playwright/test, post(), SDK_CONFIG, startTestServer(), state(), waitFor(), root (+1 more)

### Community 117 - "Community 117"
Cohesion: 0.09
Nodes (16): LLMResponseChunk, generate(), fail_generation(), generate(), configured_cli(), config(), run_processor(), speak() (+8 more)

### Community 118 - "Community 118"
Cohesion: 0.13
Nodes (8): HttpTranscriptionOperation, TranscriptionRequestCancelled, TranscriptionRequestError, test_backend_rejections_surface_only_known_sanitized_reasons(), test_http_transcription_operation_can_select_model_by_language(), test_http_transcription_operation_uploads_wav_multipart(), test_http_transcription_operation_uses_gpt_transcribe_language_contract(), test_openai_stt_warmup_failure_prevents_handler_construction()

### Community 119 - "Community 119"
Cohesion: 0.14
Nodes (15): ChatTTSHandler, chattts_modules(), _FakeChat, InferCodeParams, _handler(), test_empty_provider_chunk_leaves_latency_unset(), test_non_stream_records_ttfa_before_resample(), infer() (+7 more)

### Community 120 - "Community 120"
Cohesion: 0.18
Nodes (7): _make_app(), _make_unit(), _proxy_config(), TestChatCompletionsPassthrough, TestUnavailableContract, TestUpstreamErrorPassthrough, TestUsageSection

### Community 122 - "Community 122"
Cohesion: 0.20
Nodes (8): TurnLatencyStore, test_clear_session_keeps_pending_while_other_sessions_active(), test_pending_turn_merges_vad_settle_and_named_lock(), test_record_response_helpers_lookup_existing_tracker_only(), test_response_lookup_does_not_create_or_revive_trackers(), test_smart_wait_uses_union_of_actual_intervals_and_stops_with_original_response(), test_turn_latency_store_pending_turn_merges_into_response(), test_turn_latency_store_pop_and_clear_session()

### Community 123 - "Community 123"
Cohesion: 0.21
Nodes (19): _FakeProcessor, _handler(), test_final_transcription_in_auto_mode_lets_the_model_detect_language(), test_final_transcription_reports_text_and_detected_language(), test_forced_language_accepts_full_name(), test_forced_language_is_passed_on_every_request_and_reported(), test_forced_language_outside_the_map_is_passed_through(), test_generation_strips_the_prompt_tokens_before_decoding() (+11 more)

### Community 124 - "Community 124"
Cohesion: 0.08
Nodes (4): ConnState, GlobalUsageMetrics, InputTurnAccounting, UsageMetrics

### Community 125 - "Community 125"
Cohesion: 0.15
Nodes (10): execute_tool(), _snippet(), FakeAsyncClient, FakeResponse, _patch_client(), test_youcom_search_deduplicates_identical_description_and_snippet(), test_youcom_search_preserves_distinct_text_with_a_shared_prefix(), test_youcom_search_reports_free_limit() (+2 more)

### Community 126 - "Community 126"
Cohesion: 0.12
Nodes (3): HistoryCommitError, HistoryHandler, _ResponseHistoryState

### Community 127 - "Community 127"
Cohesion: 0.16
Nodes (3): _annotation_from_spec(), _dedupe_types(), TestAnnotationFromSpec

### Community 128 - "Community 128"
Cohesion: 0.11
Nodes (10): _extract_text(), _is_nemotron_multilingual(), NemoASRSTTHandler, _reported_language_code(), _split_lang_tag(), _warn_reported_language(), test_farsi_empty_audio_does_not_decode(), test_farsi_language_is_not_overridden_by_text_detection() (+2 more)

### Community 129 - "Community 129"
Cohesion: 0.14
Nodes (18): _latency_lines(), _queue_turn(), test_chattts_first_audio_reaches_terminal_response(), resample(), test_failed_generation_records_duration_before_terminal_output(), test_mms_segments_reach_terminal_latency_metadata_and_cleanup(), test_multiple_qwen_segments_keep_first_audio_timings_in_terminal_log(), generate_custom_voice() (+10 more)

### Community 130 - "Community 130"
Cohesion: 0.15
Nodes (15): build_faster_whisper(), transcribe(), build_lightning_whisper_mlx(), build_mlx_audio_whisper(), build_whisper(), drive_turn(), _ensure_module(), _prepare() (+7 more)

### Community 131 - "Community 131"
Cohesion: 0.20
Nodes (3): split_sentences(), VoiceSession, player()

### Community 132 - "Community 132"
Cohesion: 0.18
Nodes (13): _context(), _FakeTranscribeModel, _handler(), test_cli_parakeet_unified_defaults(), test_final_transcription_copies_text_language_and_turn_fields(), test_missing_nemo_names_the_nemo_extra(), test_progressive_transcription_is_partial(), _vad_audio() (+5 more)

### Community 133 - "Community 133"
Cohesion: 0.15
Nodes (19): _farsi_handler(), test_empty_phonemes_skip_synthesis(), test_farsi_discards_bad_chunk_and_retries(), test_farsi_glottal_stop_and_zh_are_passed_verbatim(), test_farsi_rejects_incompatible_package(), test_farsi_rejects_invalid_or_oversized_ezafe_chain(), test_farsi_rejects_unknown_token(), test_farsi_reports_two_failed_generations() (+11 more)

### Community 134 - "Community 134"
Cohesion: 0.10
Nodes (11): test_setup_defaults_to_custom_voice_profile_off_darwin(), test_setup_logs_when_non_streaming_mode_set_on_darwin(), test_setup_normalizes_qwen3_language_aliases(), test_setup_passes_torch_backend_override_off_darwin(), test_setup_preserves_explicit_chunk_size_on_darwin(), test_setup_preserves_explicit_mlx_model_suffix_when_quantization_unset(), test_setup_preserves_faster_backend_off_darwin(), test_setup_rejects_invalid_mlx_quantization() (+3 more)

### Community 135 - "Community 135"
Cohesion: 0.20
Nodes (3): split_sentences(), VoiceSession, player()

### Community 137 - "Community 137"
Cohesion: 0.10
Nodes (4): build_compactor(), compact(), _extract_json(), _render_transcript()

### Community 138 - "Community 138"
Cohesion: 0.14
Nodes (10): LightningWhisperSTTHandler, _load(), _setup_handler(), test_a_code_merely_containing_auto_is_not_the_sentinel(), test_auto_spellings_canonicalize(), test_empty_values_pass_through(), test_non_strings_pass_through(), test_real_codes_pass_through_untouched() (+2 more)

### Community 139 - "Community 139"
Cohesion: 0.16
Nodes (8): FasterWhisperSTTHandler, handler(), test_caller_dict_is_not_consumed(), test_default_is_timestamps_on(), test_one_config_reused_gives_both_handlers_the_same_setting(), test_other_kwargs_pass_through(), test_return_timestamps_is_inverted(), test_shared_setup_default_is_not_polluted()

### Community 140 - "Community 140"
Cohesion: 0.14
Nodes (14): background(), FakeDiarizer, FakeVAD, make_vad(), ready(), test_builder_loads_and_warms_separate_models_per_pipeline(), load(), test_compact_speaker_tag_survives_history_eviction() (+6 more)

### Community 141 - "Community 141"
Cohesion: 0.14
Nodes (7): AssistantMessage, Usage, _chat_response_end(), _iter_chat_response_events(), _iter_chat_stream_events(), flush_tools(), ResponsesAssistantMessage

### Community 143 - "Community 143"
Cohesion: 0.15
Nodes (6): benchmark_handler(), BenchmarkResult, load_audio(), main(), print_results(), save_results()

### Community 144 - "Community 144"
Cohesion: 0.13
Nodes (3): send_ws_event(), SessionTransport, WebSocketTransport

### Community 145 - "Community 145"
Cohesion: 0.13
Nodes (4): _accepts_prompt(), language_to_code(), Qwen3ASRSTTHandler, resolve_torch_dtype()

### Community 146 - "Community 146"
Cohesion: 0.21
Nodes (16): _join_transcripts(), clear_failed_turn(), close_connection(), combined_hypothesis(), discard_utterance(), emit_partial(), ensure_connection(), fail_commit() (+8 more)

### Community 148 - "Community 148"
Cohesion: 0.13
Nodes (9): capture_launch(), isolated_job_environment(), test_default_job_uses_ggml_and_inherits_hf_auth_without_command_line_secrets(), test_environment_overrides_preserve_prompt_quotes_and_literal_shell_characters(), test_full_job_selects_all_1000_questions_without_a_limit(), test_full_server_override_keeps_provider_settings_and_existing_openai_key(), test_job_redacts_logs_before_upload_and_preserves_runner_exit_status(), test_job_refuses_public_log_destination_including_startup_failures() (+1 more)

### Community 149 - "Community 149"
Cohesion: 0.13
Nodes (9): do_GET(), do_PATCH(), do_POST(), _handle(), _json(), _read(), _send(), make_mp3() (+1 more)

### Community 152 - "Community 152"
Cohesion: 0.18
Nodes (19): acquireMicStream(), createResumedAudioContext(), doStart(), endQueueTicket(), endTrackedSession(), handleStartError(), micConstraints(), onClientStatus() (+11 more)

### Community 153 - "Community 153"
Cohesion: 0.12
Nodes (9): execute_tool(), ToolResult, executor(), executor(), executor(), FakeAsyncClient, FakeResponse, test_serper_search_reports_missing_api_key() (+1 more)

### Community 154 - "Community 154"
Cohesion: 0.17
Nodes (4): DiarizationWorker, _Work, SpeakerAttributionFuture, SpeakerSession

### Community 155 - "Community 155"
Cohesion: 0.13
Nodes (11): _build_handlers(), FakeArguments, _resolve(), restore_torch_threads(), test_cli_rejects_non_positive_values(), test_default_keeps_silero_single_thread_setting(), test_explicit_value_survives_silero_for_every_pipeline(), test_torch_num_threads_is_unset_by_default() (+3 more)

### Community 157 - "Community 157"
Cohesion: 0.12
Nodes (14): call(), _make_response(), fake_create(), test_discarded_prefetch_does_not_block_on_provider_connect(), test_empty_context_fails_with_clear_message_without_calling_provider(), fake_create(), test_process_preserves_nonstreaming_text_tool_text_order(), create() (+6 more)

### Community 158 - "Community 158"
Cohesion: 0.19
Nodes (15): run(), source(), test_anonymous_turns_do_not_share_text_cache_and_old_turn_caches_retire(), test_background_windows_do_not_emit_captions_or_a_final_and_final_reuses_prefix(), test_changed_committed_audio_or_language_invalidates_cached_text(), test_failed_window_does_not_publish_a_truncated_success_and_reopen_keeps_earlier_text(), test_final_does_not_wait_for_cancelled_progressive_or_accept_its_late_prefix(), test_join_preserves_repetition_and_cjk_text() (+7 more)

### Community 159 - "Community 159"
Cohesion: 0.16
Nodes (11): _expected(), _handler(), _load(), _require(), test_configured_language_survives_the_session(), test_detected_language_does_not_survive_the_session(), test_qwen3_auto_does_not_survive_as_a_code(), test_qwen3_records_the_configured_language() (+3 more)

### Community 160 - "Community 160"
Cohesion: 0.15
Nodes (10): _FakeConfig, _FakeModel, _make_handler(), stub_transformers(), test_auto_language_is_not_written_into_gen_kwargs(), test_caller_supplied_gen_kwargs_is_left_alone(), test_explicit_gen_kwargs_still_carries_the_language(), test_handlers_do_not_share_one_gen_kwargs_dict() (+2 more)

### Community 161 - "Community 161"
Cohesion: 0.14
Nodes (9): set_anon_cookie(), agents_sdk_bundle(), _finalize_grant(), _log_load_balancer_failure(), _login_required_response(), me(), queue_status(), _safe_json() (+1 more)

### Community 162 - "Community 162"
Cohesion: 0.15
Nodes (4): StreamingPcm16Resampler, cancelled(), emit(), record_first_provider_audio()

### Community 163 - "Community 163"
Cohesion: 0.13
Nodes (4): TestStripImages, _make_handler(), _OverlappingSpeechHandler, test_local_response_history_precedes_speech_that_arrived_during_generation()

### Community 164 - "Community 164"
Cohesion: 0.17
Nodes (7): _AppendAudio, _Commit, _DiscardAudio, _Reset, _StartTurn, _Stop, _StreamingSession

### Community 166 - "Community 166"
Cohesion: 0.14
Nodes (4): load_script(), N8nWorkflowTests, ProjectFilesTests, SetupTelnyxTests

### Community 167 - "Community 167"
Cohesion: 0.11
Nodes (17): hono, zod, dependencies, hono, @openai/agents, zod, devDependencies, @playwright/test (+9 more)

### Community 168 - "Community 168"
Cohesion: 0.15
Nodes (5): DEFAULT_PLAYBACK_BUFFER_MS, worklet(), fixture(), Session, Transport

### Community 170 - "Community 170"
Cohesion: 0.16
Nodes (8): build_text_system_prompt(), _dance_tool(), test_text_prompt_allows_markdown_and_drops_voice_rules(), test_text_prompt_can_include_language_hint(), test_text_prompt_keeps_persona_in_session_prompt(), test_text_tool_prompt_drops_speak_first_but_keeps_structural_rules(), test_voice_tool_prompt_does_not_include_text_only_guidance(), TestToolToCodePrompt

### Community 171 - "Community 171"
Cohesion: 0.19
Nodes (9): _blocks(), _FakeChat, InferCodeParams, handler_factory(), test_flat_and_column_chunks_produce_identical_audio(), test_streaming_accepts_a_flat_chunk(), test_streaming_stops_on_a_none_chunk(), test_streaming_stops_on_an_empty_chunk() (+1 more)

### Community 173 - "Community 173"
Cohesion: 0.15
Nodes (4): load_script(), N8nWorkflowTests, ProjectFilesTests, SetupTelnyxTests

### Community 174 - "Community 174"
Cohesion: 0.22
Nodes (11): _available(), test_auto_picks_first_available_supported_device(), test_auto_skips_available_devices_the_handler_does_not_support(), test_auto_without_an_available_supported_device_is_an_error(), test_chattts_passes_its_device_to_the_model(), test_chattts_rejects_an_unsupported_device(), test_explicit_supported_device_is_kept_with_its_index(), test_explicit_unsupported_device_names_the_supported_devices() (+3 more)

### Community 175 - "Community 175"
Cohesion: 0.21
Nodes (6): Account, fmt(), $, DEBUG, escHtml(), truncateError()

### Community 178 - "Community 178"
Cohesion: 0.15
Nodes (6): _quiet_console(), test_cli_nemotron_streaming_defaults(), test_cli_nemotron_streaming_model_name_override(), test_english_nemotron_keeps_configured_language(), test_multilingual_nemotron_uses_detected_language_per_utterance(), _vad_audio()

### Community 180 - "Community 180"
Cohesion: 0.15
Nodes (3): MiniMaxSpeechOperation, MiniMaxTTSHandler, SpeechRequestError

### Community 181 - "Community 181"
Cohesion: 0.12
Nodes (4): _quiet_console(), test_auto_is_reported_as_english(), test_setup_calls_from_pretrained_with_model_name(), test_unknown_language_code_warns_but_is_reported()

### Community 183 - "Community 183"
Cohesion: 0.18
Nodes (9): AUDIO_SAMPLE_RATE, AUDIO_WORKLET_VERSION, normalizePlaybackBufferMs(), timing, readTurnLatency(), extractResponseTranscript(), trimTrailingSlash(), VIS_BAND_EDGES (+1 more)

### Community 186 - "Community 186"
Cohesion: 0.17
Nodes (10): _context(), _FakeTransformers, _hardware(), _quiet_console(), test_cli_builds_a_qwen3_asr_handler_from_its_flags(), test_language_to_code(), test_resolve_torch_dtype(), test_setup_does_not_share_generation_kwargs_between_handlers() (+2 more)

### Community 188 - "Community 188"
Cohesion: 0.20
Nodes (6): _digits_one_by_one(), normalize(), number_to_words(), _number_token_to_words(), numbers_to_words(), _under_thousand()

### Community 189 - "Community 189"
Cohesion: 0.17
Nodes (7): text_chunk(), runtime_config(), service(), _session_16k(), should_listen(), text_prompt_queue(), speech_chunks()

### Community 190 - "Community 190"
Cohesion: 0.20
Nodes (4): parse_function_call(), _split_simple_calls_with_regex(), TestNestedParens, TestPositionalArguments

### Community 191 - "Community 191"
Cohesion: 0.19
Nodes (6): PendingSpeakerAttribution, SpeakerAttribution, SpeakerInterval, test_mixed_unknown_and_partial_audio_are_explicit(), test_unavailable_llm_metadata_hides_invalid_labels(), test_speaker_durations_include_brief_and_simultaneous_activity()

### Community 192 - "Community 192"
Cohesion: 0.17
Nodes (7): SpeechRequestCancelled, _FakeSpeechOperation, test_http_speech_cancellation_closes_transport_before_response_headers(), serve_stalled_response(), test_http_speech_cancellation_during_client_construction_prevents_dispatch(), cancel_check(), consume()

### Community 193 - "Community 193"
Cohesion: 0.38
Nodes (10): handler(), _override_and_end_session(), _server_vad(), _session(), _settings(), test_next_session_overriding_one_field_keeps_the_other_default(), test_next_session_repeating_previous_overrides_applies_them(), test_next_session_without_turn_detection_fields_uses_configured_defaults() (+2 more)

### Community 194 - "Community 194"
Cohesion: 0.15
Nodes (3): LiveApp, SSEScript, TestStreamingPassthrough

### Community 195 - "Community 195"
Cohesion: 0.21
Nodes (3): _SafeSend, TelnyxTransport, WebTransport

### Community 196 - "Community 196"
Cohesion: 0.24
Nodes (5): _concat(), pcm16ToWavBlob(), SentAudioRecorder, USER_AUDIO_SAMPLE_RATE, _writeAscii()

### Community 198 - "Community 198"
Cohesion: 0.21
Nodes (11): _make_request(), test_audio_response_sentence_batches_streaming_call(), test_cancelled_nonstreaming_response_emits_provider_usage(), test_claimed_failed_prefetch_emits_transactional_fallback(), fake_create(), test_disable_thinking_passes_extra_body(), test_failed_prefetch_is_discarded_before_terminal_is_yielded(), fail_create() (+3 more)

### Community 200 - "Community 200"
Cohesion: 0.21
Nodes (3): _SafeSend, TelnyxTransport, WebTransport

### Community 201 - "Community 201"
Cohesion: 0.17
Nodes (9): _append_user_message(), TransformersAssistantMessage, TransformersFunctionCallMessage, TransformersSystemMessage, TransformersToolCall, TransformersToolCallFunction, TransformersToolMessage, TransformersUserMessage (+1 more)

### Community 203 - "Community 203"
Cohesion: 0.18
Nodes (13): effectiveTransport(), fetchConfig(), fillDeviceSelect(), openSettings(), promptServerUrl(), readGateThreshold(), readSettingsFromForm(), refreshAudioDeviceLists() (+5 more)

### Community 206 - "Community 206"
Cohesion: 0.18
Nodes (4): connection_handoff(), send_upload(), _BlockingPartialQueue, _FakeSocket

### Community 207 - "Community 207"
Cohesion: 0.17
Nodes (6): test_assistant_detector_accepts_short_cjk_text(), test_build_lingua_detector_preloads_language_models(), test_configured_language_is_accepted_but_cannot_force_parakeet(), test_detect_language_from_long_norwegian_text_maps_nb_to_no(), test_detect_language_from_short_english_text_uses_lingua_successfully(), test_detect_language_from_short_text_returns_none_without_querying_detector()

### Community 209 - "Community 209"
Cohesion: 0.29
Nodes (6): downsample(), fetch_star_dates(), gh_post(), main(), nice_ceil(), render_svg()

### Community 211 - "Community 211"
Cohesion: 0.23
Nodes (5): connect_and_read_events(), publish(), reader_cancelled(), pause_failure(), paused()

### Community 212 - "Community 212"
Cohesion: 0.17
Nodes (5): _ReopenGrace, test_gate_holds_for_reopen_grace_without_blocking(), test_newer_turn_releases_older_reopen_grace_waiter_as_stale(), test_reopen_grace_wait_drops_confirmed_reopen(), test_configured_grace_is_not_reported_as_wait_without_a_gate()

### Community 214 - "Community 214"
Cohesion: 0.17
Nodes (4): _free_port(), server_env(), _ServerEnv, server_env()

### Community 215 - "Community 215"
Cohesion: 0.39
Nodes (11): bubble(), close(), closeSocket(), connect(), open(), play(), sendText(), startVoice() (+3 more)

### Community 217 - "Community 217"
Cohesion: 0.39
Nodes (11): bubble(), close(), closeSocket(), connect(), open(), play(), sendText(), startVoice() (+3 more)

### Community 220 - "Community 220"
Cohesion: 0.33
Nodes (9): _dig(), _env(), _norm(), key_for(), num(), pick(), pick_list(), resolve() (+1 more)

### Community 223 - "Community 223"
Cohesion: 0.18
Nodes (3): test_cancelled_stream_emits_provider_usage_and_rolls_back_history(), test_claimed_prefetch_cancel_aborts_blocked_provider_read(), test_claimed_prefetch_cancel_does_not_block_on_provider_connect()

### Community 224 - "Community 224"
Cohesion: 0.33
Nodes (5): HttpSpeechOperation, test_http_speech_accepts_matching_or_ambiguous_content_types(), test_http_speech_cancellation_after_completion_is_harmless(), test_http_speech_rejects_known_audio_format_mismatches(), test_http_speech_validates_against_decoder_format_when_payload_is_overridden()

### Community 226 - "Community 226"
Cohesion: 0.27
Nodes (4): TestOutboundAudioPackets, blocked_encode(), _wait_until(), encode()

### Community 227 - "Community 227"
Cohesion: 0.24
Nodes (3): _FakeInputs, _LegacyProcessor, decode()

### Community 228 - "Community 228"
Cohesion: 0.33
Nodes (9): _dig(), _env(), _norm(), key_for(), num(), pick(), pick_list(), resolve() (+1 more)

### Community 229 - "Community 229"
Cohesion: 0.20
Nodes (4): _extract_function_name(), _literal_from_ast(), _parse_call_expr(), _parse_function_exprs()

### Community 230 - "Community 230"
Cohesion: 0.24
Nodes (7): normalize_realtime_url(), test_audio_client_accepts_callable_executors_returning_awaitables(), async_handler(), executor(), test_audio_client_rejects_invalid_playback_buffer(), test_full_realtime_url_is_normalized_for_openai_sdk(), test_realtime_url_rejects_noncanonical_endpoints()

### Community 232 - "Community 232"
Cohesion: 0.20
Nodes (7): test_discarded_prefetch_aborts_blocked_provider_stream(), __init__(), __iter__(), run(), test_prefetch_uses_one_worker_and_one_bounded_queue(), __init__(), test_reasoning_tool_continuation_replays_original_provider_items()

### Community 235 - "Community 235"
Cohesion: 0.42
Nodes (7): do_GET(), do_PATCH(), do_POST(), _handle(), _json(), _read(), _send()

### Community 236 - "Community 236"
Cohesion: 0.28
Nodes (9): activeToolDefs(), autoStartCamera(), disableCamera(), enableCamera(), pushToolsToSession(), saveTools(), searchAvailable(), syncToolsUi() (+1 more)

### Community 237 - "Community 237"
Cohesion: 0.25
Nodes (9): arcPoint(), dbToFraction(), fullArcD(), gateParams(), initGateArc(), paintInputLevel(), renderGateHandle(), setGateThreshold() (+1 more)

### Community 238 - "Community 238"
Cohesion: 0.28
Nodes (3): generate_mlx(), generate_transformers(), generate_mlx()

### Community 240 - "Community 240"
Cohesion: 0.25
Nodes (4): PersianPhonemizer, phonemizer(), test_phonemizer_normalizes_before_g2p(), test_phonemizer_rejects_length_limits()

### Community 241 - "Community 241"
Cohesion: 0.22
Nodes (3): test_http_speech_timeout_is_a_total_deadline(), __aexit__(), aclose()

### Community 242 - "Community 242"
Cohesion: 0.22
Nodes (4): test_farsi_cancels_buffered_generation_without_emitting_audio(), stream(), test_farsi_ttfa_precedes_buffering_and_ignores_generated_pauses(), test_pocket_records_ttfa_at_first_provider_chunk_and_preserves_first_audio()

### Community 245 - "Community 245"
Cohesion: 0.29
Nodes (4): test_vad_speech_start_precedes_buffered_streaming_partial(), delta_event(), on_send(), start_and_publish_before_vad_resumes()

### Community 248 - "Community 248"
Cohesion: 0.29
Nodes (5): test_pocket_worker_timings_reach_terminal_response_before_tracker_cleanup(), _run_farsi_inputs(), _run_farsi_worker(), test_farsi_cancelled_exception_does_not_report_failure(), test_farsi_failed_response_skips_later_chunks_without_reopening_audio()

### Community 249 - "Community 249"
Cohesion: 0.46
Nodes (6): _notifier(), test_audio_input_notifier_discards_stale_pending_vad_measurement(), test_audio_input_notifier_ignores_progressive_audio(), test_audio_input_notifier_routes_final_audio_through_realtime_service_queue(), test_audio_input_notifier_uses_per_endpoint_processing_delay(), test_notifier_does_not_restart_expired_tracker_processing_delay()

### Community 250 - "Community 250"
Cohesion: 0.29
Nodes (4): _native_handler(), __call__(), test_kokoro_records_ttfa_at_first_provider_chunk_and_preserves_first_audio(), stream()

### Community 258 - "Community 258"
Cohesion: 0.29
Nodes (4): test_farsi_failed_response_tracking_clears_on_matching_terminal_or_session_end(), test_farsi_failure_does_not_block_a_different_response_identity(), test_farsi_worker_failure_finishes_realtime_response_as_failed(), failed_g2p()

### Community 265 - "Community 265"
Cohesion: 0.47
Nodes (3): cancelled(), emit(), record_ttfa()

### Community 267 - "Community 267"
Cohesion: 0.53
Nodes (3): make_real_diarizer(), test_real_model_reuses_identity_across_centered_utterance_boundaries(), test_real_processor_and_tiny_model_cover_complete_audio()

### Community 280 - "Community 280"
Cohesion: 0.50
Nodes (3): test_cancellation_discards_buffered_sentence_audio(), test_cancellation_during_phonemization_skips_synthesis(), phonemize()

### Community 285 - "Community 285"
Cohesion: 1.00
Nodes (3): huggingface/speech-to-speech Repository, GitHub Star Growth Trend ( Aug 2024 to Sep 2026 ), speech-to-speech Star History Chart

## Ambiguous Edges - Review These
- `Endpoint Swap Demo (Dark Theme)` → `Provider Endpoint Swap`  [AMBIGUOUS]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/vendor/speech-to-speech/docs/assets/endpoint-swap-dark.gif · relation: references
- `Endpoint Swap Demo (Light Theme)` → `Provider Endpoint Swap`  [AMBIGUOUS]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/vendor/speech-to-speech/docs/assets/endpoint-swap-light.gif · relation: references
- `Speech-to-Speech Project Logo` → `Speech-to-Speech Project`  [AMBIGUOUS]
  voice-sales-agent-FULL-with-your-keys/voice-sales-agent/vendor/speech-to-speech/logo.png · relation: references

## Knowledge Gaps
- **56 isolated node(s):** `hono`, `zod`, `speech-to-speech`, `S2S_SOURCE_REVISION`, `Voice agent Python dependencies (requirements.txt)` (+51 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2622 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **108 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpeculativeTurnTracker` connect `Community 31` to `Python Stdlib Imports`, `Community 129`, `Parler TTS Archive`, `Pipeline Arguments & Config`, `Backend Config & Handlers`, `Community 262`, `Community 260`, `OpenAI Realtime Core`, `Community 137`, `Community 266`, `Realtime Events & Messages`, `Realtime Service Internals`, `Realtime Responses`, `TTS Benchmarking`, `MLX & OpenAI Types`, `Community 140`, `Conversation History`, `Chat Completions Tests`, `Audio Input Notifier`, `Community 132`, `Smart Turn VAD`, `Community 155`, `Kokoro TTS Handler`, `Community 32`, `Community 164`, `Community 37`, `Community 45`, `Community 47`, `Community 51`, `Community 180`, `Community 186`, `Community 61`, `Community 63`, `Community 64`, `Community 193`, `Community 69`, `Community 73`, `Community 204`, `Community 205`, `Community 78`, `Community 81`, `Community 212`, `Community 88`, `Community 90`, `Community 101`, `Community 249`, `Community 103`, `Community 231`, `Community 106`, `Community 239`, `Community 113`, `Community 246`, `Community 119`, `Community 121`, `Community 124`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 155 inferred relationships involving `SpeculativeTurnTracker` (e.g. with `MeloTTSHandler` and `RealtimeService`) actually correct?**
  _`SpeculativeTurnTracker` has 155 INFERRED edges - model-reasoned connections that need verification._
- **What connects `hono`, `zod`, `speech-to-speech` to the rest of the system?**
  _56 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Python Stdlib Imports` be split into smaller, more focused modules?**
  _Cohesion score 0.04514935236584721 - nodes in this community are weakly interconnected._
- **Why does `Chat` connect `LLM Chat Layer` to `Python Stdlib Imports`, `OpenAI Realtime Core`, `Community 270`, `MLX & OpenAI Types`, `Conversation History`, `Chat Completions Tests`, `Chat Generation Logic`, `Response Prefetch`, `Chat Tool Calls`, `Community 156`, `Community 163`, `Community 39`, `Community 169`, `Community 41`, `Community 177`, `Community 52`, `Community 53`, `Community 63`, `Community 72`, `Community 81`, `Community 98`, `Community 100`, `Community 103`, `Community 115`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Endpoint Swap Demo (Dark Theme)` and `Provider Endpoint Swap`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Endpoint Swap Demo (Light Theme)` and `Provider Endpoint Swap`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._