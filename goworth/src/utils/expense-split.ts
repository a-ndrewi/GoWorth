/** What the split maths needs from an expense; paidBy and splitWith are empty on expenses saved before splitting. */
export type SplitExpense = { amount: number; paidBy?: string | null; splitWith?: string[] | null };
export type Settlement = { id: string; from: string; to: string; amount: number; createdAt?: string };
export type Transfer = { from: string; to: string; amount: number };

const toCents = (value: number) => Math.round(value * 100);

/** Who paid an expense: the payer saved with it, else the trip owner who recorded every expense before splitting. */
export const expensePayer = (expense: SplitExpense, owner: string) => expense.paidBy || owner;

/** Whom an expense is shared between: the people saved with it, else everyone on the trip. */
export const expenseSharers = (expense: SplitExpense, everyone: string[]) =>
  expense.splitWith?.length ? expense.splitWith : everyone;

/**
 * Splits an amount into equal shares in whole cents. The cents left over go one each to the first people, so the
 * shares always add up to the amount exactly.
 */
export function equalShares(amount: number, people: string[]): Map<string, number> {
  const shares = new Map<string, number>();
  if (!people.length) return shares;
  const cents = toCents(amount);
  const base = Math.floor(cents / people.length);
  let extra = cents - base * people.length;
  for (const person of people) {
    shares.set(person, (shares.get(person) ?? 0) + base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
  }
  return shares;
}

/**
 * Each traveller's balance in cents: positive when the others owe them, negative when they owe. Everyone on the trip
 * appears, even at zero; people who have since left appear while an expense or settlement still names them.
 */
export function balances(expenses: SplitExpense[], settlements: Settlement[], everyone: string[], owner: string) {
  const result = new Map<string, number>(everyone.map((person) => [person, 0]));
  const add = (person: string, cents: number) => result.set(person, (result.get(person) ?? 0) + cents);
  for (const expense of expenses) {
    add(expensePayer(expense, owner), toCents(expense.amount));
    for (const [person, share] of equalShares(expense.amount, expenseSharers(expense, everyone))) add(person, -share);
  }
  for (const settlement of settlements) {
    add(settlement.from, toCents(settlement.amount));
    add(settlement.to, -toCents(settlement.amount));
  }
  return result;
}

/** What one traveller's own share of the spending comes to, in cents. */
export function shareOf(person: string, expenses: SplitExpense[], everyone: string[]) {
  return expenses.reduce((sum, expense) => sum + (equalShares(expense.amount, expenseSharers(expense, everyone)).get(person) ?? 0), 0);
}

/**
 * The fewest payments that settle everyone up: the biggest debtor pays the biggest creditor, again and again.
 * Amounts come back in the trip currency, not cents. Ties keep the order people were given in, so the list is stable.
 */
export function settleUp(balance: Map<string, number>): Transfer[] {
  const order = [...balance.keys()];
  const byOrder = (a: [string, number], b: [string, number]) => order.indexOf(a[0]) - order.indexOf(b[0]);
  const creditors = [...balance].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1] || byOrder(a, b));
  const debtors = [...balance].filter(([, cents]) => cents < 0).map(([person, cents]) => [person, -cents] as [string, number])
    .sort((a, b) => b[1] - a[1] || byOrder(a, b));
  const transfers: Transfer[] = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const cents = Math.min(creditors[c][1], debtors[d][1]);
    if (cents > 0) transfers.push({ from: debtors[d][0], to: creditors[c][0], amount: cents / 100 });
    creditors[c][1] -= cents;
    debtors[d][1] -= cents;
    if (!creditors[c][1]) c += 1;
    if (!debtors[d][1]) d += 1;
  }
  return transfers;
}
