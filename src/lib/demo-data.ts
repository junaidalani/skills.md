export const demoDashboard = {
  demo: true,
  tenantName: "Northstar Heating & Air",
  userName: "Taylor Morgan",
  planId: "growth",
  tenantStatus: "active",
  stats: {
    callsToday: 18,
    callsChange: 12,
    minutesThisMonth: 462,
    minutesIncluded: 800,
    leadsCaptured: 27,
    leadsChange: 8,
    answerRate: 98,
  },
  weeklyCalls: [34, 48, 39, 62, 51, 74, 57],
  calls: [
    { id: "demo-call-1", name: "Jordan Lee", phone: "+1 (415) ••• ••27", reason: "AC repair · urgent", duration: "3:42", time: "Today, 10:42 AM", outcome: "Lead captured", initials: "JL" },
    { id: "demo-call-2", name: "Casey Williams", phone: "+1 (415) ••• ••81", reason: "System tune-up", duration: "2:18", time: "Today, 9:16 AM", outcome: "Appointment set", initials: "CW" },
    { id: "demo-call-3", name: "Sam Patel", phone: "+1 (628) ••• ••14", reason: "New installation quote", duration: "4:06", time: "Today, 8:51 AM", outcome: "Lead captured", initials: "SP" },
    { id: "demo-call-4", name: "Alex Rivera", phone: "+1 (415) ••• ••63", reason: "After-hours leak", duration: "1:54", time: "Yesterday, 8:32 PM", outcome: "Callback requested", initials: "AR" },
  ],
  leads: [
    { id: "demo-lead-1", name: "Jordan Lee", phone: "+1 (415) ••• ••27", reason: "AC repair · urgent", status: "new", createdAt: "10:42 AM" },
    { id: "demo-lead-2", name: "Casey Williams", phone: "+1 (415) ••• ••81", reason: "System tune-up", status: "contacted", createdAt: "9:16 AM" },
    { id: "demo-lead-3", name: "Sam Patel", phone: "+1 (628) ••• ••14", reason: "Installation quote", status: "new", createdAt: "8:51 AM" },
  ],
  providerHealth: [
    { kind: "llm", label: "AI brain", provider: "OpenAI", model: "GPT-4o mini", status: "Connected", last4: "••••" },
    { kind: "stt", label: "Listening", provider: "Deepgram", model: "Nova-3", status: "Connected", last4: "••••" },
    { kind: "tts", label: "Voice", provider: "ElevenLabs", model: "Flash v2.5", status: "Connected", last4: "••••" },
  ],
  numbers: [
    { id: "demo-number-1", e164: "+1 (415) 555-0138", status: "Active", label: "San Francisco · Main line" },
  ],
  agent: {
    name: "Northstar call assistant",
    greeting: "Thanks for calling Northstar Heating & Air. I’m the AI assistant. How can I help today?",
    businessName: "Northstar Heating & Air",
    businessHours: "Monday–Friday, 7:00 AM–6:00 PM",
    services: "AC repair, heating, maintenance, installation",
    tone: "Warm and professional",
    language: "English (US)",
    active: true,
  },
};

export const demoProviderKinds = [
  { kind: "llm", label: "AI brain", description: "Understands callers and follows your call script.", provider: "OpenAI", model: "GPT-4o mini" },
  { kind: "stt", label: "Listening", description: "Turns the caller’s words into text in real time.", provider: "Deepgram", model: "Nova-3" },
  { kind: "tts", label: "Voice", description: "Speaks replies in a natural, consistent voice.", provider: "ElevenLabs", model: "Flash v2.5" },
  { kind: "telephony", label: "Phone service", description: "Numbers, calls, transfers, and text-back.", provider: "Telnyx", model: "Voice API" },
];