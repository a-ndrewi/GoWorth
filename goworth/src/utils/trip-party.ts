export const tripParties = ["Solo", "Duo", "Group"] as const;
export type TripParty = (typeof tripParties)[number];

/**
 * Who a trip is for. Once companions have joined, the head count decides (two is a Duo, three or more a Group),
 * so the label follows people joining and leaving; alone, the trip keeps the party chosen when it was created.
 * Trips made before Duo and Group existed stored Couple, Friends or Family.
 */
export function tripParty(stored: string, travellers = 1): TripParty {
  if (travellers >= 3) return "Group";
  if (travellers === 2) return "Duo";
  if (stored === "Duo" || stored === "Couple") return "Duo";
  if (stored === "Group" || stored === "Friends" || stored === "Family") return "Group";
  return "Solo";
}
