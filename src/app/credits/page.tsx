import { redirect } from "next/navigation";

/** Old address: credits live in Account › Credits. */
export default function CreditsRedirect() { redirect("/account/credits"); }
