export type SystemEventType =
  | "all"
  | "appointment_created"
  | "appointment_confirmed"
  | "appointment_completed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "schedule_block_created"
  | "schedule_block_removed"
  | "combo_sold"
  | "combo_used"
  | "client_created"
  | "client_updated";

export interface SystemEventRow {
  id: string;
  event_type: Exclude<SystemEventType, "all"> | string;
  entity_type: string;
  entity_id: string | null;
  appointment_id: string | null;
  client_id: string | null;
  professional_id: string | null;
  procedure_id: string | null;
  schedule_block_id: string | null;
  combo_id: string | null;
  user_id: string | null;
  title: string;
  description: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SystemEventRecord extends SystemEventRow {
  event_label: string;
  client_name: string | null;
  client_phone: string | null;
  professional_name: string | null;
  procedure_name: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
}

export const systemEventOptions: { label: string; value: SystemEventType }[] = [
  { label: "Todos", value: "all" },
  { label: "Agendamento criado", value: "appointment_created" },
  { label: "Agendamento confirmado", value: "appointment_confirmed" },
  { label: "Agendamento finalizado", value: "appointment_completed" },
  { label: "Agendamento cancelado", value: "appointment_cancelled" },
  { label: "Agendamento reagendado", value: "appointment_rescheduled" },
  { label: "Horário bloqueado", value: "schedule_block_created" },
  { label: "Horário desbloqueado", value: "schedule_block_removed" },
  { label: "Combo vendido", value: "combo_sold" },
  { label: "Combo utilizado", value: "combo_used" },
  { label: "Cliente criado", value: "client_created" },
  { label: "Cliente editado", value: "client_updated" },
];

export function getSystemEventLabel(eventType: string, fallback: string) {
  return systemEventOptions.find((option) => option.value === eventType)?.label ?? fallback;
}

export function getSystemEventTone(eventType: string) {
  if (eventType === "appointment_cancelled") {
    return "danger";
  }

  if (eventType === "appointment_confirmed" || eventType === "appointment_completed") {
    return "success";
  }

  if (eventType.startsWith("schedule_block")) {
    return "warning";
  }

  if (eventType.startsWith("combo")) {
    return "combo";
  }

  if (eventType.startsWith("client")) {
    return "client";
  }

  return "primary";
}

export function formatSystemEventDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatMetadataDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

export function formatMetadataTime(value: unknown) {
  return typeof value === "string" ? value.slice(0, 5) : null;
}
