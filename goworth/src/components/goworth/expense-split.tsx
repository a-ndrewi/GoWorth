import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Copy, Heading, Icon, Row, sharedSheet } from "@/components/goworth/ui";
import { shownName, TravelerAvatar } from "@/components/goworth/companions";
import { themedStyles } from "@/constants/design";
import { formatMessage, translate } from "@/data/i18n";
import { money, useAppLanguage } from "@/data/formatting";
import type { Expense } from "@/data/travel";
import type { Traveler } from "@/lib/travel-repository";
import { useAuth } from "@/state/auth-context";
import { usePalette, useStyles } from "@/state/theme-context";
import { useTravel } from "@/state/travel-context";
import { balances, equalShares, expensePayer, expenseSharers, settleUp, shareOf } from "@/utils/expense-split";

/**
 * Everyone who can pay or share an expense on the open trip: the owner and the companions who accepted. Splitting
 * shows only once someone has joined; until the people have loaded, the budget stays as it was for a trip alone.
 */
export function useTripSplit() {
  const { user } = useAuth();
  const { tripPeople, tripOwner, profile } = useTravel();
  const language = useAppLanguage();
  const me = user?.id ?? "";
  const ownerId = tripOwner ?? me;
  const people: Traveler[] = (tripPeople ?? []).filter((person) => person.status !== "pending");
  const everyone = people.map((person) => person.id);
  const byId = new Map(people.map((person) => [person.id, person]));
  const traveler = (id: string): Traveler => byId.get(id)
    ?? (id === me ? { id, name: profile.name, username: profile.username, avatarPath: null }
      : { id, name: translate("Former companion", language), username: "", avatarPath: null });
  const name = (id: string) => id === me ? translate("You", language) : shownName(traveler(id), language);
  return { me, ownerId, people, everyone, split: people.length > 1 && !!me, traveler, name };
}

/** "Ana paid · split 3 ways" under an expense, or nothing on a trip alone. */
export function expenseSplitLabel(expense: Expense, split: ReturnType<typeof useTripSplit>, language: "en" | "ro") {
  if (!split.split) return "";
  const sharers = expenseSharers(expense, split.everyone);
  const payer = split.name(expensePayer(expense, split.ownerId));
  const paid = expensePayer(expense, split.ownerId) === split.me ? translate("You paid", language) : formatMessage("{name} paid", { name: payer }, language);
  if (sharers.length === 1) {
    return `${paid} · ${sharers[0] === split.me ? translate("only for you", language) : formatMessage("only for {name}", { name: split.name(sharers[0]) }, language)}`;
  }
  return `${paid} · ${sharers.length === split.everyone.length ? translate("split with everyone", language) : formatMessage("split {count} ways", { count: sharers.length }, language)}`;
}

function PersonChip({ id, selected, onPress, split }: { id: string; selected: boolean; onPress: () => void; split: ReturnType<typeof useTripSplit> }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.person, selected && styles.personSelected, pressed && { opacity: 0.75 }]}>
    <TravelerAvatar traveler={split.traveler(id)} size={24} />
    <Text numberOfLines={1} style={[styles.personName, selected && { color: p.blue }]}>{split.name(id)}</Text>
    {selected && <Icon name="tick" size={14} color={p.blue} />}
  </Pressable>;
}

