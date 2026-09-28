function dateMs(v:string){const s=String(v||"").slice(0,10);const t=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(t)?t:NaN}

export function isoToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}

export function daysBetween(a:string,b:string){const x=dateMs(a),y=dateMs(b);return Number.isFinite(x)&&Number.isFinite(y)?Math.round((y-x)/86400000):0}

export function contractDurationText(start:string,end:string){
  const d=daysBetween(start,end);if(d<=0)return "—";
  if(d>=330){const months=Math.round(d/30.4375);return `${months} Ay`;}
  return `${d} Gün`;
}

export function parseThresholds(value:unknown,fallback:number[]){
  const a=String(value??"").split(/[,;\s]+/).map(Number).filter(x=>Number.isFinite(x)&&x>=0);
  return a.length?Array.from(new Set(a)).sort((x,y)=>y-x):fallback;
}

export function crossedDueStage(remainingDays:number,thresholds:number[]){
  const passed=thresholds.filter(x=>remainingDays<=x&&remainingDays>=0).sort((a,b)=>a-b);
  return passed.length?`DUE_${passed[0]}`:remainingDays<0?"EXPIRED":null;
}
