const appointmentStatusLabels: Record<string, string> = {
  cancelled: "Cancelado",
  canceled: "Cancelado",
  completed: "Finalizado",
  confirmed: "Confirmado",
  in_progress: "Em atendimento",
  no_show: "Não compareceu",
  rescheduled: "Remarcado",
  scheduled: "Agendado",
};

export function getAppointmentStatusClass(statusCode: string | null | undefined) {
  return statusCode?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "unknown";
}

export function getAppointmentStatusLabel(statusCode: string | null | undefined, statusName?: string | null) {
  const normalizedCode = statusCode?.toLowerCase() ?? "";

  if (normalizedCode && appointmentStatusLabels[normalizedCode]) {
    return appointmentStatusLabels[normalizedCode];
  }

  return statusName ?? statusCode ?? "Sem status";
}

export function shouldShowAppointmentStatus(statusCode: string | null | undefined, statusName?: string | null) {
  const normalizedCode = statusCode?.toLowerCase() ?? "";
  const normalizedName = statusName?.toLowerCase() ?? "";

  return normalizedCode !== "in_progress" && normalizedName !== "em atendimento";
}
