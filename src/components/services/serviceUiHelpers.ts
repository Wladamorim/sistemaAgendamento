import { getServiceCategory, normalizeProfessional } from "../../lib/services";
import type { ServiceAppointmentRecord, ServiceProfessional, ServiceRecord } from "../../types/service";

export function formatServiceDuration(duration: number | null) {
  return duration ? `${duration} min` : "Duracao nao informada";
}

export function formatServiceDate(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

export function formatServiceDateTime(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getServiceCategoryName(service: ServiceRecord) {
  return getServiceCategory(service)?.name ?? "Sem categoria";
}

export function getAppointmentClientName(appointment: ServiceAppointmentRecord) {
  const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients;
  return client?.full_name ?? "Cliente nao informado";
}

export function getAppointmentProfessionalName(appointment: ServiceAppointmentRecord) {
  const professional = normalizeProfessional(appointment.professionals as ServiceProfessional | ServiceProfessional[] | null);
  return professional?.name ?? "Profissional nao informado";
}
