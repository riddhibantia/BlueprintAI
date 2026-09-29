import { LoadingState } from "../components/ui/feedback";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[960px] px-5 py-10">
      <LoadingState stage="Loading workspace" />
    </div>
  );
}
