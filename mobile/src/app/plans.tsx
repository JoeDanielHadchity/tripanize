import { View } from "react-native";
import { NativePublicHeader, CreateTripButton } from "../components/public-header";
import { Card, Eyebrow, Heading, Icon, Muted, Screen, T, styles } from "../components/ui";
import { useTheme } from "../components/theme";
import { PREMIUM_PRICE_MINOR, premiumPrice } from "../../../src/lib/plans";

export default function PlansScreen() {
  const c = useTheme();
  return <Screen header={<NativePublicHeader active="plans" />}><Eyebrow>Choose your plan</Eyebrow><Heading>Your trip,{"\n"}thoughtfully organized.</Heading><Muted>A full itinerary, places you’ll enjoy, and shared tools to keep your group together.</Muted>
    <Card style={{ backgroundColor: c.soft, borderColor: c.accent }}><View style={styles.row}><Heading small>Premium pass</Heading><Icon name="star" /></View><T style={{ fontFamily: "Fraunces", fontSize: 48, lineHeight: 60 }}>{premiumPrice(PREMIUM_PRICE_MINOR)} <T style={{ fontSize: 14 }}>USD / trip</T></T><T>One payment for the whole group.</T><Muted>Any group size. No subscription.</Muted><CreateTripButton /><Muted>New purchases in the app are not enabled yet. Existing Premium trips, trial invitations and company access work.</Muted></Card>
    <Heading small>Help for every part of the trip.</Heading>
    {[
      ["Plan it", "Your days, sorted.", "AI planning for every trip day", "An assistant to adjust the plan", "Review proposed changes before applying them."],
      ["Explore it", "Find your kind of places.", "Two restaurant options per meal", "Events with linked booking suggestions", "Recommendations follow your interests and food preferences. Reserve with the provider."],
      ["Enjoy it together", "Prepared and connected.", "Packing tailored to your trip", "Group chat and optional locations", "Weather, season, preferences and activities shape your packing list."],
      ["Keep it clear", "Shared costs, made clear.", "Track spending and who owes whom", "Attach receipts and scan the details", "Actual expenses stay separate from projections. Review scanned details before saving."],
    ].map(([eyebrow, title, first, second, note]) => <Card key={title}><Eyebrow>{eyebrow}</Eyebrow><Heading small>{title}</Heading>{[first, second].map(text => <View key={text} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}><Icon name="checkmark" size={18} /><T style={{ flex: 1 }}>{text}</T></View>)}<Muted>{note}</Muted></Card>)}
    <Card><Eyebrow>Standard · Free</Eyebrow><Heading small>A good place to start.</Heading>{["AI itinerary for the first 2 days", "Manual itinerary edits for all days", "Manual bookings and packing items", "Organizer, editors and viewers", "Group voting and booking reminders"].map(text => <T key={text}>✓ {text}</T>)}<Muted>Upgrade this trip anytime when purchases are available.</Muted><CreateTripButton secondary /></Card>
    <Muted>AI usage limits apply. Applicable taxes are shown before payment.</Muted>
  </Screen>;
}
