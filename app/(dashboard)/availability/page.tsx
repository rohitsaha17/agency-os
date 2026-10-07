import { redirect } from "next/navigation";

// Team availability now lives as a tab inside People (/hr). This keeps old
// links and bookmarks working by sending them to that tab.
export default function AvailabilityRedirect() {
  redirect("/hr?tab=availability");
}
