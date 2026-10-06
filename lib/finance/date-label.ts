import {dateOnly,manilaToday} from './core';
export function activityDateLabel(value:string,today=manilaToday()){
 dateOnly.parse(value);dateOnly.parse(today);
 if(value===today)return 'Today';
 const yesterday=new Date(`${today}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);
 if(value===yesterday.toISOString().slice(0,10))return 'Yesterday';
 return new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
}
