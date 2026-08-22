import crypto from "node:crypto";
export const uid = () => crypto.randomUUID();
