import { redirect } from "next/navigation";

export default function LegacyLogsPage() {
  redirect("/monitor/error-tracking");
}
