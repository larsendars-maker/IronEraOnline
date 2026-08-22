export function resolveCombat(attacker, defender, modifiers={}){
  const a=(attacker?.power||0)*(modifiers.attack||1);
  const d=(defender?.power||0)*(modifiers.defense||1);
  return a>d ? "attacker" : "defender";
}
