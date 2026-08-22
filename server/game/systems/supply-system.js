export function supplyRatio(current, capacity){
  return Math.max(0, Math.min(1, (current||0)/Math.max(1, capacity||1)));
}
