# Destination cover selection

Country trips use an editorial list of recognizable landmarks, with verified
Commons photographs pinned for Lebanon (Raouché) and Bahrain (the Manama
waterfront with the World Trade Center and Financial Harbour). Other entries
look up the exact landmark article, including explicit Wikipedia redirects.
Countries without an editorial entry use a current capital verified through
Wikidata country codes and capital/country relationships.

Country identities accept ISO alpha-2 codes, English/French/Arabic names and
common aliases. An explicit country wins over a same-named foreign country or
famous city: Lebanon, United States must not receive a Lebanese landmark, and
Paris, United States must not fall back to the Eiffel Tower.

City searches require a matching geographic article, reject disambiguation and
unrelated titles, and verify the requested country with Wikidata when supplied.
Known city landmark fallbacks are scoped to their country.

Photos must be landscape, at least 1920 × 1080, and hosted by Wikimedia. Maps,
flags, logos, diagrams, portraits and collages are excluded. Commons must supply
a reusable license and attribution; enwiki-only/fair-use files are not accepted.
The requested image width is 2400 pixels. Concurrent requests share one lookup,
and successful lookups retain the existing shared database cache.

The `v5-iconic` image policy invalidates older saved/cached selections. Web and
mobile trip reads schedule a replacement in the background; they do not serve
the old policy's image. Enrichment preserves activity timestamps and optimistic
versions. A late result cannot overwrite a newly selected destination. No new
API keys, paid AI requests or database migrations are required.

Selected photo sources:

- https://commons.wikimedia.org/wiki/File:Beirut-Rouche_rock_view1.jpg
- https://commons.wikimedia.org/wiki/File:Manama_Bahrain_World_Trade_Centre_%26_Bahrain_Financial_Harbour_2.jpg

Checks: `npm run typecheck`; image integration/unit tests and mobile/itinerary
regressions; `npx vite build` after the existing mobile preview assets are built.
