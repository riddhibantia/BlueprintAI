/**
 * Clipboard helper.
 *
 * `navigator.clipboard.writeText` rejects when the document is not focused, the
 * page is not served over a secure origin, or the browser withholds the
 * permission — which happens in Firefox and in embedded webviews, not just in
 * tests. Five call sites used to fire it as a floating promise and then show
 * "Copied!" unconditionally, so a blocked write reported success while the
 * clipboard stayed empty.
 *
 * Returns true only when the text actually reached the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  // Legacy fallback: a hidden textarea + execCommand. Deprecated, but it is the
  // only route left in non-secure contexts.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
