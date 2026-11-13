// claims.js - extract verifiable claims from a README.
// A claim is a bullet under a "## Verified Claims" (or "## Claims") heading.
// Optional per-claim override: "- Users can reset a password :: verify: go to /login, click Forgot, assert the reset form appears"
// Everything before "::" is the human claim; the verify: part is the Kane objective.
// Without an override, the claim text itself is the objective (Kane takes natural language).

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function extractClaims(markdown) {
  const lines = markdown.split(/\r?\n/);
  const claims = [];
  let inSection = false;
  let sectionLevel = 0;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim().toLowerCase();
      if (inSection && level <= sectionLevel) inSection = false;
      if (title === "verified claims" || title === "claims") {
        inSection = true;
        sectionLevel = level;
      }
      continue;
    }
    if (!inSection) continue;

    const bullet = line.match(/^\s*(?:[-*+]|\d+\.)\s+(?:\[( |x|X)\]\s+)?(.+)$/);
    if (!bullet) continue;

    const raw = bullet[2].trim();
    if (!raw) continue;

    let text = raw;
    let objective = null;
    const split = raw.split(/\s*::\s*/);
    if (split.length > 1) {
      text = split[0].trim();
      const m = split[1].match(/^verify:\s*(.+)$/i);
      objective = (m ? m[1] : split[1]).trim();
    }

    claims.push({
      id: slugify(text),
      text,
      objective: objective || text,
      declared: bullet[1] ? bullet[1].toLowerCase() === "x" : null,
    });
  }

  // de-dupe ids
  const seen = new Map();
  for (const c of claims) {
    const n = (seen.get(c.id) || 0) + 1;
    seen.set(c.id, n);
    if (n > 1) c.id = `${c.id}-${n}`;
  }
  return claims;
}

module.exports = { extractClaims, slugify };
