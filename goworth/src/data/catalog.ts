export const destinationCatalog = [
  { id: "positano", name: "Positano", country: "Italy", region: "Europe", tags: ["Beach", "Culture", "Food"], description: "A town on Italy's Amalfi Coast, with steep lanes, beaches, and access to coastal walking routes.", imageKey: "positano" },
  { id: "santorini", name: "Santorini", country: "Greece", region: "Europe", tags: ["Beach", "Culture"], description: "A volcanic island in the Cyclades, known for caldera villages, archaeological sites, and Aegean views.", imageKey: "santorini" },
  { id: "bali", name: "Bali", country: "Indonesia", region: "Asia", tags: ["Nature", "Culture", "Beach"], description: "An Indonesian island with temples, rice terraces, forests, and coastal communities.", imageKey: "bali" },
  { id: "kyoto", name: "Kyoto", country: "Japan", region: "Asia", tags: ["City", "Culture", "Food"], description: "Japan's former capital, with historic temples, gardens, traditional neighborhoods, and markets.", imageKey: "kyoto" },
  { id: "iceland", name: "Iceland", country: "Iceland", region: "Europe", tags: ["Nature", "Mountains"], description: "An island country with waterfalls, glaciers, geothermal areas, and national parks.", imageKey: "iceland" },
  { id: "alps", name: "Swiss Alps", country: "Switzerland", region: "Europe", tags: ["Nature", "Mountains"], description: "Mountain communities, lakes, glaciers, and rail journeys across the Swiss Alps.", imageKey: "alps" },
  { id: "paris", name: "Paris", country: "France", region: "Europe", tags: ["City", "Culture", "Food"], description: "Museums, monuments, gardens, and neighborhoods along the Seine.", imageKey: "paris" },
  { id: "rome", name: "Rome", country: "Italy", region: "Europe", tags: ["City", "Culture", "Food"], description: "Ancient sites, public squares, museums, and markets across Italy's capital.", imageKey: "rome" },
  { id: "tokyo", name: "Tokyo", country: "Japan", region: "Asia", tags: ["City", "Culture", "Food"], description: "Neighborhoods, shrines, parks, museums, and markets across Japan's capital.", imageKey: "tokyo" },
  { id: "lisbon", name: "Lisbon", country: "Portugal", region: "Europe", tags: ["City", "Culture", "Food"], description: "Hilltop neighborhoods, tiled streets, markets, and landmarks beside the Tagus.", imageKey: "lisbon" },
  { id: "new-york", name: "New York City", country: "United States", region: "Americas", tags: ["City", "Culture", "Food"], description: "Parks, museums, bridges, and distinct neighborhoods across five boroughs.", imageKey: "newYork" },
  { id: "barcelona", name: "Barcelona", country: "Spain", region: "Europe", tags: ["City", "Culture", "Beach", "Food"], description: "Modernist architecture, markets, parks, and Mediterranean waterfront districts.", imageKey: "barcelona" },
] as const;

export type DestinationId = (typeof destinationCatalog)[number]["id"];
export type PlaceCategory = "Landmarks" | "Museums" | "Nature" | "Beaches" | "Neighborhoods" | "Food & Markets";
export type Place = {
  id: string;
  destinationId: DestinationId;
  name: string;
  category: PlaceCategory;
  detail: string;
};

