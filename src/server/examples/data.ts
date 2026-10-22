// Curated example trip written by the Tripanize team (not AI output, not live data). Shown read-only and labeled
// "Example"; travelers can save a copy as their own editable trip with their chosen start date.

export type ExampleStop = { title: string; category: string; startTime: string; durationMin: number; travelToNextMin?: number; address?: string; reason: string; estCost?: number; isMeal?: boolean; isFreeTime?: boolean; officialUrl?: string; plan?: "B" };
export type ExampleDay = { offset: number; title: string; area: string; destination: number; isTravelDay?: boolean; notes?: string; stops: ExampleStop[] };
export type Example = {
  slug: string; name: string; summary: string; nights: number; currency: string; budget: number; image: string;
  destinations: { name: string; country: string; fromOffset: number; toOffset: number; neighborhood: string }[];
  interests: string[]; transport: string[]; mustSee: string[]; days: ExampleDay[];
  bookings: { title: string; category: string; offset: number | null; startTime?: string; status: "IDEA" | "TO_BOOK"; whenToBook: string; estCost: number; url?: string }[];
};

export const EXAMPLES: Example[] = [
  {
    slug: "lisbon-porto",
    name: "Lisbon & Porto by train",
    summary: "Six relaxed days: tiled hills and Belém in Lisbon, then port cellars and the Douro riverside in Porto.",
    nights: 5,
    currency: "EUR",
    budget: 1800,
    image: "var(--brand-gradient)",
    destinations: [
      { name: "Lisbon", country: "Portugal", fromOffset: 0, toOffset: 3, neighborhood: "Baixa / Chiado" },
      { name: "Porto", country: "Portugal", fromOffset: 3, toOffset: 5, neighborhood: "Ribeira" },
    ],
    interests: ["History", "Food & markets", "Architecture"],
    transport: ["Walking", "Public transit", "Train"],
    mustSee: ["Jerónimos Monastery", "Livraria Lello"],
    days: [
      { offset: 0, title: "Arrive and wander Baixa", area: "Baixa & Chiado", destination: 0, notes: "Check-in is usually from 15:00; drop bags if you arrive early.", stops: [
        { title: "Praça do Comércio", category: "sight", startTime: "15:30", durationMin: 45, travelToNextMin: 10, address: "Praça do Comércio, Lisbon", reason: "Grand riverside square — an easy first stroll after arriving." },
        { title: "Rua Augusta & Santa Justa viewpoint", category: "sight", startTime: "16:25", durationMin: 60, travelToNextMin: 15, address: "Rua Augusta, Lisbon", reason: "Pedestrian street up to a classic viewpoint." },
        { title: "Dinner in Chiado", category: "food", startTime: "19:30", durationMin: 90, address: "Chiado, Lisbon", reason: "Relaxed first evening close to the hotel.", estCost: 70, isMeal: true },
      ] },
      { offset: 1, title: "Belém", area: "Belém", destination: 0, notes: "Jerónimos and Belém Tower are typically closed on Mondays — verify on the official site.", stops: [
        { title: "Jerónimos Monastery", category: "sight", startTime: "09:30", durationMin: 90, travelToNextMin: 5, address: "Praça do Império, Lisbon", reason: "Manueline masterpiece; go early to avoid queues.", estCost: 36, officialUrl: "https://www.museusemonumentos.pt" },
        { title: "Pastéis de Belém", category: "cafe", startTime: "11:05", durationMin: 30, travelToNextMin: 15, address: "R. de Belém 84-92, Lisbon", reason: "The original custard tarts.", estCost: 10, isMeal: true },
        { title: "Belém Tower (outside) & riverside walk", category: "sight", startTime: "11:50", durationMin: 60, travelToNextMin: 25, address: "Av. Brasília, Lisbon", reason: "Iconic tower; the riverside path is lovely in sun." },
        { title: "Free afternoon", category: "rest", startTime: "14:00", durationMin: 150, reason: "Rest or explore LX Factory at your own pace.", isFreeTime: true },
        { title: "MAAT", category: "museum", startTime: "11:50", durationMin: 120, address: "Av. Brasília, Lisbon", reason: "Indoor alternative if it rains.", estCost: 24, plan: "B" },
      ] },
      { offset: 2, title: "Alfama and fado", area: "Alfama", destination: 0, stops: [
        { title: "São Jorge Castle", category: "sight", startTime: "10:00", durationMin: 90, travelToNextMin: 15, address: "R. de Santa Cruz do Castelo, Lisbon", reason: "Views over the whole city.", estCost: 30 },
        { title: "Lunch in Alfama", category: "food", startTime: "12:45", durationMin: 75, address: "Alfama, Lisbon", reason: "Grilled sardines in a tasca.", estCost: 40, isMeal: true },
        { title: "Fado evening", category: "event", startTime: "20:30", durationMin: 120, address: "Alfama, Lisbon", reason: "Book a fado house a few days ahead.", estCost: 90 },
      ] },
      { offset: 3, title: "Train to Porto", area: "Lisbon → Porto", destination: 1, isTravelDay: true, notes: "Alfa Pendular from Santa Apolónia takes about 3 hours.", stops: [
        { title: "Train Lisbon → Porto", category: "transport", startTime: "10:00", durationMin: 180, travelToNextMin: 20, reason: "Comfortable intercity train.", estCost: 60 },
        { title: "Ribeira riverside", category: "sight", startTime: "15:30", durationMin: 90, address: "Cais da Ribeira, Porto", reason: "Gentle first look at Porto." },
      ] },
      { offset: 4, title: "Books, bridges and port", area: "Centro & Gaia", destination: 1, stops: [
        { title: "Livraria Lello", category: "sight", startTime: "09:30", durationMin: 45, travelToNextMin: 10, address: "R. das Carmelitas 144, Porto", reason: "Famous bookshop; timed tickets.", estCost: 20, officialUrl: "https://www.livrarialello.pt" },
        { title: "Lunch at Mercado do Bolhão", category: "food", startTime: "12:00", durationMin: 75, address: "R. Formosa, Porto", reason: "Restored market hall.", estCost: 35, isMeal: true },
        { title: "Port cellar tour in Gaia", category: "activity", startTime: "15:00", durationMin: 90, address: "Vila Nova de Gaia", reason: "Cross the Dom Luís I bridge on foot.", estCost: 40 },
      ] },
      { offset: 5, title: "Departure", area: "Porto", destination: 1, notes: "Allow about 45 minutes by metro to the airport.", stops: [
        { title: "Coffee & last stroll", category: "cafe", startTime: "09:30", durationMin: 60, reason: "Unhurried morning before leaving.", isMeal: true },
      ] },
    ],
    bookings: [
      { title: "Hotel in Lisbon (3 nights)", category: "ACCOMMODATION", offset: 0, status: "TO_BOOK", whenToBook: "2–3 months ahead for central areas", estCost: 450 },
      { title: "Hotel in Porto (2 nights)", category: "ACCOMMODATION", offset: 3, status: "TO_BOOK", whenToBook: "1–2 months ahead", estCost: 280 },
      { title: "Train Lisbon → Porto", category: "TRAIN", offset: 3, startTime: "10:00", status: "TO_BOOK", whenToBook: "Fares rise closer to the date — book 2–4 weeks ahead", estCost: 60, url: "https://www.cp.pt" },
      { title: "Fado house dinner", category: "RESTAURANT", offset: null, status: "IDEA", whenToBook: "A few days ahead", estCost: 90 },
    ],
  },
];
