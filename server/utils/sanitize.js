export function cleanText(value, max=180){
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0,max);
}
