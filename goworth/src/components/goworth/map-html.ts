import type { MapPin } from "@/data/map";

export function mapHtml(pins: MapPin[], selected?: MapPin) {
  const data = JSON.stringify({ pins, selected }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;width:100%;margin:0;background:#e9f0ec} .leaflet-container{font-family:system-ui,-apple-system,sans-serif} .leaflet-popup-content{font-size:13px;line-height:1.4}</style>
</head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const data=${data};
const map=L.map('map',{scrollWheelZoom:false}).setView(data.selected?[data.selected.latitude,data.selected.longitude]:[25,12],data.selected?11:2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
for(const pin of data.pins){const label=document.createElement('span');label.textContent=pin.name;L.circleMarker([pin.latitude,pin.longitude],{radius:6,color:'#146A59',weight:2,fillColor:'#00B58C',fillOpacity:.9}).addTo(map).bindPopup(label);}
if(data.selected){const label=document.createElement('span');label.textContent=data.selected.name;L.marker([data.selected.latitude,data.selected.longitude]).addTo(map).bindPopup(label).openPopup();}
else if(data.pins.length){map.fitBounds(L.latLngBounds(data.pins.map(pin=>[pin.latitude,pin.longitude])),{padding:[25,25]});}
</script></body></html>`;
}
