export const planMinutes: Record<string, number> = { starter: 300, growth: 800, pro: 2000 };

export const planFor = (planId: string) => planMinutes[planId] ?? planMinutes.starter;
