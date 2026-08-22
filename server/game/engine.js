export function createGameEngine({tick, broadcast}={}){
  return { tick, broadcast, start(){ return true; } };
}
