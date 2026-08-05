import { redirect } from "next/navigation";

/** There is no dashboard in v1 — the projects list is the home screen. */
export default function RootPage() {
  redirect("/projects");
}
