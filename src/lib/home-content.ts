/** Public explainer content shared by the website and native home. */
export const HOME_SCENES = [
  { label: "Check-in", title: "Set up your trip", copy: "Choose a destination, dates and preferences.", note: "Your trip", rows: [["Where", "Porto, Portugal"], ["When", "1–4 May"], ["Who", "3 travelers"], ["Pace", "Relaxed"]] },
  { label: "Takeoff", title: "Generate your plan", copy: "Get an editable itinerary with linked booking suggestions.", note: "Day 1 · Porto", rows: [["09:00", "São Bento station"], ["10:30", "Livraria Lello"], ["12:00", "Time for lunch"], ["17:00", "Ribeira waterfront"]] },
  { label: "Cruising", title: "Invite your group", copy: "Choose who can edit and who can view.", note: "Your group", rows: [["You", "Organizer"], ["Maya", "Editor"], ["Sam", "Viewer"], ["Invites", "Share a link"]] },
  { label: "Landing", title: "Track expenses", copy: "Keep receipts, track your budget and see who owes whom.", note: "Payments", rows: [["Accommodation", "Maya paid €270"], ["Dinner", "You paid €90"], ["Train", "Sam paid €60"], ["You owe Maya", "€50"]] },
] as const;