/** Who paid and whom it is shared between, inside the expense editor. */
export function SplitPicker({ amount, paidBy, splitWith, onPaidBy, onSplitWith }: {
  amount: number; paidBy: string; splitWith: string[]; onPaidBy: (id: string) => void; onSplitWith: (ids: string[]) => void;
}) {
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  const split = useTripSplit();
  if (!split.split) return null;
  // Someone who has left still shows on an expense that names them, so it can be moved to someone else.
  const payers = split.everyone.includes(paidBy) ? split.everyone : [...split.everyone, paidBy];
  const sharers = [...split.everyone, ...splitWith.filter((id) => !split.everyone.includes(id))];
  const toggle = (id: string) => {
    const next = splitWith.includes(id) ? splitWith.filter((item) => item !== id) : [...splitWith, id];
    if (next.length) onSplitWith(sharers.filter((item) => next.includes(item)));
  };
  const each = amount > 0 && splitWith.length ? Math.max(...equalShares(amount, splitWith).values()) / 100 : 0;
  return <View style={{ gap: 12 }}>
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{translate("Paid by", language)}</Text>
      <View style={styles.people}>{payers.map((id) => <PersonChip key={id} id={id} split={split} selected={paidBy === id} onPress={() => onPaidBy(id)} />)}</View>
    </View>
    <View style={{ gap: 7 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={styles.label}>{translate("Split between", language)}</Text>
        {!!each && <Text style={styles.each}>{formatMessage(splitWith.length > 1 ? "{amount} each" : "{amount} for one", { amount: money(each) }, language)}</Text>}
      </Row>
      <View style={styles.people}>{sharers.map((id) => <PersonChip key={id} id={id} split={split} selected={splitWith.includes(id)} onPress={() => toggle(id)} />)}</View>
    </View>
  </View>;
}

/** Who owes whom on a shared trip, with the payments that settle everyone up and the ones already made. */
export function SplitBalances() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const split = useTripSplit();
  const { expenses, settlements, addSettlement, removeSettlement } = useTravel();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!split.split || (!expenses.length && !settlements.length)) return null;
  const balance = balances(expenses, settlements, split.everyone, split.ownerId);
  const transfers = settleUp(balance);
  const mine = balance.get(split.me) ?? 0;
  const myShare = shareOf(split.me, expenses, split.everyone) / 100;
  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try { await work(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : translate("Could not save the payment.", language)); }
    finally { setBusy(""); }
  };
  return <View style={{ gap: 10 }}>
    <Heading style={{ fontSize: 18, lineHeight: 24 }}>Split</Heading>
    <View style={styles.card}>
      <Row style={{ gap: 10 }}>
        <View style={styles.stat}>
          <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>YOUR SHARE</Copy>
          <Text style={styles.statValue}>{money(myShare)}</Text>
        </View>
        <View style={[styles.stat, mine > 0 && { backgroundColor: p.greenSoft }, mine < 0 && { backgroundColor: p.dangerSoft }]}>
          <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>{mine > 0 ? "YOU ARE OWED" : mine < 0 ? "YOU OWE" : "BALANCE"}</Copy>
          <Text style={[styles.statValue, mine > 0 && { color: p.green }, mine < 0 && { color: p.danger }]}>{mine ? money(Math.abs(mine) / 100) : translate("All square", language)}</Text>
        </View>
      </Row>

      {[...balance].map(([id, cents]) => <Row key={id} style={{ gap: 10 }}>
        <TravelerAvatar traveler={split.traveler(id)} size={30} />
        <Text numberOfLines={1} style={[styles.personName, { flex: 1, fontSize: 14 }]}>{split.name(id)}</Text>
        <Text style={[styles.amount, cents > 0 && { color: p.green }, cents < 0 && { color: p.danger }]}>
          {cents > 0 ? `+${money(cents / 100)}` : cents < 0 ? `−${money(-cents / 100)}` : money(0)}
        </Text>
      </Row>)}
    </View>

    <Heading style={{ fontSize: 16, lineHeight: 22 }}>Settle up</Heading>
    {!transfers.length && <View style={styles.square}>
      <Icon name="check" size={18} color={p.green} />
      <Copy style={{ flex: 1, fontSize: 13, fontWeight: "600" }}>Everyone is square. Nobody owes anything.</Copy>
    </View>}
    {transfers.map((transfer) => {
      const key = `${transfer.from}>${transfer.to}`;
      const involvesMe = transfer.from === split.me || transfer.to === split.me;
      const text = transfer.from === split.me ? formatMessage("You pay {name}", { name: split.name(transfer.to) }, language)
        : transfer.to === split.me ? formatMessage("{name} pays you", { name: split.name(transfer.from) }, language)
          : formatMessage("{from} pays {to}", { from: split.name(transfer.from), to: split.name(transfer.to) }, language);
      return <View key={key} style={[styles.transfer, involvesMe && { borderColor: p.blueLine, backgroundColor: p.blueTint }]}>
        <View style={{ flexDirection: "row" }}>
          <TravelerAvatar traveler={split.traveler(transfer.from)} size={30} ring={p.white} />
          <View style={{ marginLeft: -8 }}><TravelerAvatar traveler={split.traveler(transfer.to)} size={30} ring={p.white} /></View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.personName, { fontSize: 14 }]}>{text}</Text>
          <Text style={styles.amountLarge}>{money(transfer.amount)}</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run(key, () => addSettlement(transfer))}
          style={({ pressed }) => [styles.markPaid, pressed && { opacity: 0.75 }, !!busy && busy !== key && { opacity: 0.5 }]}>
          <Text style={styles.markPaidText}>{busy === key ? "…" : translate("Mark paid", language)}</Text>
        </Pressable>
      </View>;
    })}
    {!!error && <Copy style={s.error}>{error}</Copy>}

    {!!settlements.length && <View style={{ gap: 4 }}>
      <Copy muted style={{ fontSize: 12, fontWeight: "700" }}>PAYMENTS MADE</Copy>
      {[...settlements].reverse().map((item) => <Row key={item.id} style={{ gap: 10, paddingVertical: 6 }}>
        <Icon name="wallet" size={17} color={p.muted} />
        <Text numberOfLines={1} style={[styles.paymentText, { flex: 1 }]}>
          {formatMessage("{from} paid {to}", { from: split.name(item.from), to: split.name(item.to) }, language)} · {money(item.amount)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={translate("Undo payment", language)} disabled={!!busy}
          onPress={() => void run(item.id, () => removeSettlement(item.id))} hitSlop={8}>
          <Text style={styles.undo}>{busy === item.id ? "…" : translate("Undo", language)}</Text>
        </Pressable>
      </Row>)}
    </View>}
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  label: { color: p.muted, fontSize: 12, fontWeight: "700" },
  each: { color: p.blue, fontSize: 12, fontWeight: "700" },
  people: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  person: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "100%", paddingLeft: 5, paddingRight: 11, paddingVertical: 5,
    borderRadius: 18, borderWidth: 1.5, borderColor: p.line, backgroundColor: p.white },
  personSelected: { borderColor: p.blue, backgroundColor: p.blueTint },
  personName: { flexShrink: 1, color: p.ink, fontSize: 13, fontWeight: "700" },
  card: { gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  stat: { flex: 1, gap: 3, padding: 12, borderRadius: 14, backgroundColor: p.soft },
  statValue: { color: p.ink, fontSize: 18, fontWeight: "800" },
  amount: { color: p.ink, fontSize: 14, fontWeight: "800" },
  amountLarge: { color: p.ink, fontSize: 17, fontWeight: "800" },
  square: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 14, backgroundColor: p.greenSoft },
  transfer: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  markPaid: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: p.blue },
  markPaidText: { color: p.onColor, fontSize: 12, fontWeight: "800" },
  paymentText: { color: p.ink, fontSize: 13, fontWeight: "600" },
  undo: { color: p.blue, fontSize: 13, fontWeight: "700" },
}));
