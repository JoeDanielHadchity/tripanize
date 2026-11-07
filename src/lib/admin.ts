/** Admin sections, grouped the way they appear in the sidebar. */
export const ADMIN_GROUPS = [
  { label: null, tabs: [["overview", "Home"]] },
  { label: "People", tabs: [["users", "Users"], ["trials", "Trials"]] },
  { label: "Business", tabs: [["trips", "Trips"], ["payments", "Payments"], ["ai", "AI costs"]] },
  { label: "Content", tabs: [["ideas", "Trip ideas"], ["texts", "Texts"], ["announcements", "Banners"]] },
  { label: "Talk to users", tabs: [["support", "Support"]] },
  { label: "System", tabs: [["health", "Health"], ["visitors", "Visitors"], ["activity", "Activity log"]] },
] as const;

export type AdminTab = typeof ADMIN_GROUPS[number]["tabs"][number][0];
export const ADMIN_TABS: (readonly [AdminTab, string])[] = ADMIN_GROUPS.flatMap(g => [...g.tabs] as (readonly [AdminTab, string])[]);
