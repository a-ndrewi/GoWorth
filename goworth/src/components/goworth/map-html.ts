import type { MapPin } from "@/data/map";

export function mapHtml(pins: MapPin[], selected?: MapPin) {
  const data = JSON.stringify({ pins, selected }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#map{height:100%;width:100%;margin:0;background:#e8f0ed;overscroll-behavior:none;touch-action:none}
  body{font-family:system-ui,-apple-system,sans-serif}
  #loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#47635d;font-size:13px;pointer-events:none}
  .marker{width:22px;height:22px;border:3px solid white;border-radius:50%;background:#00a989;box-shadow:0 2px 9px #12372a66;cursor:pointer;padding:0}
  .marker.place,.marker.search{background:#ee5d8d}
  .marker.selected{width:29px;height:29px;border:4px solid white;box-shadow:0 0 0 3px #2563ff,0 3px 12px #12372a66;z-index:10}
  .maplibregl-popup-content,.leaflet-popup-content-wrapper{font:600 13px system-ui,-apple-system,sans-serif;color:#0b2545;border-radius:6px}
  .maplibregl-ctrl-attrib{font-size:10px!important}
</style>
</head><body><div id="map"></div><div id="loading">Loading map...</div>
<script src="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const data=${data};
const loading=document.getElementById('loading');
const allPins=data.pins.filter(pin=>!data.selected||pin.id!==data.selected.id);
if(data.selected)allPins.push(data.selected);
function notify(pin){
  const message=JSON.stringify({type:'pin',id:pin.id});
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);
  if(window.parent!==window)window.parent.postMessage(message,'*');
}
function popupNode(name){const el=document.createElement('span');el.textContent=name;return el;}
function fallback(){
  if(!window.L){loading.textContent='Map unavailable right now';return;}
  document.getElementById('map').replaceChildren();
  const map=L.map('map',{scrollWheelZoom:false,zoomControl:true}).setView(
    data.selected?[data.selected.latitude,data.selected.longitude]:[25,12],
    data.selected?(data.selected.kind==='destination'?11:15):2
  );
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'&copy; OpenStreetMap contributors'
  }).addTo(map);
  allPins.forEach(pin=>L.circleMarker([pin.latitude,pin.longitude],{
    radius:data.selected&&pin.id===data.selected.id?10:7,
    color:'#fff',weight:3,fillColor:pin.kind==='destination'?'#00a989':'#ee5d8d',fillOpacity:1
  }).addTo(map).bindPopup(popupNode(pin.name)).on('click',()=>notify(pin)));
  if(data.selected)map.eachLayer(layer=>{if(layer.getLatLng&&layer.getLatLng().lat===data.selected.latitude)layer.openPopup();});
  else if(allPins.length)map.fitBounds(L.latLngBounds(allPins.map(pin=>[pin.latitude,pin.longitude])),{padding:[25,25]});
  loading.remove();
}
try{
  if(!window.maplibregl||!maplibregl.supported())throw new Error('WebGL unavailable');
  const map=new maplibregl.Map({
    container:'map',style:'https://tiles.openfreemap.org/styles/liberty',
    center:data.selected?[data.selected.longitude,data.selected.latitude]:[12,25],
    zoom:data.selected?(data.selected.kind==='destination'?10:15):2,
    scrollZoom:false,attributionControl:false
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
  map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');
  let loaded=false;
  const timeout=setTimeout(()=>{if(!loaded){map.remove();fallback();}},8000);
  map.on('load',()=>{
    loaded=true;clearTimeout(timeout);loading.remove();
    if(!data.selected&&allPins.length){
      const bounds=new maplibregl.LngLatBounds();
      allPins.forEach(pin=>bounds.extend([pin.longitude,pin.latitude]));
      map.fitBounds(bounds,{padding:32,maxZoom:5,duration:0});
    }
    allPins.forEach(pin=>{
      const selected=!!data.selected&&pin.id===data.selected.id;
      const button=document.createElement('button');
      button.type='button';button.className='marker '+(pin.kind||'destination')+(selected?' selected':'');
      button.setAttribute('aria-label',pin.name);button.onclick=()=>notify(pin);
      const marker=new maplibregl.Marker({element:button}).setLngLat([pin.longitude,pin.latitude])
        .setPopup(new maplibregl.Popup({offset:18,closeButton:false}).setDOMContent(popupNode(pin.name)))
        .addTo(map);
      if(selected)marker.togglePopup();
    });
  });
}catch(error){fallback();}
</script></body></html>`;
}
