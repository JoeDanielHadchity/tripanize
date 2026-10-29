import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Card, Eyebrow, Heading, Muted, Screen, T } from "../../components/ui";
import { NativePublicHeader, CreateTripButton } from "../../components/public-header";

const FEATURES = {
  "ai-trip-planner": { title: "Trip Planner.", emphasis: "Your kind of trip.", intro: "Turn your dates, interests and travel pace into an editable day-by-day itinerary.", note: "Free: the first 2 AI-planned days. Premium: all trip days.", steps: [["Tell us about your trip", "Add your destination, dates, budget, food preferences and travel pace."], ["Get your itinerary", "Find suggested stops and time to explore. Premium adds event suggestions and customized packing."], ["Make it yours", "Open one day at a time. Edit manually, or review updates from your Premium assistant."]] },
  "group-trip-planner": { title: "Group Travel.", emphasis: "Everyone on the same page.", intro: "Bring the itinerary, bookings and people together in one shared trip.", note: "Member roles are included in both plans. Premium covers every traveler for one $15 payment.", steps: [["Create the shared trip", "Choose your destination and dates, then start building your itinerary."], ["Invite your people", "The organizer chooses editors who can help update the trip, and viewers who can see the plan."], ["Stay connected", "Vote on ideas and keep bookings together. Premium adds group chat, expenses and optional member locations."]] },
  "travel-expense-splitter": { title: "Expense splitter.", emphasis: "Fair from the first payment.", intro: "Record who paid, split the cost and see who owes whom.", note: "Expenses, receipts and settlements are Premium features.", steps: [["Record the payment", "Add the amount, currency and payer. Take a receipt photo or attach an image or PDF."], ["Choose the split", "Split equally, by percentage, by specific amounts or to one traveler."], ["See the balance", "Actual payments reduce the remaining budget; estimates stay separate. Record repayments after paying outside Tripanize."]] },
} as const;

export default function FeatureScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const feature = Object.hasOwn(FEATURES, slug) ? FEATURES[slug as keyof typeof FEATURES] : null;
  return <Screen header={<NativePublicHeader active={slug} />}>{!feature ? <Heading>Page not found.</Heading> : <><Eyebrow>{feature.title}</Eyebrow><Heading>{feature.emphasis}</Heading><T>{feature.intro}</T><Muted>{feature.note}</Muted><CreateTripButton />
    <View style={{ gap: 16 }}>{feature.steps.map(([title, text], i) => <Card key={title}><Eyebrow>0{i + 1}</Eyebrow><Heading small>{title}</Heading><Muted>{text}</Muted></Card>)}</View>
  </>}</Screen>;
}
