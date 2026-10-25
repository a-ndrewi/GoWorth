const generatedPlaceCategories = [
  "Landmarks",
  "Museums",
  "Nature",
  "Beaches",
  "Neighborhoods",
  "Food & Markets",
];

/** Removes map/provider metadata while keeping notes written by the user. */
export function publicActivityNote(note: string) {
  let value = note
    .replace(/\s*·\s*https?:\/\/\S+/gi, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\bopenstreetmap\.org\/\S+/gi, "")
    .replace(/\bOpenStreetMap(?:\s+contributors)?\b/gi, "")
    .replace(/\bWikipedia(?:\s+article)?\b/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*km\s+away\b/gi, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
  const categoryPattern = generatedPlaceCategories.join("|");
  value = value.replace(new RegExp(`^\\s*(?:${categoryPattern})\\s*·\\s*`, "i"), "").trim();
  if (new RegExp(`^(?:${categoryPattern})$`, "i").test(value)) return "";
  return value;
}

export function publicPlaceCategory(category: string) {
  const value = category
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\bopenstreetmap\.org\/\S+/gi, "")
    .replace(/\bOpenStreetMap(?:\s+contributors)?\b/gi, "")
    .replace(/\bWikipedia(?:\s+article)?\b/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*km\s+away\b/gi, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
  return value || "Place";
}
