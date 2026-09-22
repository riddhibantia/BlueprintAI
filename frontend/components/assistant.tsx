"use client";
import { usePathname } from "next/navigation";

/** Contextual assistant hints per module (§29.4) — a side tool, never the primary surface. */
const HINTS: [RegExp, string[]][] = [
  [/dashboard/, ["Create a project from a one-line product idea.", "Open a project to run the blueprint pipeline."]],
  [/requirements/, ['Ask: "Which APIs implement REQ-001?"', "Approve requirements before generating the PRD — approved state is the source of truth."]],
  [/prd/, ["The PRD stays editable — revise goals and constraints, then approve.", "Every claim should trace back to an approved requirement."]],
  [/stories/, ['Ask: "Which stories lack acceptance criteria?"', "Stories link back to their source requirement."]],
  [/architecture/, ['Ask: "Which requirements are not represented here?"', "Click a component to see linked requirements and APIs."]],
  [/database/, ['Ask: "Which API writes to this entity?"', "PK/FK badges mark keys; references show the target."]],
  [/apis/, ['Ask: "Which endpoints lack auth?"', "Export the set as OpenAPI from the Overview page."]],
  [/security/, ['Ask: "Which APIs does SEC-002 protect?"', "Controls stay traceable to endpoints."]],
  [/tasks/, ['Ask: "Which tasks are affected by REQ-003?"', "Advance status as work completes — coverage is computed, not claimed."]],
  [/tests/, ['Ask: "Which requirements have no test?"', "Every major requirement needs a linked validation artifact."]],
  [/traceability/, ['Ask: "Which tests validate REQ-002?"', "Orphaned requirements have no downstream links — link or drop them."]],
  [/consistency/, ['Ask: "Which requirements are not represented in the API?"', "Resolve conflicts, then re-run the check."]],
  [/knowledge/, ["Upload architecture/API/security standards — generations cite them as evidence.", "Empty evidence? The app says so instead of guessing."]],
];

export default function AssistantPanel() {
  const path = usePathname() || "";
  const hints = (HINTS.find(([re]) => re.test(path))?.[1]) ?? [
    "Describe a product idea to start the pipeline.",
    "Every stage has a human approval checkpoint.",
  ];
  return (
    <>
      <h4>AI Assistant</h4>
      <p>Contextual helper for <code>{path || "/"}</code>. Structured artifacts on the left stay authoritative.</p>
      <ul>
        {hints.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
    </>
  );
}
