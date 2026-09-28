import { cookies } from "next/headers";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { getDatabase } from "./database";

export const SESSION_COOKIE = "idari_portal_session";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function now() {
  return new Date().toISOString();
}

export async function hasUsers() {
  return Number((getDatabase().prepare("SELECT count(*) c FROM users").get() as any)?.c || 0) > 0;
}

export async function createUser(input: {
  firstName?: string;
  lastName?: string;
  username: string;
  email: string;
  password: string;
}) {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();

  if (!username || !email || input.password.length < 8) {
    throw new Error("E-posta, kullanıcı adı ve en az 8 karakter şifre zorunludur.");
  }

  const id = randomUUID();
  const timestamp = now();

  try {
    getDatabase()
      .prepare(
        "INSERT INTO users(id,first_name,last_name,username,email,password_hash,is_active,role,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?)",
      )
      .run(
        id,
        input.firstName?.trim() || null,
        input.lastName?.trim() || null,
        username,
        email,
        passwordHash(input.password),
        "USER",
        timestamp,
        timestamp,
      );

    return { id, email, username };
  } catch (error: any) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw new Error("E-posta veya kullanıcı adı zaten kullanımda.");
    }
    throw error;
  }
}

export async function createInitialUser(input: {
  firstName?: string;
  lastName?: string;
  username: string;
  email: string;
  password: string;
}) {
  const db=getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const count=Number((db.prepare("SELECT count(*) c FROM users").get() as any)?.c||0);
    if(count>0)throw new Error("İlk kullanıcı zaten oluşturulmuş.");
    const created=await createUser(input);
    db.exec("COMMIT");
    return created;
  } catch(error) {
    try{db.exec("ROLLBACK")}catch{}
    throw error;
  }
}

/**
 * Kullanıcıyı doğrular ve session'ı veritabanında oluşturur.
 * Cookie burada yazılmaz. Route Handler redirect cevabına cookie'yi açıkça ekler.
 * Böylece Next.js production redirect sırasında Set-Cookie header'ı kaybolmaz.
 */
export class LoginRateLimitError extends Error {}

function normalizedIp(ip?: string | null) {
  return String(ip || "unknown").split(",")[0].trim().slice(0, 120) || "unknown";
}

export async function signIn(identifier: string, password: string, ipAddress?: string | null) {
  const normalized = identifier.trim().toLowerCase();
  const ip = normalizedIp(ipAddress);
  const db = getDatabase();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  db.prepare("DELETE FROM login_attempts WHERE attempted_at<?").run(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const failCount = Number((db.prepare("SELECT count(*) c FROM login_attempts WHERE identifier=? AND ip_address=? AND success=0 AND attempted_at>=?").get(normalized, ip, cutoff) as any)?.c || 0);
  if (failCount >= 10) throw new LoginRateLimitError("Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.");

  const user = db
    .prepare("SELECT * FROM users WHERE (lower(email)=? OR lower(username)=?) AND is_active=1 LIMIT 1")
    .get(normalized, normalized) as any;

  if (!user || !passwordMatches(password, user.password_hash)) {
    db.prepare("INSERT INTO login_attempts(id,identifier,ip_address,success,attempted_at) VALUES(?,?,?,?,?)")
      .run(randomUUID(), normalized, ip, 0, now());
    return null;
  }

  db.prepare("DELETE FROM login_attempts WHERE identifier=? AND ip_address=?").run(normalized, ip);
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(createdAt.toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), user.id, tokenHash(token), createdAt.toISOString(), expiresAt.toISOString(), createdAt.toISOString());

  db.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").run(createdAt.toISOString(), createdAt.toISOString(), user.id);
  db.prepare("INSERT INTO login_attempts(id,identifier,ip_address,success,attempted_at) VALUES(?,?,?,?,?)")
    .run(randomUUID(), normalized, ip, 1, createdAt.toISOString());

  return { id: user.id, email: user.email, username: user.username, token, expiresAt };
}

export async function signOut() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    getDatabase().prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const user = getDatabase()
    .prepare(
      "SELECT u.*,s.id sid,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1",
    )
    .get(tokenHash(token)) as any;

  if (!user || !user.is_active || new Date(user.expires_at).getTime() < Date.now()) {
    // Server Component render sırasında cookie değiştirmek Next.js tarafından engellenebilir.
    // Geçersiz/bitmiş oturumu burada sadece reddediyoruz; logout/login route'u cookie'yi temizler.
    return null;
  }

  getDatabase().prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").run(now(), user.sid);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: Boolean(user.is_active),
  };
}

export async function setUserPassword(userId:string,password:string){
  if(password.length<8)throw new Error("Şifre en az 8 karakter olmalıdır.");
  getDatabase().prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").run(passwordHash(password),now(),userId);
  getDatabase().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}
