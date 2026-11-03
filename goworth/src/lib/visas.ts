import { supabase } from "./supabase";

export type Visa = {
  countryCode: string;
  entries: number;
  cities: string[];
  firstEntry: string;
  lastEntry: string;
  /** One entry stamp per trip, oldest first. */
  stamps: { date: string }[];
  issuedAt: string;
  /** False until the award animation has shown it, for a new visa or a new entry. */
  seen: boolean;
};

type VisaRow = {
  country_code: string; entries: number; cities: string[] | null; first_entry: string; last_entry: string;
  stamps: { date: string }[] | null; issued_at: string; seen: boolean;
};

const fromRow = (row: VisaRow): Visa => ({
  countryCode: row.country_code, entries: row.entries, cities: row.cities ?? [], firstEntry: row.first_entry,
  lastEntry: row.last_entry, stamps: Array.isArray(row.stamps) ? row.stamps : [], issuedAt: row.issued_at, seen: row.seen,
});

/** Issues the visas for trips that have ended since the last launch, then returns the whole passport, oldest first.
 * Null when it could not be read, so an offline launch keeps the passport it already has. */
export async function claimAndLoadVisas(userId: string): Promise<Visa[] | null> {
  if (!supabase) return [];
  // Until the visa migration is applied the claim fails; the passport then simply stays empty.
  await supabase.rpc("claim_visas").then(() => undefined, () => undefined);
  const { data, error } = await supabase.from("visas")
    .select("country_code,entries,cities,first_entry,last_entry,stamps,issued_at,seen")
    .eq("user_id", userId).order("issued_at", { ascending: true });
  if (error) return /relation|schema cache|does not exist/i.test(error.message) ? [] : null;
  return (data as VisaRow[]).map(fromRow);
}

export async function markVisasSeen() {
  if (!supabase) return;
  await supabase.rpc("mark_visas_seen").then(() => undefined, () => undefined);
}
