const sessions = new Map();
export function setSession(token, user){ sessions.set(token, user); }
export function getSession(token){ return sessions.get(token) || null; }
export function deleteSession(token){ sessions.delete(token); }
