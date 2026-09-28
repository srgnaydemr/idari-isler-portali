import type { DatabaseSync } from "node:sqlite";

const PREFIXES: Record<string, string> = {
  PHONE: "TEL", TABLET: "TBL", LAPTOP: "LPT", DESKTOP: "MST", MONITOR: "MNT",
  KEYBOARD: "KLV", MOUSE: "MSE", HEADSET: "KUL", CHARGER: "SRJ", ADAPTER: "ADP",
  SIM: "SIM", MODEM: "MDM", PRINTER: "YZC", OTHER: "DMR",
};

function normalizePrefix(value: string) {
  const clean = value.toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  return (clean.slice(0, 3) || "DMR").padEnd(3, "X");
}

export function equipmentCodeAndPrefix(db: DatabaseSync, equipmentType: string) {
  const row = db.prepare("SELECT code FROM system_definitions WHERE category='equipment_type' AND name=? COLLATE NOCASE LIMIT 1").get(equipmentType) as any;
  const code = String(row?.code || equipmentType || "OTHER").toUpperCase();
  return { code, prefix: PREFIXES[code] || normalizePrefix(code) };
}

/** Call inside BEGIN IMMEDIATE so concurrent creates cannot receive the same number. */
export function nextEquipmentAssetTag(db: DatabaseSync, equipmentType: string) {
  const { code, prefix } = equipmentCodeAndPrefix(db, equipmentType);
  const seq = db.prepare("SELECT last_number FROM equipment_asset_sequences WHERE equipment_code=?").get(code) as any;
  let last = Number(seq?.last_number || 0);
  if (!seq) {
    const rows = db.prepare("SELECT asset_tag FROM equipment WHERE asset_tag LIKE ? COLLATE NOCASE").all(`${prefix}-%`) as any[];
    for (const r of rows) {
      const m = String(r.asset_tag || "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
      if (m) last = Math.max(last, Number(m[1]));
    }
  }
  const next = last + 1;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO equipment_asset_sequences(equipment_code,prefix,last_number,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(equipment_code) DO UPDATE SET prefix=excluded.prefix,last_number=excluded.last_number,updated_at=excluded.updated_at`)
    .run(code, prefix, next, now);
  return `${prefix}-${String(next).padStart(5, "0")}`;
}
