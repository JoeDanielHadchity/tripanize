/** While a trip section loads, the banner and tabs stay put and the page shows calm placeholders. */
export default function TripSectionLoading() {
  return (
    <div className="section-skeleton" role="status" aria-label="Loading">
      <span className="h-9 w-56" />
      <span className="h-4 w-80 max-w-full" />
      <span className="h-36 w-full" />
      <span className="h-28 w-full" />
      <span className="h-28 w-full" />
    </div>
  );
}
