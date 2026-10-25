/* Local dashboard: cached device data only; no provider requests or credentials. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const svgNS = 'http://www.w3.org/2000/svg';
  let config = {}, latest = {}, rows = [], metric = 1, forecastType = 'daily';
  let daily = [], hourly = [], forecastMeta = {}, alertMeta = {}, alertEntries = [], reachable = true, statusKnown = false;
  let historyAttempt = 0, forecastAttempt = 0, alertAttempt = 0;
  let historyBusy = false, forecastBusy = false, alertBusy = false;
  const metricUnits=()=>config.units==='metric';
  const temperature=v=>metricUnits()?(v-32)/1.8:v;
  const wind=v=>metricUnits()?v*1.609344:v;
  const rain=v=>metricUnits()?v*25.4:v;
  const temperatureUnit=()=>metricUnits()?'°C':'°F',windUnit=()=>metricUnits()?'km/h':'mph';
  const series=(v,index)=>index===1?temperature(v):index===2?wind(v):v;
  const metricNames=()=>['','Temperature ('+temperatureUnit()+')','Wind peaks ('+windUnit()+')','Light (lx)','Humidity (%)'];
  const windDescription=value=>!metricUnits()?value:value.replace(/([\d.]+(?:\s+to\s+[\d.]+)?)\s*mph\b/g,part=>part.replace(/\d+(?:\.\d+)?/g,v=>Math.round(Number(v)*1.609344)).replace('mph','km/h'));

  const zones = {'EST5EDT,M3.2.0,M11.1.0':'America/New_York','CST6CDT,M3.2.0,M11.1.0':'America/Chicago','MST7MDT,M3.2.0,M11.1.0':'America/Denver','MST7':'America/Phoenix','PST8PDT,M3.2.0,M11.1.0':'America/Los_Angeles','UTC0':'UTC'};
  const zone = () => zones[config.timezone] || 'UTC';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const rounded = (value, digits = 1) => finite(value) ? value.toFixed(digits) : '—';
  const text = (id, value) => { $(id).textContent = value; };
  const clockOptions=()=>config.clock_24h?{hourCycle:'h23'}:{hour12:true};
  const time = seconds => seconds ? new Date(seconds * 1000).toLocaleString([], {timeZone:zone(),month:'short',day:'numeric',hour:'numeric',minute:'2-digit',...clockOptions()}) : 'Not yet checked';
  function headerTime(date) {
    const fields=new Intl.DateTimeFormat('en-US',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const part=name=>fields.find(p=>p.type===name).value;
    const day=part('day'),month=part('month');
    const prefix=config.date_format==='iso'?part('year')+'-'+month+'-'+day:config.date_format==='dm'?day+'/'+month:config.date_format==='text'?new Intl.DateTimeFormat('en-US',{timeZone:zone(),month:'short',day:'numeric'}).format(date):month+'/'+day;
    return prefix+' '+date.toLocaleTimeString('en-US',{timeZone:zone(),hour:'numeric',minute:'2-digit',...clockOptions()});
  }
  function uvLevel(value) {const index=Math.round(value);return index<3?'Low':index<6?'Moderate':index<8?'High':index<11?'Very High':'Extreme';}
  function element(tag, textValue, className) {
    const node = document.createElement(tag);
    if (textValue !== undefined) node.textContent = textValue;
    if (className) node.className = className;
    return node;
  }
  function svg(tag, attrs) {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }
  async function get(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try { return await api(path, {signal:controller.signal}); } finally { clearTimeout(timer); }
  }
  function applyTheme(id) {
    const choices=$('display_theme');
    const theme=Array.from(choices.options).some(option=>option.value===id)?id:'midnight';
    document.documentElement.dataset.theme=theme;
    drawHistory();renderForecast();updateSky();
  }
  const iconUrl=name=>'/assets/weather.png?theme='+encodeURIComponent(document.documentElement.dataset.theme||'midnight')+'&name='+name;
  function configure(value) {
    config = value;applyTheme(value.display_theme||'midnight');
    const setupComplete = !!value.ssid && !!value.location_set && value.station_confirmed!==false;
    $('onboarding').hidden = setupComplete;
    $('get-connected').hidden = setupComplete;
    text('onboarding-title', value.ssid ? 'Add your station location' : 'Set up your weather station');
    text('onboarding-message', value.ssid ? 'Station readings work locally. Add your location in Station & Wi-Fi to enable the local forecast, alerts, sun and moon.' : 'Start with Station & Wi-Fi: join your home network, confirm the Atlas sensor and choose your location. Sharing services are optional.');
    if (!value.ssid || value.station_confirmed===false) tab('station');
    if(value.station_confirmed===false){text('onboarding-title','Find your weather station');text('onboarding-message','Choose Find my station in Station & Wi-Fi. Detection can take up to 5 minutes; no sensor ID is needed.');}
    if(statusKnown)status(latest);
    drawHistory();
  }
  function status(value) {
    if(value.clock_valid&&!latest.clock_valid)historyAttempt=0;
    const moonChanged=value.moon_reference!==latest.moon_reference||value.moon_illumination!==latest.moon_illumination||value.moon_phase!==latest.moon_phase;
    latest = value;reachable = true;statusKnown = true;
    if(moonChanged)renderForecast();
    if(value.forecast_fetched!==undefined&&(value.forecast_fetched!==forecastMeta.daily?.fetched||value.hourly_fetched!==forecastMeta.hourly?.fetched||value.forecast_state!==forecastMeta.daily?.state||value.hourly_state!==forecastMeta.hourly?.state))forecastAttempt=0;
    if(value.alert_last_check!==undefined&&(value.alert_last_check!==alertMeta.checked||value.alert_state!==alertMeta.state))alertAttempt=0;
    const address=$('local-address');address.replaceChildren();
    const named=document.createElement('a');const host=typeof config.hostname==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(config.hostname)?config.hostname:'wxlink';
    const localUrl='http://'+host+'.local';named.href=localUrl+'/';named.textContent=localUrl;address.append(named);
    const ip=value.ip;
    if(typeof ip==='string'&&/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)){
      const fallback=document.createElement('a');fallback.href='http://'+ip+'/';fallback.textContent=ip;address.append(' · IP: ',fallback);
    }
    if(value.mdns_ready===false)address.append(' · Local name unavailable; use IP');
    const d = value.display || value, stale = d.stale_fields || 0;
    text('station-callsign', value.callsign || config.callsign || '');
    text('station-time',value.clock_valid?headerTime(new Date()):'Waiting for station clock');
    $('station-links').replaceChildren();
    const links = [['RF',!!value.radio_ready],['Wi-Fi',!!value.wifi],[value.aprs_profile === 'cwop' ? 'CWOP' : 'APRS',!!value.aprs_connected]];
    for (const [label, connected] of links) $('station-links').append(element('span', label + (connected ? ' ✓' : ' ×'), connected ? 'ok' : 'muted'));
    text('temperature', finite(d.temperature_F) ? rounded(temperature(d.temperature_F)) + ' '+temperatureUnit() : '—');
    $('temperature').classList.toggle('stale-reading', finite(d.temperature_F) && (!!(stale & 1) || ['Data stale','Disconnected','No signal'].includes(value.sensor_status)));
    text('wind', finite(d.wind_mph) ? rounded(wind(d.wind_mph)) + ' '+windUnit() : '—');
    const directions = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    text('direction', finite(d.direction_deg) ? directions[Math.round(d.direction_deg / 22.5) % 16] + ' · ' + Math.round(d.direction_deg) + '°' : 'Direction unavailable');
    const directionKnown=finite(d.direction_deg),directionStale=!!(stale&8)||['Data stale','Disconnected','No signal'].includes(value.sensor_status);
    $('wind-compass-arrow').toggleAttribute('hidden',!directionKnown);
    if(directionKnown)$('wind-compass-arrow').setAttribute('transform','rotate('+d.direction_deg+' 40 40)');
    $('wind-compass').classList.toggle('aged-reading',directionStale);
    $('wind-compass').setAttribute('aria-label',directionKnown?'Wind from '+$('direction').textContent+(directionStale?' · stale':''):'Wind direction unavailable');
    text('gust', finite(d.gust_mph) ? rounded(wind(d.gust_mph)) + ' '+windUnit() + (d.gust_partial ? ' *' : '') : '—');
    text('humidity', finite(d.humidity) ? Math.round(d.humidity) + ' %' : '—');
    text('rain', finite(value.rain_today_in) ? rounded(rain(value.rain_today_in), metricUnits()?1:2) + (metricUnits()?' mm':' in') + ((d.rain_partial ?? value.rain_partial) ? ' *' : '') : '—');
    text('lux', finite(d.lux) ? (d.lux >= 1000 ? rounded(d.lux / 1000) + ' klx' : Math.round(d.lux) + ' lx') : '— lx');
    text('uv', finite(d.uv)&&!(stale&32) ? 'UV ' + rounded(d.uv,0)+' '+uvLevel(d.uv) : 'UV —');
    for (const [id, bit] of [['humidity',2],['wind',4],['direction',8],['lux',16],['uv',32]]) $(id).classList.toggle('aged-reading', !!(stale & bit));
    text('pressure', value.nws_pressure_valid && finite(value.nws_pressure_pa) ? rounded(value.nws_pressure_pa / (metricUnits()?100:3386.389), metricUnits()?1:2) + (metricUnits()?' hPa':' inHg') : '—');
    text('pressure-source', value.nws_pressure_valid ? (value.nws_pressure_provider||'NWS')+' · ' + value.nws_pressure_station+(value.nws_pressure_altimeter?' · altimeter':'') : 'NWS · unavailable');
    text('sunmoon', value.sunrise ? 'Sunrise ' + time(value.sunrise) + ' · Sunset ' + time(value.sunset) + ' · ' + (value.moon_phase || 'Moon unavailable') + (finite(value.moon_illumination) && value.moon_illumination >= 0 ? ' (' + rounded(value.moon_illumination) + '%)' : '') : value.sun_state || 'Set your location for sun and moon data.');
    updateSky();
    renderAlertSummary();
    forecastSummary();
    refresh();
  }
  function offline() {
    reachable=false;
    text('source','Device unavailable · showing last received values');
    $('temperature').classList.add('stale-reading');
    $('wind-compass').classList.add('aged-reading');
    $('wind-compass').setAttribute('aria-label','Device unavailable · last received wind direction');
    $('sky').hidden = true;
    text('pressure','—');text('pressure-source','NWS · unverified');
    text('forecast-status','Device unavailable · forecast is unverified');
    text('alerts','Device unavailable · alert status is unverified');
    $('alerts-card').classList.add('alert-watch');
    text('station-alert','NWS · alert status unverified · device unavailable');$('station-alert').classList.add('alert-watch');
  }
  function drawHistory() {
    const chart = $('history-chart');chart.replaceChildren();
    const data = rows.filter(row => finite(row[metric]));
    chart.setAttribute('aria-label', metricNames()[metric] + ' over 24 hours, missing samples are gaps');
    if (!data.length) { if (rows.length) text('trend-status','No received samples for ' + metricNames()[metric].toLowerCase() + '.'); drawHome();return; }
    const values = data.map(row => series(row[metric],metric)), low = Math.min(...values), high = Math.max(...values), range = high > low ? high - low : 1;
    text('trend-status',metricNames()[metric] + ' · ' + rounded(low) + ' to ' + rounded(high) + ' · ' + data.length + ' observed minutes');
    const x = i => 62 + i * 874 / 1439, y = value => 218 - (value - low) * 185 / range;
    for (const value of [low, high]) {
      chart.append(svg('line',{x1:62,y1:y(value),x2:936,y2:y(value),stroke:'var(--line)'}));
      const label = svg('text',{x:54,y:y(value)+5,'text-anchor':'end',fill:'var(--muted)','font-size':14});label.textContent=rounded(value);chart.append(label);
    }
    let path = '', connected = false;
    rows.forEach((row,i) => {
      if (!finite(row[metric])) { connected=false;return; }
      path += (connected ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(series(row[metric],metric)).toFixed(2);
      if (!connected && (!rows[i+1] || !finite(rows[i+1][metric]))) chart.append(svg('circle',{cx:x(i),cy:y(row[metric]),r:2,fill:'var(--cyan)'}));
      connected=true;
    });
    chart.append(svg('path',{d:path,fill:'none',stroke:'var(--cyan)','stroke-width':2,'data-series':'observed'}));
    for (const i of [0,720,1439]) {
      const label=svg('text',{x:x(i),y:251,'text-anchor':i===0?'start':i===1439?'end':'middle',fill:'var(--muted)','font-size':14});label.textContent=time(rows[i][0]*60);chart.append(label);
    }
    drawHome();
  }
  function drawHome() {
    const chart=$('home-trend');chart.replaceChildren();
    const data=rows.slice(-60), values=data.filter(row=>finite(row[1])).map(row=>row[1]);
    if (values.length<2)return;
    const low=Math.min(...values),high=Math.max(...values),range=high>low?high-low:1;
    let path='';data.forEach((row,i)=>{if(finite(row[1]))path+=(path?'L':'M')+(i*596/59).toFixed(2)+','+(52-(row[1]-low)*40/range).toFixed(2);});
    chart.append(svg('path',{d:path,fill:'none',stroke:'var(--cyan)','stroke-width':2}));
  }
  async function history() {
    if(historyBusy)return;historyBusy=true;historyAttempt=Date.now();text('trend-status','Refreshing received history…');
    try {
      let end, offset=0;const next=[];
      do {
        const page=await get('/api/history?offset='+offset+'&count=120'+(end===undefined?'':'&end='+end));
        if(!Number.isSafeInteger(page.end)||page.total!==1440||!Array.isArray(page.rows)||page.next_offset<=offset||page.next_offset>1440||page.rows.length!==page.next_offset-offset)throw Error('Invalid history page');
        if(end!==undefined&&end!==page.end)throw Error('History window changed');end=page.end;
        for(const row of page.rows)if(!Array.isArray(row)||row.length!==5||!Number.isSafeInteger(row[0])||row[0]!==end-1439+next.length||row.slice(1).some(v=>v!==null&&!finite(v)))throw Error('Invalid history samples');else next.push(row);
        offset=page.next_offset;
      }while(offset<1440);
      rows=next;drawHistory();
    }catch(e){text('trend-status','History unavailable · '+e.message+(rows.length?' · previous chart retained':''));}finally{historyBusy=false;}
  }
  $('history-chart').addEventListener('pointermove', inspect);
  $('history-chart').addEventListener('pointerdown', inspect);
  function inspect(event) {
    if(!rows.length)return;const box=$('history-chart').getBoundingClientRect(),x=(event.clientX-box.left)*960/box.width;
    const i=Math.max(0,Math.min(1439,Math.round((x-62)*1439/874))),row=rows[i];
    text('trend-reading',time(row[0]*60)+' · '+(finite(row[metric])?rounded(series(row[metric],metric))+' '+metricNames()[metric].match(/\((.*)\)/)[1]:'No received sample'));
  }
  async function periods(type) {
    let offset=0,total;const result=[];let metadata;
    do {
      const page=await get('/api/forecast?type='+type+'&offset='+offset);
      if(!Array.isArray(page.periods)||!Number.isInteger(page.total)||page.total<0||page.total>(type==='daily'?14:24)||page.next_offset!==Math.min(offset+4,page.total)||page.periods.length!==page.next_offset-offset)throw Error('Invalid forecast page');
      if(metadata&&(metadata.fetched!==page.fetched||metadata.issued!==page.issued))throw Error('Forecast updated during download; retry shortly');
      if(total!==undefined&&total!==page.total)throw Error('Forecast updated during download; retry shortly');
      total=page.total;metadata=metadata||page;result.push(...page.periods);offset=page.next_offset;
    }while(offset<total);
    return {periods:result,metadata};
  }
  async function forecast() {
    if(forecastBusy)return;forecastBusy=true;forecastAttempt=Date.now();
    try { const d=await periods('daily'),h=await periods('hourly');daily=d.periods;hourly=h.periods;forecastMeta={daily:d.metadata,hourly:h.metadata};renderForecast();updateSky(); }
    catch(e){text('forecast-status','Forecast unavailable · '+e.message);}finally{forecastBusy=false;}
  }
  function renderForecast() {
    const list=forecastType==='daily'?daily:hourly,meta=forecastMeta[forecastType];$('forecast-periods').replaceChildren();$('forecast-periods').classList.toggle('hourly',forecastType==='hourly');
    forecastSummary();
    if(!list.length){text('forecast-status',meta?meta.state:'No forecast available. Set your station location.');return;}
    const now=Date.now()/1000;
    for(const period of list.filter(p=>p.end>now)){
      const card=element('article',undefined,'forecast-period');const heading=element('div',undefined,'forecast-heading');heading.append(element('h3',period.name));heading.append(forecastArt(period));card.append(heading);
      card.append(element('div',finite(period.temperature_F)?rounded(temperature(period.temperature_F))+' '+temperatureUnit():'Temperature unavailable','forecast-temp'));
      card.append(element('p',period.short));card.append(element('p','Wind '+windDescription(period.wind||'unavailable'),'muted'));
      if(finite(period.rain_probability)&&period.rain_probability>=0)card.append(element('p','Rain chance '+Math.round(period.rain_probability)+'%','muted'));
      const normalizedForecast=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
      if(normalizedForecast(period.detail)&&normalizedForecast(period.detail)!==normalizedForecast(period.short)){const detail=element('details');detail.open=period===list[0];detail.append(element('summary','Full forecast'));detail.append(element('p',period.detail,'detail'));card.append(detail);}
      card.append(element('small',time(period.start)+' – '+time(period.end)));$('forecast-periods').append(card);
    }
  }
  function forecastSummary() {
    const meta=forecastMeta[forecastType];
    if(!meta)return;
    const state=forecastType==='daily'?latest.forecast_state:latest.hourly_state;
    const fresh=reachable&&latest.wifi&&latest.clock_valid&&meta.fresh&&Date.now()/1000-meta.fetched<7200&&(state===undefined||state==='Current');
    text('forecast-status',(!statusKnown&&reachable?'Checking device connection · ':fresh?'Updated ':'Cached / unverified · ')+time(meta.issued||meta.fetched)+' · '+(state||meta.state));
  }
  async function alerts() {
    if(alertBusy)return;alertBusy=true;alertAttempt=Date.now();
    try {
      let offset=0,metadata;const entries=[];
      do {
        const page=await get('/api/alerts?offset='+offset);
        if(!Array.isArray(page.alerts)||!Number.isInteger(page.total)||page.total<0||page.total>8||page.next_offset>8||page.next_offset!==Math.min(offset+1,page.total))throw Error('Invalid alert page');
        if(metadata&&(metadata.revision!==page.revision||metadata.checked!==page.checked||metadata.total!==page.total))throw Error('Alerts updated during download; retry shortly');
        metadata=metadata||page;entries.push(...page.alerts);offset=page.next_offset;
      }while(offset<metadata.total);
      alertMeta=metadata;alertEntries=entries;$('alert-details').replaceChildren();renderAlertSummary();
      for(const entry of entries){const detail=element('details',undefined,'alert-entry');detail.append(element('summary',entry.headline||entry.event));detail.append(element('h3',entry.event));if(!metadata.fresh)detail.append(element('p','Last known alert · current status is unverified','feedback'));detail.append(element('p',entry.description));if(entry.instruction)detail.append(element('p',entry.instruction));detail.append(element('small','Expires '+time(entry.expires)));$('alert-details').append(detail);}
    }catch(e){text('alerts','Alert status unverified · '+e.message);$('alerts-card').classList.add('alert-watch');}finally{alertBusy=false;}
  }
  function renderAlertSummary() {
    if(!Object.keys(alertMeta).length)return;
    const now=Date.now()/1000,expired=alertEntries.some(entry=>entry.expires&&entry.expires<=now);
    const fresh=reachable&&latest.wifi&&latest.clock_valid&&alertMeta.fresh&&now>=alertMeta.checked&&now-alertMeta.checked<180&&!expired;
    const summary=fresh?(alertEntries.length?alertEntries.length+' active alert'+(alertEntries.length===1?'':'s'):'No active alerts'):'Alert status unverified · '+(!reachable?'Device unavailable':!statusKnown?'Checking device connection':!latest.wifi?'Wi-Fi unavailable':!latest.clock_valid?'Waiting for station clock':alertMeta.state);
    text('alerts',summary+(alertMeta.truncated?' · more alerts may exist':'')+' · checked '+time(alertMeta.checked));
    text('station-alert','NWS · '+(alertEntries.length?(fresh?'':'UNVERIFIED · ')+(alertEntries[0].event||'Last known alert'):summary));
    for(const target of [$('alerts-card'),$('station-alert')]){target.classList.toggle('alert-warning',alertMeta.theme>=3);target.classList.toggle('alert-watch',alertMeta.theme===2||(!fresh&&(statusKnown||!reachable)));}
  }
  function classify(value) {
    const t=(value||'').toLowerCase();
    if(/thunder/.test(t))return 'thunderstorm';if(/snow|sleet|freezing|wintry|ice/.test(t))return 'snow';if(/rain|shower|drizzle/.test(t))return 'rain';if(/fog|haze|smoke/.test(t))return 'fog';if(/partly|mostly sunny/.test(t))return 'partly-cloudy';if(/cloud|overcast/.test(t))return 'cloudy';if(/wind|breezy/.test(t))return 'windy';if(/sunny|clear/.test(t))return 'sunny';return 'unknown';
  }
  function moon(illumination,waning,southern,cloudy) {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');
    const left=waning!==southern,lowLight=document.documentElement.dataset.theme==='night';
    const shadeColor=shade=>lowLight?'rgb('+[173,135,83].map(value=>Math.round(value*shade/242)).join(',')+')':'rgb('+shade+','+shade+','+shade+')';
    for(let y=-25;y<=25;y++){const half=Math.sqrt(625-y*y);for(let x=-Math.floor(half);x<=Math.floor(half);x++){
      const lit=illumination>=0&&(left?x<=-(1-2*illumination/100)*half:x>=(1-2*illumination/100)*half);
      let shade=lit?230:47;
      if(lit)for(const c of [[-.36,-.28,.25,.20],[.28,.10,.21,.28],[-.12,.49,.17,.14],[.43,-.48,.13,.13],[-.58,.17,.12,.15]]){const d=((x/25-c[0])/c[2])**2+((y/25-c[1])/c[3])**2;if(d<.65)shade=181;else if(d<1)shade=204;}
      ctx.fillStyle=shadeColor(shade);ctx.fillRect(x+32,y+30,1,1);
    }}
    ctx.strokeStyle=shadeColor(143);ctx.beginPath();ctx.arc(32,30,25,0,2*Math.PI);ctx.stroke();
    if(illumination<0){ctx.fillStyle=lowLight?'#98794e':'#a5b6c8';ctx.font='24px sans-serif';ctx.fillText('?',25,38);}
    if(cloudy){ctx.fillStyle=lowLight?'#98794e':'#a5b6c8';ctx.beginPath();ctx.ellipse(42,47,20,11,0,0,2*Math.PI);ctx.fill();}
    return canvas.toDataURL();
  }
  function forecastMoon(period) {
    if(!finite(latest.moon_illumination)||latest.moon_illumination<0||latest.moon_illumination>100||!finite(latest.moon_reference)||latest.moon_reference<=0||!finite(period.start)||!finite(period.end)||period.end<=period.start)return {illumination:-1,waning:false};
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=name=>parts.find(p=>p.type===name).value;
    if(latest.sun_day!==Number(part('year')+part('month')+part('day')))return {illumination:-1,waning:false};
    const elapsed=(period.start+period.end)/2-latest.moon_reference;
    if(elapsed < -86400||elapsed>8*86400)return {illumination:-1,waning:false};
    let angle=Math.acos(1-2*latest.moon_illumination/100);
    if(/Waning|Last Quarter/.test(latest.moon_phase||''))angle=2*Math.PI-angle;
    angle=((angle+2*Math.PI*elapsed/(29.530588*86400))%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    return {illumination:50*(1-Math.cos(angle)),waning:angle>Math.PI};
  }
  function forecastArt(period) {
    const kind=classify(period.short),night=period.daytime_known&&!period.daytime,sky=['sunny','partly-cloudy','cloudy'].includes(kind);
    const art=element('span',undefined,'forecast-art'),image=document.createElement('img');
    image.alt='NWS forecast: '+period.short+(night?' · night':'');
    const phase=forecastMoon(period);
    image.src=kind==='unknown'?iconUrl('unknown'):night?moon(phase.illumination,phase.waning,config.latitude<0,false):iconUrl('sunny');
    if(!sky&&kind!=='unknown')image.className='small-celestial';
    art.append(image);
    if(kind!=='sunny'&&kind!=='unknown'){const cloud=document.createElement('img');cloud.src=iconUrl(sky?'cloudy':kind);cloud.alt='';cloud.className='cloud-overlay';art.append(cloud);}
    return art;
  }
  function updateSky() {
    if(reachable&&latest.clock_valid&&latest.source==='radio'&&latest.lux_cloud_valid){
      const kinds={1:'sunny',2:'partly-cloudy',3:'cloudy'},kind=kinds[latest.lux_cloud_kind];
      if(kind){const image=$('sky-image'),cloud=$('sky-cloud');image.classList.remove('small-celestial');
        image.src=iconUrl('sunny');image.alt='Experimental light estimate: '+(latest.lux_cloud_label||kind);
        cloud.hidden=kind==='sunny';if(!cloud.hidden)cloud.src=iconUrl('cloudy');
        $('sky').querySelector('small').textContent='LUX*';$('sky').hidden=false;return;}
    }
    $('sky').querySelector('small').textContent='NWS';
    const now=Date.now()/1000,meta=forecastMeta.hourly,p=hourly.find(p=>p.start<=now&&p.end>now);
    $('sky').hidden=true;
    if(!latest.wifi||!latest.clock_valid||!meta?.fresh||now-meta.fetched>=7200||!p||(latest.hourly_state!==undefined&&latest.hourly_state!=='Current'))return;
    let day=p.daytime;
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=name=>parts.find(p=>p.type===name).value;
    const solarCurrent=latest.sun_day===Number(part('year')+part('month')+part('day'));
    if(solarCurrent&&latest.solar_mode==='midnight_sun')day=true;
    else if(solarCurrent&&latest.solar_mode==='polar_night')day=false;
    else if(solarCurrent&&latest.sunrise&&latest.sunset)day=now>=latest.sunrise&&now<latest.sunset;
    else if(!p.daytime_known)return;
    const kind=classify(p.short),image=$('sky-image');
    const sky=['sunny','partly-cloudy','cloudy'].includes(kind);
    const src=!day&&kind!=='unknown'?moon(solarCurrent?latest.moon_illumination:-1,/Waning|Last Quarter/.test(latest.moon_phase||''),config.latitude<0,false):iconUrl(kind==='unknown'?'unknown':'sunny');
    image.classList.toggle('small-celestial',!sky&&kind!=='unknown');
    const cloud=$('sky-cloud');cloud.hidden=!(kind!=='sunny'&&kind!=='unknown');if(!cloud.hidden)cloud.src=iconUrl(sky?'cloudy':kind);
    if(image.getAttribute('src')!==src)image.src=src;
    image.alt='NWS forecast: '+p.short+(!day?' · night':'');$('sky').hidden=false;
  }
  function refresh() {
    if(document.hidden||!$('overview').classList.contains('active')||busy)return;
    const now=Date.now();if(now-historyAttempt>=60000)history();if(now-forecastAttempt>=300000)forecast();if(now-alertAttempt>=30000)alerts();
  }
  document.querySelectorAll('[data-metric]').forEach(button=>button.onclick=()=>{metric=Number(button.dataset.metric);document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',b===button));drawHistory();});
  document.querySelectorAll('[data-forecast]').forEach(button=>button.onclick=()=>{forecastType=button.dataset.forecast;document.querySelectorAll('[data-forecast]').forEach(b=>b.setAttribute('aria-pressed',b===button));renderForecast();});
  $('history-refresh').onclick=()=>history();
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>refresh()));
  document.addEventListener('visibilitychange',refresh);
  $('display_theme').addEventListener('change',event=>applyTheme(event.target.value));
  window.WXDashboard={configure,status,offline,applyTheme};
  if(window.wxConfig)configure(window.wxConfig);
  if(window.wxStatus)status(window.wxStatus);
  if(window.wxStatusUnavailable)offline();
  refresh();
})();
