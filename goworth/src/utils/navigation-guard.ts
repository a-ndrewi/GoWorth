import { router, type Href } from "expo-router";
import { createTapGuard } from "@/utils/tap-guard";

const repeated = createTapGuard();

/** `router.push` that ignores the second tap of a double tap on the same link. */
export function pushOnce(href: Href) {
  if (repeated(JSON.stringify(href), Date.now())) return;
  router.push(href);
}
