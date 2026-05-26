import { formatTime } from "../../lib/agenda";
import type { Appointment } from "../../types/agenda";

interface AppointmentCardProps {
  appointment: Appointment;
  isHighlighted?: boolean;
  onClick: (appointment: Appointment) => void;
  onPreviewHide?: () => void;
  onPreviewShow?: (appointment: Appointment, rect: DOMRect) => void;
}

function getStatusClass(statusCode: string | null) {
  if (!statusCode) {
    return "unknown";
  }

  return statusCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function shouldShowStatus(statusCode: string | null, statusName: string | null) {
  const normalizedCode = statusCode?.toLowerCase() ?? "";
  const normalizedName = statusName?.toLowerCase() ?? "";

  return normalizedCode !== "in_progress" && normalizedName !== "em atendimento";
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
  const statusClass = getStatusClass(appointment.status_code);
  const showStatus = shouldShowStatus(appointment.status_code, appointment.status_name);

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
        {showStatus ? <span className="appointment-card__status">{appointment.status_name ?? "Sem status"}</span> : null}
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
