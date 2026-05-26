import type { Appointment } from "../types/agenda";

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateForQuery(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getRelativeDateLabel(date: Date) {
  const selectedDate = formatDateForQuery(date);
  const today = new Date();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  if (selectedDate === formatDateForQuery(yesterday)) {
    return "Ontem";
  }

  if (selectedDate === formatDateForQuery(today)) {
    return "Hoje";
  }

  if (selectedDate === formatDateForQuery(tomorrow)) {
    return "Amanhã";
  }

  return null;
}

export function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatTime(time: string) {
  return time.slice(0, 5);
}

export function formatCurrency(value: number | string | null) {
  const numericValue = value === null ? null : Number(value);

  if (numericValue === null || Number.isNaN(numericValue)) {
    return "Valor nao informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

export function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

export function generateTimeSlots(start: string, end: string, intervalMinutes: number) {
  const slots: string[] = [];
  const endMinutes = timeToMinutes(end);

  for (let current = timeToMinutes(start); current <= endMinutes; current += intervalMinutes) {
    slots.push(minutesToTime(current));
  }

  return slots;
}

export function getAppointmentsForSlot(
  appointments: Appointment[],
  professionalId: string,
  timeSlot: string,
) {
  return appointments.filter(
    (appointment) =>
      appointment.professional_id === professionalId && isSlotInsideAppointment(timeSlot, appointment),
  );
}

export function isSlotInsideAppointment(timeSlot: string, appointment: Appointment) {
  const slotMinutes = timeToMinutes(timeSlot);
  const startMinutes = timeToMinutes(appointment.start_time);
  const endMinutes = timeToMinutes(appointment.end_time);

  return slotMinutes >= startMinutes && slotMinutes < endMinutes;
}

export function timeToMinutes(time: string) {
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function addMinutesToTime(time: string, minutesToAdd: number) {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
