export function isValidRoomId(v){ return /^[a-f0-9]{8}$/i.test(String(v||"")); }
export function isValidCountryId(v){ return /^[a-z0-9_-]{2,32}$/i.test(String(v||"")); }
