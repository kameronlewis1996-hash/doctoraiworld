(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAIMedicationSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function parseDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y,m,d] = value.split('-').map(Number);
    const date = new Date(y,m-1,d,12);
    return y >= 1900 && y <= 2200 && date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? date : null;
  }
  const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function monthDays(day) {
    const date=parseDay(day); if(!date)return [];
    const result=[]; const end=new Date(date.getFullYear(),date.getMonth()+1,0,12).getDate();
    for(let d=1;d<=end;d++)result.push(localDay(new Date(date.getFullYear(),date.getMonth(),d,12)));
    return result;
  }
  function navigateDay(day, key) {
    const date = parseDay(day); if (!date) return null;
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (Object.hasOwn(offsets, key)) date.setDate(date.getDate() + offsets[key]);
    else if (key === 'Home') date.setDate(1);
    else if (key === 'End') date.setMonth(date.getMonth() + 1, 0);
    else if (key === 'PageUp' || key === 'PageDown') {
      const originalDay = date.getDate(); date.setDate(1);
      date.setMonth(date.getMonth() + (key === 'PageUp' ? -1 : 1));
      date.setDate(Math.min(originalDay, new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate()));
    } else return null;
    return date.getFullYear() < 1900 || date.getFullYear() > 2200 ? null : localDay(date);
  }
  function dayPlan(records, selectedIds, day) {
    if(!parseDay(day))return { timed:[], needsReview:[], outside:[] };
    const selected=new Set(selectedIds || []), result={timed:[],needsReview:[],outside:[]};
    for(const med of Array.isArray(records)?records:[]) {
      if(!med || !selected.has(med.id))continue;
      const item={id:String(med.id),name:String(med.name || 'Unnamed medicine'),time:'',note:''};
      if(med.deleted===true || med.dismissed===true || med.archived===true || med.active===false || ['stopped','archived','inactive','deleted','dismissed','discontinued','completed','resolved'].includes(String(med.status||'').trim().toLowerCase())) {
        item.note='Not an active saved medicine. No taking schedule shown.';result.outside.push(item);continue;
      }
      const start=parseDay(med.startDate),end=med.endDate?parseDay(med.endDate):null;
      if(!start || (med.endDate && !end) || (end && med.endDate<med.startDate)) {
        item.note='A valid start date and any end date need checking before calendar timing can be shown.';result.needsReview.push(item);continue;
      }
      if(day<med.startDate || (end && day>med.endDate)){item.note='Outside the saved start/end dates.';result.outside.push(item);continue;}
      if(med.frequency==='As needed'){item.note='As needed: no automatic times. Follow your own label or prescription.';result.needsReview.push(item);continue;}
      if(med.frequency==='Weekly'){item.note='Weekly timing needs confirmation: no weekday or dose date is inferred from the start date.';result.needsReview.push(item);continue;}
      if(!['Once daily','Twice daily'].includes(med.frequency) || typeof med.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(med.time||''))){item.note='No complete daily frequency and time saved. Check the original directions; do not guess.';result.needsReview.push(item);continue;}
      item.time=med.time;
      item.note=med.frequency==='Twice daily'?'Saved time only — the second daily time is not recorded. This is not the complete schedule.':'Saved daily time. Follow the original label or prescription.';
      result.timed.push(item);
      if(med.frequency==='Twice daily')result.needsReview.push({...item,time:'',note:'Second daily time missing. DoctorAI does not choose an interval or another dose time.'});
    }
    result.timed.sort((a,b)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
    return result;
  }
  return {parseDay,localDay,monthDays,navigateDay,dayPlan};
});
