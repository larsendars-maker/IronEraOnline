export function getProvince(data, id){ return data?.provinces?.find(p=>p.id===id) || null; }
