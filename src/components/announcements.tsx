import { activeAnnouncements } from "@/server/admin/operations";
export async function AnnouncementBanner() {
  const announcements = await activeAnnouncements();
  if (!announcements.length) return null;
  return <aside aria-label="Tripanize announcements" className="border-b border-line bg-accent-soft text-accent-ink"><div className="mx-auto max-w-6xl space-y-2 px-4 py-3">{announcements.map(a => <div key={a.id} role="status" className="text-sm"><strong>{a.tone === "maintenance" ? "Maintenance · " : ""}{a.title}</strong><p className="mt-1 whitespace-pre-wrap break-words">{a.message}</p></div>)}</div></aside>;
}
