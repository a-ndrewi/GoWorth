export type TipStage = "Before you go" | "While you're there";
export type TipIcon = "calendar" | "bus" | "wallet" | "book" | "sun" | "map" | "food" | "mountain" | "beach" | "city" | "check";

export type DestinationTip = {
  id: string;
  stage: TipStage;
  title: string;
  detail: string;
  icon: TipIcon;
};

type DestinationContext = {
  id: string;
  name: string;
  country: string;
  region: string;
  tags: readonly string[];
};

const overrides: Record<string, DestinationTip[]> = {
  positano: [
    { id: "reserve-coastline", stage: "Before you go", title: "Reserve the coastline early", detail: "Beach clubs, ferries and the Path of the Gods can fill quickly in high season. Save the places you care about before building each day.", icon: "calendar" },
    { id: "walk-positano", stage: "While you're there", title: "Plan for hills and stairs", detail: "Group places by area and leave time between stops. Comfortable shoes will make the steep lanes much easier.", icon: "mountain" },
    { id: "boat-buffer", stage: "While you're there", title: "Keep a ferry buffer", detail: "Coastal transport is beautiful but weather-sensitive. Keep one flexible block in your itinerary in case a boat is delayed.", icon: "bus" },
    { id: "local-hours-positano", stage: "Before you go", title: "Check seasonal hours", detail: "Restaurants, beach access and buses can change schedules outside summer. Confirm the official hours shortly before you leave.", icon: "sun" },
  ],
  santorini: [
    { id: "sunset-santorini", stage: "Before you go", title: "Choose one sunset base", detail: "Oia and the caldera viewpoints get crowded at sunset. Pick a viewpoint and build the rest of the evening around it.", icon: "sun" },
    { id: "island-transfer", stage: "Before you go", title: "Leave room for transfers", detail: "Ferries and island buses need extra buffer in the high season. Avoid stacking a boat arrival directly against a timed visit.", icon: "bus" },
    { id: "volcanic-shoes", stage: "While you're there", title: "Pack for volcanic paths", detail: "The caldera trails and Red Beach approach are uneven. Trainers and water are more useful than a second pair of dress shoes.", icon: "mountain" },
    { id: "water-santorini", stage: "While you're there", title: "Carry water between stops", detail: "The sun reflects strongly off the island's pale surfaces. Keep a bottle with you when walking between villages and viewpoints.", icon: "beach" },
  ],
  kyoto: [
    { id: "early-kyoto", stage: "Before you go", title: "Start early at the icons", detail: "Fushimi Inari and Arashiyama are calmer in the first hours of the day. Put one early start into your plan instead of rushing both.", icon: "sun" },
    { id: "neighborhood-kyoto", stage: "While you're there", title: "Explore by neighborhood", detail: "Kyoto rewards slow days. Group temples, gardens and food stops into one area to spend less time crossing the city.", icon: "map" },
    { id: "temple-etiquette", stage: "While you're there", title: "Keep temple visits respectful", detail: "Follow signs about photography, quiet areas and footwear. A little extra attention makes cultural sites more welcoming for everyone.", icon: "book" },
    { id: "cash-kyoto", stage: "Before you go", title: "Keep a payment backup", detail: "Small food stalls and local buses may prefer cash. Carry a little yen even if your main card works in larger venues.", icon: "wallet" },
  ],
  bali: [
    { id: "traffic-bali", stage: "Before you go", title: "Add traffic time", detail: "Distances on the island can look short on a map. Group nearby places and leave a generous buffer for road traffic.", icon: "bus" },
    { id: "temple-clothing-bali", stage: "Before you go", title: "Pack a temple layer", detail: "Many temples expect covered shoulders and legs. A light layer or sarong keeps spontaneous visits easy.", icon: "book" },
    { id: "water-bali", stage: "While you're there", title: "Protect your water time", detail: "Heat and humidity add up quickly. Plan a slower midday block and keep water with you on rice terrace and temple days.", icon: "sun" },
    { id: "cash-bali", stage: "While you're there", title: "Keep small cash nearby", detail: "Local warungs, parking and smaller entrances may be cash-first. Keep a modest amount separate from your main wallet.", icon: "wallet" },
  ],
  iceland: [
    { id: "weather-iceland", stage: "Before you go", title: "Build around the weather", detail: "Conditions can change quickly. Keep your most weather-sensitive stop flexible and check road information before setting out.", icon: "sun" },
    { id: "driving-iceland", stage: "Before you go", title: "Do not underestimate drives", detail: "A scenic route can take much longer than the map suggests. Plan fewer stops per day and keep fuel and food ahead of remote stretches.", icon: "bus" },
    { id: "layers-iceland", stage: "While you're there", title: "Use layers and waterproof shoes", detail: "Wind, spray and uneven ground are common around waterfalls and lagoons. Comfortable waterproof layers keep the day enjoyable.", icon: "mountain" },
    { id: "light-iceland", stage: "While you're there", title: "Use the light, not the clock", detail: "Daylight changes dramatically by season. Let sunrise and sunset shape your photo stops instead of forcing the same schedule year-round.", icon: "sun" },
  ],
};

function generatedTips(destination: DestinationContext): DestinationTip[] {
  const isNature = destination.tags.includes("Nature") || destination.tags.includes("Mountains") || destination.tags.includes("Beach");
  const isCity = destination.tags.includes("City");
  const isCulture = destination.tags.includes("Culture");
  const transportDetail = isCity
    ? `Group ${destination.name}'s places by neighborhood so you spend more time exploring and less time crossing the city.`
    : `Check the distance between ${destination.name}'s places before filling a day. Scenic routes often take longer than they look on a map.`;
  const respectDetail = isCulture
    ? `Check access rules, dress expectations and photography guidance before visiting ${destination.name}'s cultural sites.`
    : `Leave space for local rhythms in ${destination.name}: opening hours, weather and seasonal access can change the best order of your day.`;
  const natureDetail = isNature
    ? `Carry water, sun protection and shoes for uneven ground when moving between ${destination.name}'s outdoor places.`
    : `Keep a small buffer for transport, meals and an unplanned stop. The best parts of ${destination.name} may not be on your first list.`;
  return [
    { id: `${destination.id}-book-ahead`, stage: "Before you go", title: "Save the places that matter", detail: `Start with a short list of places in ${destination.name}, then check official hours and reservation rules before planning each day.`, icon: "calendar" },
    { id: `${destination.id}-move-smart`, stage: "While you're there", title: isCity ? "Move by neighborhood" : "Leave room between stops", detail: transportDetail, icon: isCity ? "city" : "map" },
    { id: `${destination.id}-local-rules`, stage: "Before you go", title: "Check local access rules", detail: respectDetail, icon: isCulture ? "book" : "check" },
    { id: `${destination.id}-comfort`, stage: "While you're there", title: "Pack for the day you planned", detail: natureDetail, icon: isNature ? "sun" : "wallet" },
  ];
}

export function tipsForDestination(destination: DestinationContext): DestinationTip[] {
  return overrides[destination.id] || generatedTips(destination);
}
