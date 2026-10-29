import { FeaturePage, FeatureSteps } from "@/components/feature-page";
import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = publicMetadata("/travel-expense-splitter", PUBLIC_PAGES["/travel-expense-splitter"]);

export default function TravelExpenseSplitterPage() {
  return <FeaturePage path="/travel-expense-splitter" eyebrow="Enjoy the trip. Keep the numbers clear." title="Expense splitter." emphasis="Fair from the first payment."
    intro="Record who paid, split the cost and see who owes whom. Keep receipts with each payment and actual spending separate from estimates."
    planNote="Expenses and settlements are Premium: $15 per trip for the whole group."
    preview={<figure className="feature-preview expense-preview"><figcaption><span className="feature-eyebrow">Illustrative expenses · EUR</span><strong>A clear view of the budget.</strong><span>3 travelers · equal shares</span></figcaption><dl className="preview-budget"><div><dt>Trip budget</dt><dd>€3,000</dd></div><div><dt>Actually spent</dt><dd>€480</dd></div><div><dt>Remaining</dt><dd>€2,520</dd></div></dl><ul className="preview-payments"><li><span>Stay <small>Amina paid</small></span><strong>€300</strong></li><li><span>Train <small>Leo paid</small></span><strong>€90</strong></li><li><span>Dinner <small>Maya paid</small></span><strong>€90</strong></li></ul><div className="preview-settlements"><p>Who owes whom</p><div>Leo <span aria-hidden="true">→</span> Amina <strong>€70</strong></div><div>Maya <span aria-hidden="true">→</span> Amina <strong>€70</strong></div></div><p className="preview-footnote">Example amounts. Repayments are recorded after you pay outside Tripanize.</p></figure>}
    questions={[
      { question: "Is expense splitting included in the free plan?", answer: <p>No. Expenses, receipts and settlements are Premium features. One $15 payment unlocks Premium for the whole trip and every traveler. You can upgrade a Standard trip at any time.</p> },
      { question: "Can we split costs unequally?", answer: <p>Yes. Split equally, by percentage, by specific amounts, or assign a payment to one traveler. Select the people included in each expense.</p> },
      { question: "Do planned costs reduce the remaining budget?", answer: <p>No. Estimates and actual spending stay separate. The remaining budget deducts recorded actual expenses. Other currencies count towards that budget when you add a conversion into the trip currency.</p> },
      { question: "Can I attach a receipt to a payment?", answer: <p>Yes. Take a photo on a supported device, attach an image or upload a PDF while adding an expense. AI receipt scanning can suggest details for you to review.</p> },
      { question: "Does Tripanize transfer money between travelers?", answer: <p>No. Tripanize shows suggested repayments and records the repayments you mark as paid. Travelers settle outside the application.</p> },
    ]}>
    <FeatureSteps title="From “I'll get this” to settled up." steps={[
      { title: "Record the payment", copy: "Add the amount, currency and payer. Attach the receipt to that expense so it stays easy to find." },
      { title: "Choose the split", copy: "Include the right travelers and choose equal shares, percentages or specific amounts." },
      { title: "See the balance", copy: "Check who owes whom, then record repayments once paid. The budget shows what remains from actual spending." },
    ]} />
    <section className="feature-detail"><div><p className="feature-eyebrow">Plan ahead. Know what you spent.</p><h2>Estimates and expenses have their own place.</h2></div><div><p>Suggested activity costs and booking estimates help you plan. Recorded expenses tell you what the trip actually costs. Adding a payment never adds it to the AI estimate.</p><p>Track expenses in their original currency. Add a conversion when you want a foreign-currency payment reflected in the overall trip budget.</p></div></section>
  </FeaturePage>;
}
