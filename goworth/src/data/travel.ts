import { photos } from "@/constants/design";
import { destinationCatalog } from "@/data/catalog";
export { places, placesForDestination, placeMapUrl, type Place, type PlaceCategory } from "@/data/catalog";
export { tripDays, validateTrip } from "@/utils/trip";
export type { DestinationId } from "@/data/catalog";

const destinationPhotos = {
  positano: photos.positano,
  santorini: photos.santorini,
  bali: photos.bali,
  kyoto: photos.kyoto,
  iceland: photos.iceland,
  alps: photos.alps,
  paris: photos.paris,
  rome: photos.rome,
  tokyo: photos.tokyo,
  lisbon: photos.lisbon,
  "new-york": photos.newYork,
  barcelona: photos.barcelona,
  london: photos.london,
  amsterdam: photos.amsterdam,
  istanbul: photos.istanbul,
  dubai: photos.dubai,
  singapore: photos.singapore,
  bangkok: photos.bangkok,
  seoul: photos.seoul,
  sydney: photos.sydney,
  rio: photos.rio,
  "cape-town": photos.capeTown,
  marrakech: photos.marrakech,
  "mexico-city": photos.mexicoCity,
  berlin: photos.berlin,
  vienna: photos.vienna,
  prague: photos.prague,
  delhi: photos.delhi,
  hanoi: photos.hanoi,
  "kuala-lumpur": photos.kualaLumpur,
  auckland: photos.auckland,
  toronto: photos.toronto,
  "buenos-aires": photos.buenosAires,
  lima: photos.lima,
  cairo: photos.cairo,
  nairobi: photos.nairobi,
  dublin: photos.dublin,
  edinburgh: photos.edinburgh,
  copenhagen: photos.copenhagen,
  stockholm: photos.stockholm,
  oslo: photos.oslo,
  helsinki: photos.helsinki,
  tallinn: photos.tallinn,
  riga: photos.riga,
  vilnius: photos.vilnius,
  warsaw: photos.warsaw,
  budapest: photos.budapest,
  athens: photos.athens,
  zagreb: photos.zagreb,
  ljubljana: photos.ljubljana,
  bucharest: photos.bucharest,
  brasov: photos.brasov,
  sibiu: photos.sibiu,
  sighisoara: photos.sighisoara,
  "cluj-napoca": photos.clujNapoca,
  oradea: photos.oradea,
  suceava: photos.suceava,
  iasi: photos.iasi,
  sinaia: photos.sinaia,
  "alba-iulia": photos.albaIulia,
  "danube-delta": photos.danubeDelta,
  sofia: photos.sofia,
  belgrade: photos.belgrade,
  brussels: photos.brussels,
};

export const destinations = destinationCatalog.map((destination) => ({
  ...destination,
  image: destinationPhotos[destination.id],
}));

export type Destination = (typeof destinations)[number];
export const findDestination = (id?: string) =>
  destinations.find((destination) => destination.id === id) || destinations[0];

export const interests = [
  "Adventure", "Luxury", "Budget", "Nature", "Food", "Culture", "Beach", "Solo", "Family",
];

export const money = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

export const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });

export type Activity = {
  id: string;
  day: number;
  period: "Morning" | "Afternoon" | "Evening";
  time: string;
  name: string;
  note: string;
};

export const expenseCategories = [
  "Accommodation", "Food & Drinks", "Transportation", "Activities", "Shopping",
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];
export type Expense = {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
};

export type Trip = {
  destinationId: Destination["id"];
  start: string;
  end: string;
  budget: number;
  companions: string;
  interests: string[];
};

export type TripJournalEntry = {
  id: string;
  trip: Trip;
  activities: Activity[];
  expenses: Expense[];
  savedPlaceIds: string[];
  reflection: string;
  status: "completed" | "replaced";
  archivedAt: string;
};
