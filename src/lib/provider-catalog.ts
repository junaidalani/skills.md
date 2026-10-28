export const providerCatalog = {
  llm: ["OpenAI", "Anthropic", "Google", "Groq", "OpenRouter", "DeepSeek"],
  stt: ["Deepgram", "Groq Whisper", "Fish Audio", "Hugging Face", "OpenAI"],
  tts: ["ElevenLabs", "Cartesia", "Deepgram Aura", "OpenAI", "Fish Audio", "OpenRouter"],
  email: ["Resend", "Postmark"],
} as const;

export const providerDefaults = {
  llm: { label: "AI brain", provider: "OpenAI", model: "GPT-4o mini", description: "Understands callers and follows your call script." },
  stt: { label: "Listening", provider: "Deepgram", model: "Nova-3", description: "Turns the caller’s words into text in real time." },
  tts: { label: "Voice", provider: "ElevenLabs", model: "Flash v2.5", description: "Speaks replies in a natural, consistent voice." },
  email: { label: "Email delivery", provider: "Resend", model: "Email API", description: "Delivers new lead alerts to your team." },
} as const;

export type ProviderKind = keyof typeof providerCatalog;
export function isProviderKind(value: string): value is ProviderKind {
  return Object.prototype.hasOwnProperty.call(providerCatalog, value);
}
