type Language = "en" | "ro";

export class SyncFailure extends Error {
  readonly isFreeLimit: boolean;

  constructor(message: string, isFreeLimit: boolean) {
    super(message);
    this.name = "SyncFailure";
    this.isFreeLimit = isFreeLimit;
  }
}

export function isFreeLimitFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /Free monthly (trip|place|destination) limit reached \(\d+\)/i.test(message);
}

export function describeSyncFailure(error: unknown, language: Language): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const quota = /Free monthly (trip|place|destination) limit reached \((\d+)\)/i.exec(message);
  if (quota) {
    const labels = language === "ro"
      ? { trip: "călătorii", place: "locuri", destination: "destinații" }
      : { trip: "trips", place: "places", destination: "destinations" };
    const kind = quota[1].toLowerCase() as keyof typeof labels;
    return language === "ro"
      ? `Ai atins limita gratuită de ${quota[2]} ${labels[kind]} noi în această lună. Poți salva altele luna viitoare.`
      : `You reached the free limit of ${quota[2]} new ${labels[kind]} this month. You can save more next month.`;
  }
  if (/failed to fetch|network request failed|networkerror|fetch failed|internet connection/i.test(message)) {
    return language === "ro" ? "Nu ne putem conecta acum. Verifică internetul și încearcă din nou." : "Could not connect. Check your internet connection and try again.";
  }
  if (/schema cache|relation .* does not exist|column .* does not exist|permission denied for (table|schema)/i.test(message)) {
    return language === "ro" ? "Baza de date nu este configurată complet. Aplică migrările Supabase și încearcă din nou." : "The database setup is incomplete. Apply the Supabase migrations and try again.";
  }
  if (/jwt|session expired|not authenticated|invalid token|not your account/i.test(message)) {
    return language === "ro" ? "Sesiunea nu mai este validă. Autentifică-te din nou." : "Your session is no longer valid. Sign in again.";
  }
  return message
    ? language === "ro" ? `Schimbarea a fost refuzată: ${message}` : `The change was rejected: ${message}`
    : language === "ro" ? "Nu am putut salva schimbarea. Încearcă din nou." : "Could not save your change. Try again.";
}
