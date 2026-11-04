export const ADMIN_TABS = [
  ["overview", "Overview"], ["visitors", "Visitors"], ["users", "Users"], ["trips", "Trips"], ["payments", "Payments"], ["trials", "Trials"],
  ["ai", "AI usage & costs"], ["support", "Support"], ["health", "System health"], ["announcements", "Announcements"], ["activity", "Activity log"],
] as const;
export type AdminTab = typeof ADMIN_TABS[number][0];
