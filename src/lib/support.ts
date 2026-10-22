export const SUPPORT_TOPICS = {
  general: "General question",
  technical: "Technical problem",
  billing: "Payment or refund",
  privacy: "Privacy or account request",
} as const;
export type SupportTopic = keyof typeof SUPPORT_TOPICS;
