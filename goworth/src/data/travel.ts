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
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

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
