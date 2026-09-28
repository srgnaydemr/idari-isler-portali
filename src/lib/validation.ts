import { z } from "zod";

export const vehicleSchema = z.object({
  plate: z.string().trim().min(5, "Plaka zorunludur").max(20).transform(v => v.toUpperCase()),
  ownership_type: z.enum(["FLEET", "OWNED"]),
  brand: z.string().trim().min(1, "Marka zorunludur"),
  model: z.string().trim().min(1, "Model zorunludur"),
  model_year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1),
  vehicle_type: z.string().trim().min(1, "Araç tipi zorunludur"),
  fuel_type: z.string().trim().optional(),
  transmission: z.string().trim().optional(),
  color: z.string().trim().optional(),
  vin: z.string().trim().optional(),
  engine_number: z.string().trim().optional(),
  registration_serial_no: z.string().trim().optional(),
  registration_document_no: z.string().trim().optional(),
  registration_date: z.string().optional(),
  current_odometer: z.coerce.number().int().min(0),
  responsible_person: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "SERVICE", "DAMAGED", "INACTIVE", "REPLACEMENT"]),
  tire_storage_dealer: z.string().trim().min(1, "Lastik depo bayisi zorunludur"),
  fleet_company: z.string().trim().optional(),
  contract_start_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  contract_km_limit: z.union([z.coerce.number().int().min(1), z.literal("")]).optional(),
  contract_reference: z.string().trim().optional(),
  planned_return_date: z.string().optional(),
  fleet_description: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  if (v.ownership_type === "FLEET" && !v.fleet_company) {
    ctx.addIssue({ code: "custom", path: ["fleet_company"], message: "Filo şirketi zorunludur" });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (v.contract_start_date && v.contract_start_date > today) {
    ctx.addIssue({ code: "custom", path: ["contract_start_date"], message: "Başlangıç tarihi bugünün tarihinden ileri olamaz." });
  }
});

export const odometerSchema = z.object({
  vehicle_id: z.string().uuid(),
  new_odometer: z.coerce.number().int().min(0),
  description: z.string().trim().max(500).optional(),
  correction_reason: z.string().trim().max(500).optional(),
});
