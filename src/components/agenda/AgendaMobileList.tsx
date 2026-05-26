import { formatCurrency, formatTime, timeToMinutes } from "../../lib/agenda";
import type { Appointment, Professional, ScheduleBlock } from "../../types/agenda";

interface AgendaMobileListProps {
  appointments: Appointment[];
  professionals: Professional[];
  scheduleBlocks: ScheduleBlock[];
  showFreeSlots: boolean;
  timeSlots: string[];
  onAppointmentClick: (appointment: Appointment) => void;
  onEmptySlotClick: (professional: Professional, timeSlot: string) => void;
}

function getSlotInterval(timeSlots: string[]) {
  if (timeSlots.length < 2) {
    return 30;
  }

  return Math.max(1, timeToMinutes(timeSlots[1]) - timeToMinutes(timeSlots[0]));
}

function overlapsInterval(startTime: string, endTime: string, timeSlot: string, intervalMinutes: number) {
  const slotStart = timeToMinutes(timeSlot);
  const slotEnd = slotStart + intervalMinutes;
  const itemStart = timeToMinutes(startTime);
  const itemEnd = timeToMinutes(endTime);

  return itemStart < slotEnd && itemEnd > slotStart;
}

function startsInSlot(startTime: string, timeSlot: string, intervalMinutes: number) {
  const slotStart = timeToMinutes(timeSlot);
  const slotEnd = slotStart + intervalMinutes;
  const itemStart = timeToMinutes(startTime);

  return itemStart >= slotStart && itemStart < slotEnd;
}

function getStatusClass(statusCode: string | null) {
  return statusCode?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "unknown";
}

export function AgendaMobileList({
  appointments,
  professionals,
  scheduleBlocks,
  showFreeSlots,
  timeSlots,
  onAppointmentClick,
  onEmptySlotClick,
}: AgendaMobileListProps) {
  const intervalMinutes = getSlotInterval(timeSlots);

  return (
    <section className="agenda-mobile-list" aria-label="Agenda em lista">
      {timeSlots.map((timeSlot) => {
        const slotItems = professionals.flatMap((professional) => {
          const startingAppointments = appointments.filter(
            (appointment) =>
              appointment.professional_id === professional.id &&
              startsInSlot(appointment.start_time, timeSlot, intervalMinutes),
          );
          const overlappingAppointment = appointments.find(
            (appointment) =>
              appointment.professional_id === professional.id &&
              overlapsInterval(appointment.start_time, appointment.end_time, timeSlot, intervalMinutes),
          );
          const overlappingBlock = scheduleBlocks.find(
            (block) =>
              (!block.professional_id || block.professional_id === professional.id) &&
              overlapsInterval(block.start_time, block.end_time, timeSlot, intervalMinutes),
          );

          if (startingAppointments.length > 0) {
            return startingAppointments.map((appointment) => (
              <button
                className={`agenda-mobile-card agenda-mobile-card--appointment agenda-mobile-card--${getStatusClass(
                  appointment.status_code,
                )}`}
                key={`${timeSlot}-${professional.id}-${appointment.id}`}
                onClick={() => onAppointmentClick(appointment)}
                type="button"
              >
                <span className="agenda-mobile-card__time">
                  {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                </span>
                <strong>{appointment.client_name ?? "Cliente sem nome"}</strong>
                <span>{appointment.procedure_name ?? appointment.category_name ?? "Procedimento nao informado"}</span>
                <small>{professional.name}</small>
                {appointment.client_phone ? <small>{appointment.client_phone}</small> : null}
                <em>{appointment.status_name ?? appointment.status_code ?? "Sem status"}</em>
                <small>{formatCurrency(appointment.price_at_booking)}</small>
              </button>
            ));
          }

          if (overlappingAppointment) {
            return [];
          }

          if (overlappingBlock && startsInSlot(overlappingBlock.start_time, timeSlot, intervalMinutes)) {
            return [
              <article className="agenda-mobile-card agenda-mobile-card--blocked" key={`${timeSlot}-${professional.id}-blocked`}>
                <span className="agenda-mobile-card__time">
                  {formatTime(overlappingBlock.start_time)} - {formatTime(overlappingBlock.end_time)}
                </span>
                <strong>{overlappingBlock.professional_id ? "Profissional indisponivel" : "Horario bloqueado"}</strong>
                <span>{professional.name}</span>
                {overlappingBlock.reason ? <small>Motivo: {overlappingBlock.reason}</small> : null}
              </article>,
            ];
          }

          if (overlappingBlock) {
            return [];
          }

          if (!showFreeSlots) {
            return [];
          }

          return [
            <button
              className="agenda-mobile-card agenda-mobile-card--free"
              key={`${timeSlot}-${professional.id}-free`}
              onClick={() => onEmptySlotClick(professional, timeSlot)}
              type="button"
            >
              <span className="agenda-mobile-card__time">{formatTime(timeSlot)}</span>
              <strong>{professional.name}</strong>
              <span>Livre</span>
              <em>Agendar</em>
            </button>,
          ];
        });

        if (slotItems.length === 0) {
          return null;
        }

        return (
          <div className="agenda-mobile-time-group" key={timeSlot}>
            <h2>{formatTime(timeSlot)}</h2>
            <div>{slotItems}</div>
          </div>
        );
      })}
    </section>
  );
}
