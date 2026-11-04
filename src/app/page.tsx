import { redirect } from "next/navigation";

// The product starts at the user's laboratories; /app sends visitors without
// a session to the sign-in page.
export default function Home() {
  redirect("/app");
}