export const places: Place[] = [
  { id: "spiaggia-grande", destinationId: "positano", name: "Spiaggia Grande", category: "Beaches", detail: "Main beach in Positano" },
  { id: "fornillo-beach", destinationId: "positano", name: "Fornillo Beach", category: "Beaches", detail: "Beach west of Positano's main harbor" },
  { id: "santa-maria-assunta", destinationId: "positano", name: "Church of Santa Maria Assunta", category: "Landmarks", detail: "Historic church in central Positano" },
  { id: "path-of-the-gods", destinationId: "positano", name: "Path of the Gods", category: "Nature", detail: "Coastal hiking trail near Nocelle" },
  { id: "mar-positano", destinationId: "positano", name: "Museo Archeologico Romano", category: "Museums", detail: "Roman archaeological museum" },
  { id: "nocelle", destinationId: "positano", name: "Nocelle", category: "Neighborhoods", detail: "Hill village above Positano" },

  { id: "oia-castle", destinationId: "santorini", name: "Oia Castle", category: "Landmarks", detail: "Castle ruins overlooking the caldera" },
  { id: "akrotiri", destinationId: "santorini", name: "Akrotiri Archaeological Site", category: "Landmarks", detail: "Bronze Age settlement" },
  { id: "red-beach", destinationId: "santorini", name: "Red Beach", category: "Beaches", detail: "Volcanic beach near Akrotiri" },
  { id: "ancient-thera", destinationId: "santorini", name: "Ancient Thera", category: "Landmarks", detail: "Ancient city on Mesa Vouno" },
  { id: "museum-prehistoric-thera", destinationId: "santorini", name: "Museum of Prehistoric Thera", category: "Museums", detail: "Museum in Fira" },
  { id: "fira-oia-trail", destinationId: "santorini", name: "Fira to Oia Trail", category: "Nature", detail: "Caldera walking route" },

  { id: "monkey-forest", destinationId: "bali", name: "Sacred Monkey Forest Sanctuary", category: "Nature", detail: "Forest sanctuary in Ubud" },
  { id: "tegallalang", destinationId: "bali", name: "Tegallalang Rice Terrace", category: "Nature", detail: "Rice terraces north of Ubud" },
  { id: "tirta-empul", destinationId: "bali", name: "Tirta Empul Temple", category: "Landmarks", detail: "Hindu water temple in Tampaksiring" },
  { id: "uluwatu-temple", destinationId: "bali", name: "Uluwatu Temple", category: "Landmarks", detail: "Sea temple on the Bukit Peninsula" },
  { id: "jatiluwih", destinationId: "bali", name: "Jatiluwih Rice Terraces", category: "Nature", detail: "Rice landscape in central Bali" },
  { id: "tanah-lot", destinationId: "bali", name: "Tanah Lot", category: "Landmarks", detail: "Coastal Hindu temple" },

  { id: "fushimi-inari", destinationId: "kyoto", name: "Fushimi Inari Taisha", category: "Landmarks", detail: "Shinto shrine in southern Kyoto" },
  { id: "kiyomizu-dera", destinationId: "kyoto", name: "Kiyomizu-dera", category: "Landmarks", detail: "Buddhist temple in eastern Kyoto" },
  { id: "arashiyama-bamboo", destinationId: "kyoto", name: "Arashiyama Bamboo Grove", category: "Nature", detail: "Bamboo path in Arashiyama" },
  { id: "kinkaku-ji", destinationId: "kyoto", name: "Kinkaku-ji", category: "Landmarks", detail: "Zen Buddhist temple" },
  { id: "nishiki-market", destinationId: "kyoto", name: "Nishiki Market", category: "Food & Markets", detail: "Food market in central Kyoto" },
  { id: "gion", destinationId: "kyoto", name: "Gion", category: "Neighborhoods", detail: "Historic district east of the Kamo River" },

  { id: "thingvellir", destinationId: "iceland", name: "Thingvellir National Park", category: "Nature", detail: "National park east of Reykjavik" },
  { id: "gullfoss", destinationId: "iceland", name: "Gullfoss", category: "Nature", detail: "Waterfall on the Hvita River" },
  { id: "skogafoss", destinationId: "iceland", name: "Skogafoss", category: "Nature", detail: "Waterfall on Iceland's south coast" },
  { id: "jokulsarlon", destinationId: "iceland", name: "Jokulsarlon Glacier Lagoon", category: "Nature", detail: "Glacial lagoon in southeast Iceland" },
  { id: "seljalandsfoss", destinationId: "iceland", name: "Seljalandsfoss", category: "Nature", detail: "Waterfall in southern Iceland" },
  { id: "blue-lagoon", destinationId: "iceland", name: "Blue Lagoon", category: "Nature", detail: "Geothermal spa on the Reykjanes Peninsula" },

  { id: "jungfraujoch", destinationId: "alps", name: "Jungfraujoch", category: "Nature", detail: "High-altitude railway destination" },
  { id: "lauterbrunnen", destinationId: "alps", name: "Lauterbrunnen Valley", category: "Nature", detail: "Valley in the Bernese Oberland" },
  { id: "matterhorn", destinationId: "alps", name: "Matterhorn", category: "Nature", detail: "Mountain above Zermatt" },
  { id: "aletsch-glacier", destinationId: "alps", name: "Aletsch Glacier", category: "Nature", detail: "Glacier in the Bernese Alps" },
  { id: "oeschinen-lake", destinationId: "alps", name: "Oeschinen Lake", category: "Nature", detail: "Mountain lake near Kandersteg" },
  { id: "zermatt", destinationId: "alps", name: "Zermatt", category: "Neighborhoods", detail: "Mountain village in Valais" },

  { id: "eiffel-tower", destinationId: "paris", name: "Eiffel Tower", category: "Landmarks", detail: "Landmark in the 7th arrondissement" },
  { id: "louvre", destinationId: "paris", name: "Louvre Museum", category: "Museums", detail: "Art museum on the Right Bank" },
  { id: "notre-dame-paris", destinationId: "paris", name: "Notre-Dame de Paris", category: "Landmarks", detail: "Cathedral on the Ile de la Cite" },
  { id: "luxembourg-gardens", destinationId: "paris", name: "Luxembourg Gardens", category: "Nature", detail: "Public garden in the 6th arrondissement" },
  { id: "musee-orsay", destinationId: "paris", name: "Musee d'Orsay", category: "Museums", detail: "Art museum beside the Seine" },
  { id: "montmartre", destinationId: "paris", name: "Montmartre", category: "Neighborhoods", detail: "Hill district in northern Paris" },

  { id: "colosseum", destinationId: "rome", name: "Colosseum", category: "Landmarks", detail: "Ancient amphitheatre" },
  { id: "roman-forum", destinationId: "rome", name: "Roman Forum", category: "Landmarks", detail: "Archaeological site in central Rome" },
  { id: "pantheon-rome", destinationId: "rome", name: "Pantheon", category: "Landmarks", detail: "Ancient Roman building in the historic center" },
  { id: "trevi-fountain", destinationId: "rome", name: "Trevi Fountain", category: "Landmarks", detail: "Baroque fountain in Trevi" },
  { id: "villa-borghese", destinationId: "rome", name: "Villa Borghese Gardens", category: "Nature", detail: "Public park north of the historic center" },
  { id: "campo-de-fiori", destinationId: "rome", name: "Campo de' Fiori", category: "Food & Markets", detail: "Square with a daytime market" },

  { id: "senso-ji", destinationId: "tokyo", name: "Senso-ji", category: "Landmarks", detail: "Buddhist temple in Asakusa" },
  { id: "meiji-jingu", destinationId: "tokyo", name: "Meiji Jingu", category: "Landmarks", detail: "Shinto shrine near Harajuku" },
  { id: "shibuya-crossing", destinationId: "tokyo", name: "Shibuya Crossing", category: "Neighborhoods", detail: "Pedestrian crossing in Shibuya" },
  { id: "tsukiji-market", destinationId: "tokyo", name: "Tsukiji Outer Market", category: "Food & Markets", detail: "Market district in Chuo" },
  { id: "tokyo-skytree", destinationId: "tokyo", name: "Tokyo Skytree", category: "Landmarks", detail: "Observation tower in Sumida" },
  { id: "shinjuku-gyoen", destinationId: "tokyo", name: "Shinjuku Gyoen", category: "Nature", detail: "National garden in central Tokyo" },

  { id: "belem-tower", destinationId: "lisbon", name: "Belem Tower", category: "Landmarks", detail: "Fortified tower beside the Tagus" },
  { id: "jeronimos-monastery", destinationId: "lisbon", name: "Jeronimos Monastery", category: "Landmarks", detail: "Monastery in Belem" },
  { id: "alfama", destinationId: "lisbon", name: "Alfama", category: "Neighborhoods", detail: "Historic hill neighborhood" },
  { id: "sao-jorge-castle", destinationId: "lisbon", name: "Castelo de Sao Jorge", category: "Landmarks", detail: "Hilltop castle in central Lisbon" },
  { id: "lx-factory", destinationId: "lisbon", name: "LX Factory", category: "Food & Markets", detail: "Shops and eateries in Alcantara" },
  { id: "time-out-market-lisbon", destinationId: "lisbon", name: "Time Out Market Lisboa", category: "Food & Markets", detail: "Food hall at Mercado da Ribeira" },

  { id: "central-park", destinationId: "new-york", name: "Central Park", category: "Nature", detail: "Public park in Manhattan" },
  { id: "the-met", destinationId: "new-york", name: "The Metropolitan Museum of Art", category: "Museums", detail: "Art museum on Fifth Avenue" },
  { id: "brooklyn-bridge", destinationId: "new-york", name: "Brooklyn Bridge", category: "Landmarks", detail: "Bridge between Manhattan and Brooklyn" },
  { id: "statue-of-liberty", destinationId: "new-york", name: "Statue of Liberty", category: "Landmarks", detail: "Monument on Liberty Island" },
  { id: "high-line", destinationId: "new-york", name: "The High Line", category: "Nature", detail: "Elevated park on Manhattan's West Side" },
  { id: "grand-central", destinationId: "new-york", name: "Grand Central Terminal", category: "Landmarks", detail: "Rail terminal in Midtown Manhattan" },

  { id: "sagrada-familia", destinationId: "barcelona", name: "Sagrada Familia", category: "Landmarks", detail: "Gaudi basilica in Eixample" },
  { id: "park-guell", destinationId: "barcelona", name: "Park Guell", category: "Nature", detail: "Gaudi-designed public park" },
  { id: "casa-batllo", destinationId: "barcelona", name: "Casa Batllo", category: "Landmarks", detail: "Modernist building on Passeig de Gracia" },
  { id: "gothic-quarter", destinationId: "barcelona", name: "Gothic Quarter", category: "Neighborhoods", detail: "Historic district in Ciutat Vella" },
  { id: "montjuic", destinationId: "barcelona", name: "Montjuic", category: "Nature", detail: "Hill with gardens and museums" },
  { id: "la-boqueria", destinationId: "barcelona", name: "La Boqueria", category: "Food & Markets", detail: "Market beside La Rambla" },
];

export const placesForDestination = (destinationId: string) =>
  places.filter((place) => place.destinationId === destinationId);

export const placeMapUrl = (place: Place) => {
  const destination = destinationCatalog.find((item) => item.id === place.destinationId);
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${place.name}, ${destination?.name || ""}, ${destination?.country || ""}`)}`;
};
