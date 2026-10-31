import { View } from "react-native";
import { router } from "expo-router";
import { Heading, Eyebrow, Icon, IconButton, OnPhoto, PhotoCard, Screen } from "../components/ui";
import { photo } from "../lib/auth";

export default function DestinationChoicesScreen() {
  return <Screen><IconButton name="close" label="Close" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} /><View style={{ gap: 10 }}><Eyebrow>Your next chapter</Eyebrow><Heading>Where do you{"\n"}want to go?</Heading></View>
    {[{ title: "I have a destination", subtitle: "Open my trips", image: "/editorial/start-mont-saint-michel.webp", alt: "Mont Saint-Michel at sunset", href: "/trips" as const },
      { title: "Help me choose", subtitle: "Explore destination ideas", image: "/editorial/start-amalfi-coast.webp", alt: "Positano on the Amalfi Coast", href: "/destinations" as const }].map(choice =>
      <PhotoCard key={choice.href} source={photo(choice.image)} height={230} label={choice.title} onPress={() => router.push(choice.href)}>
        <OnPhoto size="title">{choice.title}</OnPhoto><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><OnPhoto>{choice.subtitle}</OnPhoto><Icon name="arrow-forward" size={16} color="#fff" /></View>
      </PhotoCard>)}
  </Screen>;
}
