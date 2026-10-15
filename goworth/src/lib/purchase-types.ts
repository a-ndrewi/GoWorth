export type PaidPlan = "premium" | "lifetime";

export type StoreOffers = {
  monthlyPrice: string | null;
  lifetimePrice: string | null;
  managementUrl: string | null;
};

export const purchaseEntitlementId = "goworth_unlimited";
