# Restaurant research and diversity

The planner aims for two real choices per meal, six different venues per day.
Every alternative reserves its venue across the entire trip. Names are normalized
for case, accents, punctuation, meal prefixes, common restaurant/café labels and
branch suffixes; canonical official URLs also identify aliases. Guide/source URLs
are evidence, never a venue identity (one guide may list many restaurants).

Food answers, explicit dietary constraints, meal budget, children, accommodation
and the route are supplied to both planning and focused restaurant research.
Prompts require a broad candidate pool and comparison across at least three
independent restaurant-related websites. Returned source links must occur in the
provider's observed search sources. Publisher subdomains count as one website.
This validates provenance, not restaurant quality, opening hours or allergen safety.

Missing or repeated choices trigger up to two focused research passes per five-day
section. Existing valid choices are kept. New candidates must pass the trip-wide
registry before being accepted. If research still cannot fill a slot, the gap is
reported; venues and URLs are never invented to fill a quota. Insufficient
multi-site evidence is reported as a question for the traveler. These extra calls
use the existing per-trip AI usage ledger and provider. Nested SDK retries are
disabled for durable planning/research calls to bound each alarm's runtime.

Unchanged days, protected dining commitments and completed durable checkpoints
seed the exclusion list. Validation runs during generation and again against the
current data inside the apply transaction. Swap suggestions and assistant edits
also reject new repetitions. Existing recommendation reads, mobile payloads and
exports suppress legacy duplicate options. Manual or confirmed bookings remain
under traveler control.

## Repair an existing trip

Editors on a Premium trip can choose **Refresh restaurants** in the itinerary
(web or the server-driven mobile workspace). It researches food only, preserving
manual activities, bookings, fixed commitments and other trip features. Flexible
AI dining stops are aligned with the new recommendations. Unverified cost and
travel estimates for those changed dining stops are cleared.

The job checkpoints researched sections before continuing. Nothing is applied
until the whole refresh finishes. A hash of the trip and itinerary is rechecked
inside the final transaction; concurrent edits cause the refresh to stop instead
of overwriting them. A snapshot supports undo through Versions / History & undo.
Failed or cancelled refreshes leave the saved trip unchanged.

Regression coverage includes a nine-day / 54-choice trip across a durable restart,
unchanged-day exclusions, stale draft application, source rejection, bounded
shortlists, manual preservation, concurrent edits and restoration from history.
