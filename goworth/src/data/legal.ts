export type LegalDocumentId = "privacy" | "terms" | "subscriptions" | "credits";

export const legalIdentity = {
  operator: "[LEGAL OPERATOR NAME - COMPLETE BEFORE RELEASE]",
  address: "[REGISTERED ADDRESS AND COUNTRY - COMPLETE BEFORE RELEASE]",
  contact: "[CONTACT EMAIL - COMPLETE BEFORE RELEASE]",
};

export const legalDocuments: Record<LegalDocumentId, {
  title: string;
  updated: string;
  sections: { title: string; body: string }[];
}> = {
  privacy: {
    title: "Privacy notice",
    updated: "Draft · 13 October 2026",
    sections: [
      { title: "Who is responsible", body: `GoWorth is operated by ${legalIdentity.operator}. Address: ${legalIdentity.address}. Privacy contact: ${legalIdentity.contact}. These details must be completed before public release.` },
      { title: "Data we use", body: "We process your email and authentication details, profile name and username, profile photo if you upload one, travel preferences, saved destinations and places, trip dates and budgets, itinerary activities, expense entries, and journal notes. We do not store payment-card data because purchases are not available. If you allow location access, the app uses your device location to rank nearby suggestions; your discovery radius and chosen city are stored on your device." },
      { title: "Why we use it", body: "Account and trip data are used to provide the service you request. Security and essential service logs support operation and abuse prevention. Optional device location is used only with your permission for nearby discovery; you can turn it off in device settings or choose a city manually. We do not currently use advertising analytics or sell personal data." },
      { title: "Services and disclosures", body: "Supabase hosts authentication, account data, and profile photos. When profile verification is enabled, OpenAI receives the proposed profile name, username, or photo for content moderation before publication. OpenFreeMap supplies map tiles; Photon receives map search and nearby-place queries based on OpenStreetMap data. Wikipedia receives place searches and may supply nearby attraction results. Wikimedia Commons may receive requests for place photos. These services can receive your IP address and technical request information. A selected place name or map viewport may be sent when you use those features. The operator must confirm OpenAI's applicable processing terms and retention before release. Future payment providers will be identified before any paid feature launches." },
      { title: "Storage and retention", body: "Account, saved, and journal data remain until you remove them or delete your account. Replaced trips are archived as plans; a trip you finish is archived as completed. Deleting a current trip removes its itinerary and expenses instead of archiving them. Service-provider logs and backups may have separate retention periods; the operator must confirm and publish the actual periods before release." },
      { title: "Your choices and rights", body: "You can edit profile and trip data, export your account data, and request account deletion in Legal & privacy. Depending on applicable law, you may also request access, correction, erasure, restriction, portability, or object to processing. Contact the privacy address above. You may complain to your local data-protection authority. Location permission can be withdrawn in your device settings." },
      { title: "Transfers and safeguards", body: "Data may be processed in countries other than yours by the providers named above. The operator must document the hosting region, relevant transfer safeguards, processor agreements, and security measures before release. No automated decision with legal or similarly significant effects is made by GoWorth." },
      { title: "Changes", body: "We will update this notice when data practices change, including before subscriptions or payments become available. Material changes will be communicated in the app or by another appropriate method." },
    ],
  },
  terms: {
    title: "Terms of use",
    updated: "Draft · 13 October 2026",
    sections: [
      { title: "Service provider", body: `GoWorth is provided by ${legalIdentity.operator}, ${legalIdentity.address}. Contact: ${legalIdentity.contact}. Complete these details before public release.` },
      { title: "What GoWorth does", body: "GoWorth helps you discover destinations, plan trips, track a personal budget, and keep a trip journal. It does not make reservations, sell travel services, provide emergency assistance, or currently process payments. Trip suggestions and map information are for planning and may be incomplete or change." },
      { title: "Your account", body: "Keep your sign-in details secure and use the app lawfully. You are responsible for the trip details and notes you add. Do not upload content you lack the right to use, interfere with the service, or use it to harm others." },
      { title: "Your content", body: "You retain ownership of your own notes and trip data. You grant GoWorth only the permissions needed to store, display, and process that content for the service. You can export your data and delete your account from the app." },
      { title: "Travel and map information", body: "Check opening hours, costs, transport, safety conditions, accessibility, visa rules, and local guidance with official sources before acting. Routes opened in an external navigation service are governed by that service's terms. GoWorth does not guarantee a location, route, or suggestion is accurate or safe." },
      { title: "Availability and changes", body: "The service may change or be interrupted for maintenance or reasons outside our control. We will not remove mandatory consumer rights. Material changes to these terms will be communicated before they take effect where required." },
      { title: "Paid features", body: "There is no active subscription or in-app purchase. If paid features are introduced, prices, billing period, renewal, cancellation, refund information, and applicable store terms will be shown before purchase. See Subscription information in this menu." },
      { title: "Law and disputes", body: "Mandatory consumer protections in your country remain available. The operator must specify its jurisdiction and a real support contact before public release. Contact us first to resolve a service issue." },
    ],
  },
  subscriptions: {
    title: "Subscription information",
    updated: "Pre-launch information · 13 October 2026",
    sections: [
      { title: "Current status", body: "GoWorth does not currently sell subscriptions, charge for trips, or offer a free trial that renews into a paid plan. This page is preparatory information, not an offer to purchase." },
      { title: "Before any paid launch", body: "The purchase screen and updated terms will show the exact plan benefits, total price and currency, taxes where applicable, billing interval, renewal and trial terms, how to cancel, refund rules, and the payment provider. Purchase will require an explicit action. Access to already purchased features and restoration of purchases will be supported where the platform requires it." },
      { title: "Store billing", body: "If an iPhone or Android subscription is sold through an app store, that store will handle billing and provide subscription management. GoWorth will not ask users to cancel by merely deleting their account. We will add the relevant management and restoration links before subscriptions are enabled." },
    ],
  },
  credits: {
    title: "Licenses & credits",
    updated: "15 October 2026",
    sections: [
      { title: "Map data", body: "Map data is from OpenStreetMap contributors, available under the Open Database License. Map tiles are served by OpenFreeMap. The map is rendered with the open-source MapLibre GL JS library. Map search and some nearby-place results are provided by Photon from OpenStreetMap data. Attribution appears on the map and in this menu." },
      { title: "Wikipedia places", body: "City place search and some nearby attractions use Wikipedia article titles and coordinates. Each result links to its source article. Wikipedia text, when reused, is generally licensed under CC BY-SA; GoWorth does not reproduce article text in place descriptions." },
      { title: "Countries, states and cities", body: "The country, US state, and city index is adapted from GeoNames cities5000, countryInfo, and admin1CodesASCII, licensed CC BY 4.0. It includes cities above the dataset's population threshold and administrative seats, not every settlement. Source: geonames.org. License: creativecommons.org/licenses/by/4.0/." },
      { title: "US state markers", body: "The state points on the map come from the U.S. Census Bureau 2026 National States Gazetteer File. They identify states for navigation and do not draw state boundaries. Source: census.gov/geographies/reference-files/2026/geo/gazetter-file.html." },
      { title: "Place photos", body: "Destination images are bundled with GoWorth and their sources are recorded in the project. Place photos, when available, come from Wikimedia Commons. Open Photo details from an image to view its source, creator, and exact license here. License terms can differ by image." },
      { title: "External navigation", body: "When you choose Directions, GoWorth opens your device's mapping app or a web map. That provider receives the destination coordinates and applies its own privacy terms." },
    ],
  },
};
