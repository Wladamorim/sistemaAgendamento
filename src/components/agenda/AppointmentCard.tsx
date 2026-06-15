import { formatTime } from "../../lib/agenda";
import {
  getAppointmentStatusClass,
  getAppointmentStatusLabel,
  shouldShowAppointmentStatus,
} from "../../lib/appointmentStatus";
import type { Appointment } from "../../types/agenda";

interface AppointmentCardProps {
  appointment: Appointment;
  isHighlighted?: boolean;
  onClick: (appointment: Appointment) => void;
  onPreviewHide?: () => void;
  onPreviewShow?: (appointment: Appointment, rect: DOMRect) => void;
}

export function AppointmentCard({
  appointment,
  isHighlighted = false,
  onClick,
  onPreviewHide,
  onPreviewShow,
}: AppointmentCardProps) {
  const clientName = appointment.client_name ?? "Cliente sem nome";
  const procedureName = appointment.procedure_name ?? appointment.category_name ?? "Procedimento não informado";
  const statusClass = getAppointmentStatusClass(appointment.status_code);
  const statusLabel = getAppointmentStatusLabel(appointment.status_code, appointment.status_name);
  const showStatus = shouldShowAppointmentStatus(appointment.status_code, appointment.status_name);

  return (
    <button
      className={`appointment-card appointment-card--${statusClass}${isHighlighted ? " appointment-card--search-match" : ""}`}
      onBlur={onPreviewHide}
      onClick={() => onClick(appointment)}
      onFocus={(event) => onPreviewShow?.(appointment, event.currentTarget.getBoundingClientRect())}
      onPointerDown={onPreviewHide}
      onPointerEnter={(event) => onPreviewShow?.(appointment, event.currentTarget.getBoundingClientRect())}
      onPointerLeave={onPreviewHide}
      type="button"
    >
      <div className="appointment-card__top">
        <strong title={clientName}>{clientName}</strong>
        {showStatus ? <span className="appointment-card__status">{statusLabel}</span> : null}
      </div>

      <p title={procedureName}>{procedureName}</p>

      <div className="appointment-card__meta">
        <small>
          {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
        </small>
        {appointment.client_phone ? <small>{appointment.client_phone}</small> : null}
      </div>
    </button>
  );
}
