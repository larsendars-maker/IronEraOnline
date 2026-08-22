export function productionProgress(line, dailyIC){
  return {...line, remaining: Math.max(0, (line.remaining ?? 0) - dailyIC)};
}
