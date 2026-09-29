import Link from "next/link";
import { EmptyState } from "../components/ui/feedback";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-5 py-10">
      <EmptyState title="Page not found" hint="The workspace view you asked for does not exist." />
      <p className="mt-4">
        <Link href="/dashboard" className="text-[13.5px] font-semibold text-accent hover:underline">
          Back to dashboard →
        </Link>
      </p>
    </div>
  );
}
