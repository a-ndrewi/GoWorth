export type TripMapPoint = { id: string; name: string; latitude: number; longitude: number };
export type TripMapData = {
  cities: TripMapPoint[];
  /** Planned activities in day order; drawn as numbered pins joined by the day's route. */
  planned: TripMapPoint[];
  suggestions: (TripMapPoint & { color: string })[];
  selectedId?: string;
  /** Changes when the map should re-frame everything (new day or new results). */
  frameKey: string;
};

/**
 * A GoWorth-styled map: OpenFreeMap vector tiles repainted in the app palette, with points of interest from
 * the base map hidden so only the trip's own pins are shown. Updates arrive through `window.goworthUpdate`
 * (native) or `postMessage` (web), so the map never reloads while the user browses.
 */
export function tripMapHtml(language: "en" | "ro") {
  const copy = language === "ro"
    ? { loading: "Se încarcă harta…", unavailable: "Harta nu este disponibilă acum" }
    : { loading: "Loading map…", unavailable: "Map unavailable right now" };
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.css" />
<style>
  html,body{height:100%;width:100%;margin:0;background:#F3F6FB;overflow:hidden;overscroll-behavior:none;touch-action:none;font-family:system-ui,-apple-system,sans-serif}
  #map{position:fixed;inset:0}
  #loading{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;color:#667085;font-size:13px;background:#F3F6FB;pointer-events:none;transition:opacity .3s}
  .pin{border:0;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s cubic-bezier(.3,1.6,.5,1)}
  .pin:active{transform:scale(.88)}
  .planned{width:28px;height:28px;border-radius:14px;background:#2457E6;color:#fff;font:800 12px system-ui;border:3px solid #fff;box-shadow:0 3px 10px rgba(36,87,230,.45)}
  .idea{width:18px;height:18px;border-radius:9px;background:#fff;box-shadow:0 2px 8px rgba(19,34,56,.25)}
  .idea i{width:8px;height:8px;border-radius:4px;display:block}
  .selected{transform:scale(1.35);z-index:3}
  .maplibregl-ctrl-attrib{font-size:9px!important;background:rgba(255,255,255,.85)!important}
  .city{z-index:0;opacity:.92;padding:5px 10px;border-radius:12px;background:#132238;color:#fff;font:800 11px system-ui;box-shadow:0 3px 10px rgba(19,34,56,.3);pointer-events:none;white-space:nowrap}
  .label{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);padding:5px 9px;border-radius:9px;background:#fff;color:#132238;font:700 12px system-ui;white-space:nowrap;box-shadow:0 3px 12px rgba(19,34,56,.2);pointer-events:none;max-width:200px;overflow:hidden;text-overflow:ellipsis}
</style></head>
<body><div id="map"></div><div id="loading">${copy.loading}</div>
<script src="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.js"></script>
<script>
const loading=document.getElementById('loading');
let map=null,ready=false,pending=null,markers=[],lastFrame='';
function send(id){const m=JSON.stringify({type:'select',id});if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(m);if(window.parent!==window)window.parent.postMessage(m,'*');}
function paint(){
  // Repaint whichever layers the base style has, by type and name, in the GoWorth palette.
  for(const layer of map.getStyle().layers){
    const id=layer.id;
    try{
      if(layer.type==='symbol'&&/poi|transit|aeroway|housenumber|mountain|place_(city|town|village|hamlet|suburb|neighbourhood)|place-(city|town|village)|label_(city|town|village|other)/.test(id)){map.setLayoutProperty(id,'visibility','none');continue;}
      if(layer.type==='background')map.setPaintProperty(id,'background-color','#F3F6FB');
      else if(layer.type==='fill'&&/water/.test(id))map.setPaintProperty(id,'fill-color','#C9DAFF');
      else if(layer.type==='line'&&/water/.test(id))map.setPaintProperty(id,'line-color','#B3CAFB');
      else if(layer.type==='fill'&&/park|wood|grass|landcover|landuse/.test(id))map.setPaintProperty(id,'fill-color','#E3F3EA');
      else if(layer.type==='fill'&&/building/.test(id))map.setPaintProperty(id,'fill-color','#E8ECF4');
      else if(layer.type==='line'&&/motorway|trunk|primary/.test(id))map.setPaintProperty(id,'line-color','#DCE5FA');
      else if(layer.type==='line'&&/road|street|minor|secondary|tertiary|service|path/.test(id))map.setPaintProperty(id,'line-color','#FFFFFF');
      else if(layer.type==='line'&&/boundary/.test(id))map.setPaintProperty(id,'line-color','#B9C6DD');
      else if(layer.type==='symbol'){map.setPaintProperty(id,'text-color','#667085');map.setPaintProperty(id,'text-halo-color','#F3F6FB');}
    }catch(e){}
  }
}
function node(cls,html){const el=document.createElement('button');el.type='button';el.className='pin '+cls;el.innerHTML=html||'';return el;}
function update(data){
  if(!ready){pending=data;return;}
  markers.forEach(m=>m.remove());markers=[];
  const bounds=new maplibregl.LngLatBounds();
  data.cities.forEach(c=>{const el=document.createElement('div');el.className='city';el.textContent=c.name;markers.push(new maplibregl.Marker({element:el,offset:[0,-2]}).setLngLat([c.longitude,c.latitude]).addTo(map));bounds.extend([c.longitude,c.latitude]);});
  const add=(p,el)=>{
    el.setAttribute('aria-label',p.name);
    if(p.id===data.selectedId){el.classList.add('selected');const l=document.createElement('span');l.className='label';l.textContent=p.name;el.appendChild(l);}
    el.onclick=(e)=>{e.stopPropagation();send(p.id);};
    markers.push(new maplibregl.Marker({element:el}).setLngLat([p.longitude,p.latitude]).addTo(map));
    bounds.extend([p.longitude,p.latitude]);
  };
  data.suggestions.forEach(p=>add(p,node('idea','<i style="background:'+p.color+'"></i>')));
  data.planned.forEach((p,i)=>add(p,node('planned',String(i+1))));
  const route={type:'Feature',geometry:{type:'LineString',coordinates:data.planned.map(p=>[p.longitude,p.latitude])}};
  map.getSource('route').setData(data.planned.length>1?route:{type:'FeatureCollection',features:[]});
  const selected=[...data.planned,...data.suggestions].find(p=>p.id===data.selectedId);
  if(selected)map.easeTo({center:[selected.longitude,selected.latitude],zoom:Math.max(map.getZoom(),14),duration:500});
  else if(data.frameKey!==lastFrame&&!bounds.isEmpty())map.fitBounds(bounds,{padding:{top:46,bottom:30,left:30,right:30},maxZoom:14,duration:lastFrame?600:0});
  lastFrame=data.frameKey;
}
window.goworthUpdate=update;
window.addEventListener('message',e=>{try{const m=typeof e.data==='string'?JSON.parse(e.data):e.data;if(m&&m.type==='update')update(m.data);}catch(err){}});
try{
  // MapLibre 5 no longer ships maplibregl.supported(), so check for WebGL directly.
  const canvas=document.createElement('canvas');
  if(!window.maplibregl||!(canvas.getContext('webgl2')||canvas.getContext('webgl')))throw new Error('WebGL unavailable');
  map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/positron',center:[12,42],zoom:4,attributionControl:false,dragRotate:false,pitchWithRotate:false});
  map.touchZoomRotate.disableRotation();
  // Credit stays reachable behind the compact "i" but starts folded; MapLibre unfolds it once the style's attribution arrives.
  map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');
  const foldAttribution=()=>{
    const attrib=document.querySelector('.maplibregl-ctrl-attrib');
    if(!attrib||!attrib.classList.contains('maplibregl-compact'))return;
    attrib.removeAttribute('open');attrib.classList.remove('maplibregl-compact-show');
    if(!attrib.dataset.watched){attrib.dataset.watched='1';attrib.addEventListener('click',()=>map.off('idle',foldAttribution),{once:true});}
  };
  map.on('idle',foldAttribution);
  map.on('click',()=>send(''));
  const slow=setTimeout(()=>{if(!ready)loading.textContent=${JSON.stringify(copy.unavailable)};},15000);
  map.on('load',()=>{
    clearTimeout(slow);loading.textContent='';
    paint();
    map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'goworth-route',type:'line',source:'route',paint:{'line-color':'#2457E6','line-width':3,'line-opacity':.7,'line-dasharray':[1.5,1.5]},layout:{'line-cap':'round','line-join':'round'}});
    ready=true;loading.style.opacity=0;setTimeout(()=>loading.remove(),300);
    if(pending){update(pending);pending=null;}
  });
  new ResizeObserver(()=>map.resize()).observe(document.getElementById('map'));
}catch(error){loading.textContent=${JSON.stringify(copy.unavailable)};}
</script></body></html>`;
}
