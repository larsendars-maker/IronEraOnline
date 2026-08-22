import bcrypt from "bcryptjs";
export const hashPassword = (value) => bcrypt.hash(value, 10);
export const verifyPassword = (value, hash) => bcrypt.compare(value, hash);
