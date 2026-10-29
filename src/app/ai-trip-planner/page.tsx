import Link from "next/link";
import { FeaturePage, FeatureSteps } from "@/components/feature-page";
import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = publicMetadata("/ai-trip-planner", PUBLIC_PAGES["/ai-trip-planner"]);

export default function AiTripPlannerPage() {
  return <FeaturePage path="/ai-trip-planner" eyebrow="A little direction. A lot of possibility." title="Trip Planner." emphasis="Your kind of trip."
    intro="Turn your dates, interests and travel pace into an editable day-by-day itinerary. Keep the ideas you like. Make the rest your own."
    planNote="Free: your first 2 AI-planned days. Premium: AI planning for all trip days."
    preview={<figure className="feature-preview itinerary-preview"><figcaption><span className="feature-eyebrow">Illustrative itinerary</span><strong>Lisbon & Porto</strong><span>6 days · 3 travelers</span></figcaption><div className="preview-day-strip" aria-label="Example day selection"><span>Day 1</span><strong>Day 2 · Lisbon</strong><span>Day 3</span></div><p className="preview-handwritten">A morning in Belém</p><ol className="preview-stops"><li><time>09:30</time><div><strong>Jerónimos Monastery</strong><span>Architecture & a slow start</span></div></li><li><time>11:05</time><div><strong>Pastéis de Belém</strong><span>Coffee and a custard tart</span></div></li><li><time>11:50</time><div><strong>A riverside walk</strong><span>Leave a little room to wander</span></div></li></ol><p className="preview-footnote">A sample from our <Link href="/examples/lisbon-porto">Lisbon & Porto example</Link>. Times are illustrative.</p></figure>}
    questions={[
      { question: "Is the trip planner free?", answer: <p>Standard includes AI planning for the first 2 days of each trip. You can add and edit every other day manually. Premium unlocks AI planning for all trip days for $15 per trip, with all travelers included.</p> },
      { question: "Can I change the itinerary afterwards?", answer: <p>Yes. Both plans let you edit your itinerary manually. Premium adds AI day regeneration, stop alternatives and an assistant for reviewing and applying proposed changes.</p> },
      { question: "Does Tripanize book tickets or restaurants for me?", answer: <p>No. Suggested activities and booking links help you plan. You complete reservations with the provider, then keep the details in your trip.</p> },
      { question: "What if I haven't chosen a destination?", answer: <p>After signing in, choose “Let me help you choose”. Answer the travel questions to explore destination ideas before creating your trip.</p> },
    ]}>
    <FeatureSteps title="From a blank calendar to a plan." steps={[
      { title: "Tell us about your trip", copy: "Add your destination, dates, budget and travel preferences. Premium asks more about the way you like to travel." },
      { title: "Get your itinerary", copy: "See your days with suggested stops and time to explore. Premium adds linked event suggestions and customized packing." },
      { title: "Make it yours", copy: "Open one day at a time, adjust the plan and invite the people coming with you." },
    ]} />
    <section className="feature-detail"><div><p className="feature-eyebrow">More than a list of places</p><h2>Your preferences belong in the plan.</h2></div><div><p>Premium planning considers your food preferences, travel pace and interests. Get restaurant choices for each meal, event suggestions and packing ideas tailored to your trip.</p><p>Your itinerary stays connected to your bookings and <Link href="/group-trip-planner">shared group plan</Link>. Track actual costs separately with the <Link href="/travel-expense-splitter">Premium expense tools</Link>.</p></div></section>
  </FeaturePage>;
}
