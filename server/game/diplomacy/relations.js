export function relationValue(country, target){
  return Number(country?.relations?.[target] || 0);
}
