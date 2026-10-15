# Geographic data and photos

The bundled country and city index was generated on 15 October 2026 from
[GeoNames countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt),
[cities5000.zip](https://download.geonames.org/export/dump/cities5000.zip),
and [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt).
GeoNames licenses these files under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The app credits GeoNames in Legal & privacy, under Licenses & credits.
The snapshot contains 250 current country or territory records and 69,806 populated
places. Two obsolete country codes (AN and CS) are excluded. The cities5000 extract includes places with more than 5,000 residents
or qualifying administrative seats; it does not contain every settlement.
The United States view groups its cities into the 50 states and District of Columbia.
State markers on the world map use internal-point coordinates from the
[U.S. Census Bureau 2026 National States Gazetteer File](https://www.census.gov/geographies/reference-files/2026/geo/gazetter-file.html).
The point is for selecting a state, not a precise geographic centroid or a state boundary.

To refresh the index, download all three files from GeoNames, extract `cities5000.txt`,
and run `node scripts/import-geonames.mjs cities5000.txt countryInfo.txt admin1CodesASCII.txt`.
Review country names, contested areas, and counts before release. The generated
`src/data/world-geography.ts` is checked in so browsing countries and cities
does not depend on a GeoNames API key or request quota.

Nearby attractions and map search use [Photon](https://github.com/komoot/photon)
and [OpenStreetMap](https://www.openstreetmap.org/copyright) data. OpenStreetMap
data requires attribution under the ODbL. The public Photon server is a demo:
it allows reasonable usage but can throttle or stop serving requests and offers
no availability guarantee. Before scaling a public release, operate a private
Photon instance or use a provider with agreed capacity. The current app caches
nearby results per device for 30 minutes and loads them only when needed.

City place search uses the [Wikipedia Action API](https://www.mediawiki.org/wiki/API:Search)
to find geotagged articles. The app shows only nearby results with a freely reusable
lead image and a description identifying a visitor attraction or natural landmark.
It uses article titles and coordinates, links to the source page, and does not copy
article text. Some nearby-place fallbacks use the same criteria. Wikipedia content
is generally [CC BY-SA](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use),
and this source is credited in Legal & privacy. An encyclopedia article is evidence
that a location exists, not an editorial recommendation. The category filter is a
conservative starting point; destination quality still requires human review.
For stronger editorial selection in a future importer, Wikivoyage's
[See and Do listings](https://en.wikivoyage.org/wiki/Wikivoyage:Listings)
are travel-specific. Reusing their descriptions would require author attribution
and CC BY-SA compliance; this app does not currently import those listings.

Map tiles normally come from [OpenFreeMap](https://openfreemap.org/tos/), which
offers its public service for free without an SLA and requires attribution.
When WebGL is unavailable, the Leaflet fallback requests public
[OpenStreetMap raster tiles](https://operations.osmfoundation.org/policies/tiles/).
The native WebView identifies GoWorth in its User-Agent and the map displays
OpenStreetMap credit. The public tile service is also best-effort; before a
large release, use a tile provider with agreed capacity for the fallback.

Place photos come from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).
The app accepts CC0, public-domain, CC BY, and CC BY-SA images only. Each displayed
photo links to its creator, exact license, and source file in Legal & privacy. Photo coverage depends
on whether a verifiable image exists for the place. Commons does not guarantee
every place has a photo, and hotlinked thumbnails may fail; the UI then tries
another verified image or displays a clear placeholder.
