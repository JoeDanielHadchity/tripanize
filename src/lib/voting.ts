export type PollOption = { id: string; label: string };
export type PollView = { id: string; question: string; kind: string; status: string; version: number; options: (PollOption & { count: number })[]; myOptionId: string | null; totalVotes: number; chosenOptionId: string | null; decisionNote: string | null; decidedAt: string | null };
