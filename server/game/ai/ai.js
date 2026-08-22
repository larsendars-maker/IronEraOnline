export function chooseAiAction(country){
  if(!country) return null;
  if((country.warSupport||0)>60) return "prepare_war";
  if((country.ic||0)<50) return "build_industry";
  return "research";
}
