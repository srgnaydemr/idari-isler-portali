export type VehicleOperationalStatus = {
  key: string;
  label: string;
  pill: string;
};

export function vehicleOperationalStatus(
  baseStatus: string | null | undefined,
  hasActiveAssignment = false,
  hasOpenService = false,
): VehicleOperationalStatus {
  if (hasOpenService || baseStatus === "SERVICE") return { key: "SERVICE", label: "Serviste", pill: "blue" };
  if (baseStatus === "TEMP_IN_USE") return { key: "TEMP_IN_USE", label: "Geçici Kullanımda", pill: "orange" };
  if (hasActiveAssignment) return { key: "ASSIGNED", label: "Zimmetli", pill: "orange" };
  if (baseStatus === "ACTIVE") return { key: "AVAILABLE", label: "Boşta", pill: "green" };
  if (baseStatus === "MAINTENANCE") return { key: "MAINTENANCE", label: "Bakımda", pill: "orange" };
  if (baseStatus === "DAMAGED") return { key: "DAMAGED", label: "Hasarlı", pill: "red" };
  if (baseStatus === "INACTIVE") return { key: "INACTIVE", label: "Kullanım Dışı", pill: "gray" };
  if (baseStatus === "REPLACEMENT") return { key: "REPLACEMENT", label: "İkame", pill: "orange" };
  return { key: String(baseStatus || "UNKNOWN"), label: "Bilinmiyor", pill: "gray" };
}
