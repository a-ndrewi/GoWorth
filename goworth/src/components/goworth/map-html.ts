import type { MapPin } from "@/data/map";

export function mapHtml(pins: MapPin[], selected?: MapPin, language: "en" | "ro" = "en") {
  const copy = language === "ro"
    ? { loading: "Se încarcă harta...", unavailable: "Harta nu este disponibilă acum", imagery: "Imaginile hărții nu sunt disponibile acum" }
    : { loading: "Loading map...", unavailable: "Map unavailable right now", imagery: "Map imagery is unavailable right now" };
  const data = JSON.stringify({ pins, selected }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#map{height:100%;width:100%;margin:0;background:#edf5f2;overscroll-behavior:none;touch-action:none}
  body{font-family:system-ui,-apple-system,sans-serif}
  #loading{position:absolute;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:#edf5f2;color:#47635d;font-size:13px;pointer-events:none}
  .marker{width:27px;height:27px;border:3px solid white;border-radius:50%;background:#008e75;box-shadow:0 2px 9px #12372a66;cursor:pointer;padding:0;color:white;font-weight:800;font-size:11px;line-height:21px;text-align:center}
  .marker.place,.marker.search{background:#ee5d8d;width:20px;height:20px}
  .marker.selected{width:29px;height:29px;border:4px solid white;box-shadow:0 0 0 3px #2563ff,0 3px 12px #12372a66;z-index:10}
  .brand-pin{background:transparent;border:0}.brand-pin .marker{display:block;box-sizing:border-box}
  .maplibregl-popup-content,.leaflet-popup-content-wrapper{font:600 13px system-ui,-apple-system,sans-serif;color:#0b2545;border-radius:6px}
  .maplibregl-ctrl-attrib,.leaflet-control-attribution{font-size:10px!important;background:#fffffff0!important;color:#284c49!important}
  .leaflet-tile-pane{filter:saturate(.75) hue-rotate(12deg) contrast(.97)}
</style>
</head><body><div id="map"></div><div id="loading">${copy.loading}</div>
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
  if(!window.L){loading.textContent=${JSON.stringify(copy.unavailable)};return;}
  document.getElementById('map').replaceChildren();
  const map=L.map('map',{scrollWheelZoom:false,zoomControl:true}).setView(
    data.selected?[data.selected.latitude,data.selected.longitude]:[25,12],
    data.selected?(data.selected.kind==='destination'?11:15):2
  );
  map.attributionControl.setPrefix(false);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'&copy; OpenStreetMap contributors'
  });
  let loadedTiles=0;
  const tileTimeout=setTimeout(()=>{loading.textContent=${JSON.stringify(copy.imagery)};},10000);
  tiles.on('tileload',()=>{loadedTiles++;});
  tiles.on('load',()=>{
    clearTimeout(tileTimeout);
    if(loadedTiles)loading.remove();
    else loading.textContent=${JSON.stringify(copy.imagery)};
  });
  tiles.addTo(map);
  allPins.forEach(pin=>{
    const selected=!!data.selected&&pin.id===data.selected.id;
    const markerNode=document.createElement('span');
    markerNode.className='marker '+(pin.kind||'destination')+(selected?' selected':'');
    markerNode.textContent=pin.kind==='destination'?pin.name.charAt(0).toUpperCase():'';
    const size=selected?29:pin.kind==='destination'?27:20;
    const icon=L.divIcon({className:'brand-pin',html:markerNode,iconSize:[size,size],iconAnchor:[size/2,size/2]});
    const marker=L.marker([pin.latitude,pin.longitude],{icon}).addTo(map)
      .bindPopup(popupNode(pin.name)).on('click',()=>notify(pin));
    if(selected)marker.openPopup();
  });
  if(!data.selected&&allPins.length)map.fitBounds(L.latLngBounds(allPins.map(pin=>[pin.latitude,pin.longitude])),{padding:[25,25]});
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
  map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-left');
  let loaded=false;
  const timeout=setTimeout(()=>{if(!loaded){map.remove();fallback();}},8000);
  map.on('load',()=>{
    loaded=true;clearTimeout(timeout);loading.remove();
    const colors={
      background:['background-color','#edf5f2'],park:['fill-color','#b9dec9'],
      landcover_wood:['fill-color','#a7d3b8'],landcover_grass:['fill-color','#d4ebcb'],
      water:['fill-color','#afd9e1'],waterway_river:['line-color','#80c2d0'],
      building:['fill-color','#d9e5df'],road_motorway:['line-color','#f2ad7b'],
      road_trunk_primary:['line-color','#f5c1a0'],road_secondary_tertiary:['line-color','#fff8ed'],
      road_minor:['line-color','#ffffff']
    };
    Object.entries(colors).forEach(([id,[property,color]])=>{
      try{if(map.getLayer(id))map.setPaintProperty(id,property,color);}catch(error){}
    });
    try{map.setPaintProperty('natural_earth','raster-opacity',.68);}catch(error){}
    if(!data.selected&&allPins.length){
      const bounds=new maplibregl.LngLatBounds();
      allPins.forEach(pin=>bounds.extend([pin.longitude,pin.latitude]));
      map.fitBounds(bounds,{padding:32,maxZoom:5,duration:0});
    }
    allPins.forEach(pin=>{
      const selected=!!data.selected&&pin.id===data.selected.id;
      const button=document.createElement('button');
      button.type='button';button.className='marker '+(pin.kind||'destination')+(selected?' selected':'');
      button.setAttribute('aria-label',pin.name);button.textContent=pin.kind==='destination'?pin.name.charAt(0).toUpperCase():'';button.onclick=()=>notify(pin);
      const marker=new maplibregl.Marker({element:button}).setLngLat([pin.longitude,pin.latitude])
        .setPopup(new maplibregl.Popup({offset:18,closeButton:false}).setDOMContent(popupNode(pin.name)))
        .addTo(map);
      if(selected)marker.togglePopup();
    });
  });
}catch(error){fallback();}
</script></body></html>`;
}
