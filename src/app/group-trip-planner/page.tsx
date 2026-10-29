import { FeaturePage, FeatureSteps } from "@/components/feature-page";
import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = publicMetadata("/group-trip-planner", PUBLIC_PAGES["/group-trip-planner"]);

export default function GroupTripPlannerPage() {
  return <FeaturePage path="/group-trip-planner" eyebrow="Less back-and-forth. More going together." title="Group Travel." emphasis="Everyone on the same page."
    intro="Share one itinerary, keep bookings together and choose who can edit. Your group has a plan everyone can find."
    planNote="Free: shared plans and member roles. Premium adds chat, expenses and optional location sharing."
    preview={<figure className="feature-preview group-preview"><figcaption><span className="feature-eyebrow">Illustrative travel group</span><strong>One trip. Three roles.</strong><span>You decide who can change the plan.</span></figcaption><ul className="preview-members"><li><span className="preview-avatar">A</span><div><strong>Amina</strong><span>Manages the trip and member roles</span></div><b>Organizer</b></li><li><span className="preview-avatar">M</span><div><strong>Maya</strong><span>Helps update the shared plan</span></div><b>Editor</b></li><li><span className="preview-avatar">L</span><div><strong>Leo</strong><span>Follows along without editing</span></div><b>Viewer</b></li></ul><p className="preview-handwritten">Same trip. Room for everyone.</p><p className="preview-footnote">Example members. Invitations and roles are managed inside your trip.</p></figure>}
    questions={[
      { question: "Can we plan a group trip for free?", answer: <p>Yes. Standard includes shared trips, organizer/editor/viewer roles, manual itinerary changes, manual bookings and packing items. AI planning covers the first 2 days.</p> },
      { question: "Does every traveler need to pay for Premium?", answer: <p>No. One $15 purchase upgrades the trip for every member, regardless of group size. Other trips keep their own plan. Applicable tax is shown before payment.</p> },
      { question: "Who can edit our itinerary?", answer: <p>The organizer decides who is an editor and who is a viewer. Editors can help update the trip. Viewers can follow the plan without editing it.</p> },
      { question: "Is location sharing always on?", answer: <p>No. Member location sharing is a Premium feature that each traveler can turn on or off. The group sees locations only for members who choose to share.</p> },
    ]}>
    <FeatureSteps title="Get the group out of the group chat." steps={[
      { title: "Create the shared trip", copy: "Choose Standard or Premium, add your destination and dates, then start building the itinerary." },
      { title: "Invite your people", copy: "Send a trip invitation. Each traveler joins with their own account; the organizer sets their role." },
      { title: "Travel from the same plan", copy: "Keep itinerary changes and booking details together. Premium adds trip chat, expense splitting and optional member locations." },
    ]} />
    <section className="feature-role-guide" aria-labelledby="roles-title"><div><p className="feature-eyebrow">Share the trip. Choose the access.</p><h2 id="roles-title">A role for every traveler.</h2><p>Member roles are included in both Standard and Premium.</p></div><dl><div><dt>Organizer</dt><dd>Manage the trip and decide who can edit or view.</dd></div><div><dt>Editor</dt><dd>Help maintain the itinerary and shared trip details.</dd></div><div><dt>Viewer</dt><dd>See the trip without changing the shared plan.</dd></div></dl></section>
  </FeaturePage>;
}
