"use client";
import { ErrorState } from "../components/ui/feedback";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[720px] px-5 py-10">
      <ErrorState message={error.message || "Something went wrong in this view."} onRetry={reset} />
    </div>
  );
}
