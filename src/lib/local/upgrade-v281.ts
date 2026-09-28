import type {DatabaseSync} from "node:sqlite";

/** V2.8.1: Araç genel bilgi Server Action hotfix. Veri modelini değiştirmez. */
export function upgradeV281(db:DatabaseSync){
  const now=new Date().toISOString();
  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.8.1','Portal sürümü',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.8.1',setting_label='Portal sürümü',updated_at=excluded.updated_at").run(now);
}
