export function canTriggerEvent(country, event){
  return !!country && !!event && !country.eventsSeen?.includes(event.id);
}
