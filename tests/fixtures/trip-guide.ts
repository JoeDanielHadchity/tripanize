import type { TripGuide } from "../../src/server/export/pdf";

/** Representative travel content for visual QA; no account or production data. */
export function tripGuideFixture(): TripGuide {
  return {
    name: "Trip to New York",
    dates: "13 - 29 Nov 2026",
    destinations: "New York City / Hudson Valley",
    singleDay: false,
    exportedAt: new Date("2026-10-22T12:00:00Z"),
    days: [{
      number: 1, date: "Fri 13 Nov", title: "Hello, New York", subtitle: "Manhattan / Midtown", labels: ["Travel day", "Plan A"],
      stops: [
        { title: "Arrive and settle into the city", time: "14:00", tag: "Booked", details: "1 h 30 min / Next: ~30 min transit", address: "John F. Kennedy International Airport, Queens, NY", notes: ["Allow extra time for immigration and luggage. Keep the afternoon flexible if your flight is delayed."], links: [{ label: "Directions", url: "https://www.google.com/maps/dir/?api=1&destination=JFK" }] },
        { title: "Check in and take a breather", time: "16:00", tag: "Fixed", details: "1 h / Est. €0.00", address: "Midtown Manhattan, New York, NY", notes: ["Leave your bags, recharge and grab a coffee before heading out."], links: [] },
        { title: "A first walk through Bryant Park", time: "17:15", tag: "Suggestion", details: "45 min / Est. €0.00 / Next: ~10 min walk", address: "Bryant Park, between Fifth and Sixth Avenues", notes: ["If it rains, take a look inside the nearby library instead."], links: [{ label: "Directions", url: "https://www.google.com/maps/dir/?api=1&destination=Bryant+Park" }, { label: "Official website", url: "https://bryantpark.org" }] },
        { title: "An easy neighborhood dinner", time: "18:15", details: "1 h 15 min / Est. €35.00", address: "Midtown Manhattan", notes: ["Choose somewhere close to the hotel and call it an early night."], links: [] },
      ],
      notes: "Keep today light after the flight. All times are local, and the first afternoon is intentionally flexible.", questions: ["Does the hotel offer early check-in?"],
    }, {
      number: 2, date: "Sat 14 Nov", title: "Park landscapes and world-class art", subtitle: "New York City / Central Park & the Upper East Side", labels: ["Plan A"],
      stops: [
        { title: "Breakfast near Central Park", time: "09:00", details: "45 min / Est. €18.00 / Next: ~10 min walk", address: "Columbus Circle, New York, NY", notes: [], links: [{ label: "Directions", url: "https://www.google.com/maps/dir/?api=1&destination=Columbus+Circle" }] },
        { title: "Central Park: the Mall and Bethesda Terrace", time: "09:55", tag: "Suggestion", details: "1 h 50 min / Free / Next: ~20 min walk", address: "Bethesda Terrace, Central Park, New York, NY", notes: ["Paths are open daily. Wrap up warm and allow time for photographs."], links: [{ label: "Directions", url: "https://www.google.com/maps/dir/?api=1&destination=Bethesda+Terrace" }, { label: "Official website", url: "https://www.centralparknyc.org" }] },
        { title: "A relaxed Upper East Side lunch", time: "12:05", details: "1 h / Est. €28.00 / Next: ~15 min walk", address: "Madison Avenue, Upper East Side", notes: [], links: [] },
        { title: "The Metropolitan Museum of Art", time: "13:20", tag: "Booked", details: "3 h 30 min / Est. €30.00 / Next: ~15 min walk", address: "1000 Fifth Avenue, New York, NY 10028", notes: ["Confirm opening hours and your entry slot before travelling. Choose a few galleries rather than rushing the entire collection."], links: [{ label: "Directions", url: "https://www.google.com/maps/dir/?api=1&destination=Metropolitan+Museum" }, { label: "Official website", url: "https://www.metmuseum.org" }] },
        { title: "An unhurried neighborhood dinner", time: "17:05", details: "1 h 15 min / Est. €40.00", address: "Upper East Side, Manhattan", notes: [], links: [] },
      ],
      notes: "Start outdoors while the light is good, then save the afternoon for the museum. **Wet-weather option:** shorten the park walk and spend more time indoors. Check the [museum website](https://www.metmuseum.org) for current hours.", questions: [],
    }, {
      number: 3, date: "Sun 15 Nov", title: "A little room for discovery", subtitle: "New York City / Downtown", labels: ["Plan B"], stops: [], notes: "An open day for cafés, independent shops and anything you discovered along the way.", questions: [],
    }],
    bookings: [{ title: "The Metropolitan Museum of Art", when: "Sat 14 Nov / 13:20", status: "booked", address: "1000 Fifth Avenue, New York, NY 10028", url: "https://www.metmuseum.org" }, { title: "Midtown hotel", when: "Fri 13 Nov / 16:00", status: "paid", address: "Midtown Manhattan, New York", url: "https://example.com/reservation" }],
  };
}
