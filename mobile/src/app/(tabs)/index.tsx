import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Brand, Heading, Eyebrow, Icon, Muted, Screen, T, styles } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { photo } from "../../lib/auth";

export default function StartScreen() {
  const c = useTheme();
  return <Screen><Brand /><View style={{ gap: 10, marginTop: 20 }}><Eyebrow>Your next chapter</Eyebrow><Heading>Where do you{"\n"}want to go?</Heading></View>
    {[{ title: "I have a destination", subtitle: "Open my trips", image: "/editorial/start-mont-saint-michel.webp", alt: "Mont Saint-Michel at sunset", href: "/trips" as const },
      { title: "Help me choose", subtitle: "Explore destination ideas", image: "/editorial/start-amalfi-coast.webp", alt: "Positano on the Amalfi Coast", href: "/destinations" as const }].map(choice =>
      <Pressable key={choice.href} accessibilityRole="button" accessibilityLabel={choice.title} onPress={() => router.push(choice.href)} style={({ pressed }) => ({ backgroundColor: c.paper, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.85 : 1 })}>
        <Image source={photo(choice.image)} accessibilityLabel={choice.alt} style={{ width: "100%", height: 174 }} contentFit="cover" transition={180} />
        <View style={[styles.row, { padding: 19 }]}><View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: "Fraunces", fontSize: 25, lineHeight: 31 }}>{choice.title}</T><Muted>{choice.subtitle}</Muted></View><Icon name="arrow-forward" /></View>
      </Pressable>)}
  </Screen>;
}
