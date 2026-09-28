import { ResourcePage } from "../../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content pages" };

export default function Page() {
  return (
    <ResourcePage
      resource="content-pages"
      title="Content pages"
      description="Terms, privacy, cancellation policy, refund policy, about and contact pages. Written in Markdown — use the Preview tab while editing. Have legal pages reviewed by counsel before launch."
    />
  );
}
