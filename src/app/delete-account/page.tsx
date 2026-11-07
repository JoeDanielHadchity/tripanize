import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";
import Link from "next/link";
import { PolicyPage, PolicySection as Section } from "@/components/public-page";

export const metadata = publicMetadata("/delete-account", PUBLIC_PAGES["/delete-account"]);
export default function DeleteAccountPage() {
  return <PolicyPage title="Delete your Tripanize account" intro="How to permanently delete your Tripanize.app account and what happens to your information.">
    <Section title="Delete it yourself in the Android app"><ol className="list-decimal space-y-1 pl-5"><li>Sign out, then sign in again with an email code.</li><li>Open <strong className="text-ink">Account</strong> and scroll to <strong className="text-ink">Delete account</strong>.</li><li>Transfer or delete any trip you organize first.</li><li>Enter your email and type DELETE, then confirm. You must do this within 10 minutes of signing in.</li></ol></Section>
    <Section title="Or ask us to delete it"><p>If you can no longer sign in, use the <Link href="/contact?topic=privacy">contact form</Link>, choose “Privacy or account request” and write “Delete my account” from the email address of your account. We may verify that the request comes from you, and we normally complete it within 30 days. Do not send a password or identity document through the form.</p></Section>
    <Section title="What is deleted"><p>Your account, name, email address, sign-in sessions and password information, private lists and saved destination searches are deleted. Shared live locations expire automatically.</p></Section>
    <Section title="What is kept"><p>Shared trips belong to their whole group, so your past contributions to trips organized by others, such as chat messages, shared expenses and itinerary changes, remain under the name “Former traveler” without your email address. Payment, fraud, security and legal records may be kept as long as the law requires. See the <Link href="/privacy">privacy policy</Link> for details.</p></Section>
  </PolicyPage>;
}
