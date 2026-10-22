export const ASSISTANT_MAX_MESSAGE = 3000;
export type AssistantStopPreview = { title: string; time: string | null; duration: number | null; plan: string; protected: boolean };
export type AssistantPreview = {
  changes: string[];
  days: { date: string; beforeTitle: string | null; afterTitle: string | null; before: AssistantStopPreview[]; after: AssistantStopPreview[] }[];
  warnings: string[];
  conflicts: string[];
};
export type AssistantTurn = {
  id: string; question: string; status: string; reply: string | null; preview: AssistantPreview | null;
  sources: string[]; error: string | null; appliedAt: string | null; dismissed: boolean; createdAt: string;
};
export type AssistantConversation = { turns: AssistantTurn[]; canEdit: boolean; aiReady: boolean; latestId: string | null };
