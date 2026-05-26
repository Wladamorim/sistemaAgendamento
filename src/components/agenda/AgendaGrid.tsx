import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { formatCurrency, formatTime, timeToMinutes } from "../../lib/agenda";
import type { Appointment, Professional, ScheduleBlock } from "../../types/agenda";
import { AppointmentCard } from "./AppointmentCard";
import { ProfessionalColumn } from "./ProfessionalColumn";

interface AgendaGridProps {
  appointments: Appointment[];
  currentTime: string | null;
  highlightedAppointmentIds?: string[];
  professionals: Professional[];
  scheduleBlocks: ScheduleBlock[];
  timeSlots: string[];
  onAppointmentClick: (appointment: Appointment) => void;
  onEmptySlotClick: (professional: Professional, timeSlot: string) => void;
}

const ROW_HEIGHT = 92;
const DRAG_THRESHOLD = 5;
const INTERACTIVE_DRAG_SELECTOR =
  'input, select, textarea, a, [role="button"], .appointment-card, .modal, .appointment-modal, .dropdown, .popover, .date-picker-popover, .add-menu';

interface DragState {
  hasDragged: boolean;
  isDragging: boolean;
  pointerId: number | null;
  pendingSlotProfessionalId: string | null;
  pendingSlotTime: string | null;
  scrollLeft: number;
  scrollTop: number;
  startX: number;
  startY: number;
}

interface AppointmentPreviewState {
  appointment: Appointment;
  x: number;
  y: number;
}

function getSlotInterval(timeSlots: string[]) {
  if (timeSlots.length < 2) {
    return 30;
  }

  return Math.max(1, timeToMinutes(timeSlots[1]) - timeToMinutes(timeSlots[0]));
}

function getAppointmentMinutes(appointment: Appointment) {
  const start = timeToMinutes(appointment.start_time);
  const end = timeToMinutes(appointment.end_time);

  return {
    end: end > start ? end : start + 30,
    start,
  };
}

function doesAppointmentOverlapSlot(appointment: Appointment, timeSlot: string, intervalMinutes: number) {
  const slotStart = timeToMinutes(timeSlot);
  const slotEnd = slotStart + intervalMinutes;
  const appointmentMinutes = getAppointmentMinutes(appointment);

  return appointmentMinutes.start < slotEnd && appointmentMinutes.end > slotStart;
}

function doesBlockOverlapSlot(block: ScheduleBlock, professionalId: string, timeSlot: string, intervalMinutes: number) {
  if (block.professional_id && block.professional_id !== professionalId) {
    return false;
  }

  const slotStart = timeToMinutes(timeSlot);
  const slotEnd = slotStart + intervalMinutes;

  return timeToMinutes(block.start_time) < slotEnd && timeToMinutes(block.end_time) > slotStart;
}

function getBlockPlacement(block: ScheduleBlock, timeSlots: string[], intervalMinutes: number, professionalIndex: number) {
  const blockStart = timeToMinutes(block.start_time);
  const blockEnd = timeToMinutes(block.end_time);
  const overlappingIndexes = timeSlots
    .map((timeSlot, index) => ({ index, timeSlot }))
    .filter(({ timeSlot }) => {
      const slotStart = timeToMinutes(timeSlot);
      const slotEnd = slotStart + intervalMinutes;

      return blockStart < slotEnd && blockEnd > slotStart;
    });

  if (overlappingIndexes.length === 0) {
    return null;
  }

  const firstIndex = overlappingIndexes[0].index;
  const lastIndex = overlappingIndexes[overlappingIndexes.length - 1].index;
  const firstSlotStart = timeToMinutes(timeSlots[firstIndex]);
  const lastSlotEnd = timeToMinutes(timeSlots[lastIndex]) + intervalMinutes;
  const rowSpan = lastIndex - firstIndex + 1;
  const topOffset = Math.max(0, ((blockStart - firstSlotStart) / intervalMinutes) * ROW_HEIGHT);
  const bottomOffset = Math.max(0, ((lastSlotEnd - blockEnd) / intervalMinutes) * ROW_HEIGHT);

  return {
    "--block-bottom-offset": `${bottomOffset}px`,
    "--block-top-offset": `${topOffset}px`,
    gridColumn: `${professionalIndex + 2} / span 1`,
    gridRow: `${firstIndex + 2} / span ${rowSpan}`,
  } as CSSProperties;
}

function getAppointmentPlacement(
  appointment: Appointment,
  timeSlots: string[],
  intervalMinutes: number,
  professionalIndex: number,
) {
  const appointmentMinutes = getAppointmentMinutes(appointment);
  const overlappingIndexes = timeSlots
    .map((timeSlot, index) => ({ index, timeSlot }))
    .filter(({ timeSlot }) => doesAppointmentOverlapSlot(appointment, timeSlot, intervalMinutes));

  if (overlappingIndexes.length === 0) {
    return null;
  }

  const firstIndex = overlappingIndexes[0].index;
  const lastIndex = overlappingIndexes[overlappingIndexes.length - 1].index;
  const firstSlotStart = timeToMinutes(timeSlots[firstIndex]);
  const lastSlotEnd = timeToMinutes(timeSlots[lastIndex]) + intervalMinutes;
  const rowSpan = lastIndex - firstIndex + 1;
  const topOffset = Math.max(
    0,
    Math.min(ROW_HEIGHT - 16, ((appointmentMinutes.start - firstSlotStart) / intervalMinutes) * ROW_HEIGHT),
  );
  const bottomOffset = Math.max(
    0,
    Math.min(ROW_HEIGHT - 16, ((lastSlotEnd - appointmentMinutes.end) / intervalMinutes) * ROW_HEIGHT),
  );

  return {
    "--appointment-bottom-offset": `${bottomOffset}px`,
    "--appointment-top-offset": `${topOffset}px`,
    gridColumn: `${professionalIndex + 2} / span 1`,
    gridRow: `${firstIndex + 2} / span ${rowSpan}`,
  } as CSSProperties;
}

function shouldIgnoreDragStart(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return true;
  }

  const freeSlotButton = target.closest("button.agenda-slot--free");

  if (freeSlotButton) {
    return false;
  }

  if (target.closest("button")) {
    return true;
  }

  return Boolean(target.closest(INTERACTIVE_DRAG_SELECTOR));
}

function getCurrentTimePlacement(currentTime: string | null, timeSlots: string[], intervalMinutes: number) {
  if (!currentTime || timeSlots.length === 0) {
    return null;
  }

  const currentMinutes = timeToMinutes(currentTime);
  const startMinutes = timeToMinutes(timeSlots[0]);
  const endMinutes = timeToMinutes(timeSlots[timeSlots.length - 1]) + intervalMinutes;

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return null;
  }

  return ((currentMinutes - startMinutes) / intervalMinutes) * ROW_HEIGHT;
}

export function AgendaGrid({
  appointments,
  currentTime,
  highlightedAppointmentIds = [],
  professionals,
  scheduleBlocks,
  timeSlots,
  onAppointmentClick,
  onEmptySlotClick,
}: AgendaGridProps) {
  const intervalMinutes = getSlotInterval(timeSlots);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState>({
    hasDragged: false,
    isDragging: false,
    pointerId: null,
    pendingSlotProfessionalId: null,
    pendingSlotTime: null,
    scrollLeft: 0,
    scrollTop: 0,
    startX: 0,
    startY: 0,
  });
  const ignoreNextClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [appointmentPreview, setAppointmentPreview] = useState<AppointmentPreviewState | null>(null);
  const highlightedAppointmentIdSet = new Set(highlightedAppointmentIds);
  const nowOffset = getCurrentTimePlacement(currentTime, timeSlots, intervalMinutes);

  function resetDragState() {
    dragStateRef.current = {
      hasDragged: false,
      isDragging: false,
      pointerId: null,
      pendingSlotProfessionalId: null,
      pendingSlotTime: null,
      scrollLeft: 0,
      scrollTop: 0,
      startX: 0,
      startY: 0,
    };
    setIsDragging(false);
  }

  function hideAppointmentPreview() {
    setAppointmentPreview(null);
  }

  function showAppointmentPreview(appointment: Appointment, rect: DOMRect) {
    if (dragStateRef.current.isDragging) {
      return;
    }

    const previewWidth = 292;
    const previewHeight = 220;
    const preferredX = rect.right + 12;
    const x =
      preferredX + previewWidth > window.innerWidth
        ? Math.max(12, rect.left - previewWidth - 12)
        : preferredX;
    const y = Math.min(Math.max(12, rect.top), Math.max(12, window.innerHeight - previewHeight - 12));

    setAppointmentPreview({ appointment, x, y });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = scrollRef.current;
    const freeSlotButton =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button.agenda-slot--free") : null;

    if (!viewport || (event.pointerType === "mouse" && event.button !== 0) || shouldIgnoreDragStart(event.target)) {
      return;
    }

    hideAppointmentPreview();

    dragStateRef.current = {
      hasDragged: false,
      isDragging: true,
      pointerId: event.pointerId,
      pendingSlotProfessionalId: freeSlotButton?.dataset.professionalId ?? null,
      pendingSlotTime: freeSlotButton?.dataset.timeSlot ?? null,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      startX: event.clientX,
      startY: event.clientY,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function consumeIgnoredClick() {
    if (!ignoreNextClickRef.current) {
      return false;
    }

    ignoreNextClickRef.current = false;
    return true;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = scrollRef.current;
    const dragState = dragStateRef.current;

    if (!viewport || !dragState.isDragging || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.hasDragged && Math.abs(deltaX) <= DRAG_THRESHOLD && Math.abs(deltaY) <= DRAG_THRESHOLD) {
      return;
    }

    dragState.hasDragged = true;
    hideAppointmentPreview();
    viewport.scrollLeft = dragState.scrollLeft - deltaX;
    viewport.scrollTop = dragState.scrollTop - deltaY;
    event.preventDefault();
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const hadDragged = dragState.hasDragged;
    const pendingSlotProfessionalId = dragState.pendingSlotProfessionalId;
    const pendingSlotTime = dragState.pendingSlotTime;
    resetDragState();

    if (hadDragged) {
      ignoreNextClickRef.current = true;
      window.setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 120);
      return;
    }

    if (pendingSlotProfessionalId && pendingSlotTime) {
      const professional = professionals.find((item) => item.id === pendingSlotProfessionalId);

      if (professional) {
        ignoreNextClickRef.current = true;
        onEmptySlotClick(professional, pendingSlotTime);
        window.setTimeout(() => {
          ignoreNextClickRef.current = false;
        }, 120);
      }
    }
  }

  function cancelPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetDragState();
  }

  function handleEmptySlotClick(professional: Professional, timeSlot: string) {
    if (consumeIgnoredClick()) {
      return;
    }

    onEmptySlotClick(professional, timeSlot);
  }

  function handleAppointmentClick(appointment: Appointment) {
    if (consumeIgnoredClick()) {
      return;
    }

    hideAppointmentPreview();
    onAppointmentClick(appointment);
  }

  return (
    <div className="agenda-grid-shell">
      <div
        className={`agenda-grid-viewport${isDragging ? " is-dragging" : ""}`}
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={cancelPointerDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        ref={scrollRef}
      >
        <div
          className="agenda-grid"
          style={
            {
              "--agenda-row-height": `${ROW_HEIGHT}px`,
              "--professional-count": professionals.length,
            } as CSSProperties
          }
        >
          <div className="agenda-corner" style={{ gridColumn: "1 / span 1", gridRow: "1 / span 1" }}>
            Horário
          </div>

          {professionals.map((professional, professionalIndex) => (
            <div
              className="agenda-professional-header"
              key={professional.id}
              style={{ gridColumn: `${professionalIndex + 2} / span 1`, gridRow: "1 / span 1" }}
            >
              <ProfessionalColumn professional={professional} />
            </div>
          ))}

          {timeSlots.map((timeSlot, timeSlotIndex) => (
            <div
              className="agenda-time-cell"
              key={`time-${timeSlot}`}
              role="rowheader"
              style={{ gridColumn: "1 / span 1", gridRow: `${timeSlotIndex + 2} / span 1` }}
            >
              {timeSlot}
            </div>
          ))}

          {timeSlots.map((timeSlot, timeSlotIndex) =>
            professionals.map((professional, professionalIndex) => {
              const isOccupied = appointments.some(
                (appointment) =>
                  appointment.professional_id === professional.id &&
                  doesAppointmentOverlapSlot(appointment, timeSlot, intervalMinutes),
              );
              const overlappingBlock = scheduleBlocks.find((block) =>
                doesBlockOverlapSlot(block, professional.id, timeSlot, intervalMinutes),
              );

              if (isOccupied) {
                return (
                  <div
                    aria-hidden="true"
                    className="agenda-slot agenda-slot--occupied"
                    key={`${professional.id}-${timeSlot}-occupied`}
                    style={{
                      gridColumn: `${professionalIndex + 2} / span 1`,
                      gridRow: `${timeSlotIndex + 2} / span 1`,
                    }}
                  />
                );
              }

              if (overlappingBlock) {
                return (
                  <div
                    className="agenda-slot agenda-slot--blocked"
                    key={`${professional.id}-${timeSlot}-blocked`}
                    style={{
                      gridColumn: `${professionalIndex + 2} / span 1`,
                      gridRow: `${timeSlotIndex + 2} / span 1`,
                    }}
                  >
                    <span>Horário bloqueado</span>
                    {overlappingBlock.reason ? <small>{overlappingBlock.reason}</small> : null}
                  </div>
                );
              }

              return (
                <button
                  aria-label={`Agendar com ${professional.name} às ${timeSlot}`}
                  className="agenda-slot agenda-slot--free"
                  data-professional-id={professional.id}
                  data-time-slot={timeSlot}
                  key={`${professional.id}-${timeSlot}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEmptySlotClick(professional, timeSlot);
                  }}
                  style={{
                    gridColumn: `${professionalIndex + 2} / span 1`,
                    gridRow: `${timeSlotIndex + 2} / span 1`,
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className="free-slot-button" />
                </button>
              );
            }),
          )}

          {scheduleBlocks.flatMap((block) => {
            const targetProfessionals = block.professional_id
              ? professionals.filter((professional) => professional.id === block.professional_id)
              : professionals;

            return targetProfessionals.map((professional) => {
              const professionalIndex = professionals.findIndex((item) => item.id === professional.id);

              if (professionalIndex === -1) {
                return null;
              }

              const placement = getBlockPlacement(block, timeSlots, intervalMinutes, professionalIndex);

              if (!placement) {
                return null;
              }

              return (
                <div className="agenda-block-event" key={`${block.id}-${professional.id}`} style={placement}>
                  <div>
                    <span aria-hidden="true" className="agenda-block-event__icon" />
                    <strong>Horário bloqueado</strong>
                  </div>
                  {block.reason ? <p>Motivo: {block.reason}</p> : null}
                  <small>
                    {formatTime(block.start_time)} - {formatTime(block.end_time)}
                  </small>
                </div>
              );
            });
          })}

          {appointments.map((appointment) => {
            const professionalIndex = professionals.findIndex((professional) => professional.id === appointment.professional_id);

            if (professionalIndex === -1) {
              return null;
            }

            const placement = getAppointmentPlacement(appointment, timeSlots, intervalMinutes, professionalIndex);

            if (!placement) {
              return null;
            }

            return (
              <div className="agenda-event" key={appointment.id} style={placement}>
                <AppointmentCard
                  appointment={appointment}
                  isHighlighted={highlightedAppointmentIdSet.has(appointment.id)}
                  onClick={handleAppointmentClick}
                  onPreviewHide={hideAppointmentPreview}
                  onPreviewShow={showAppointmentPreview}
                />
              </div>
            );
          })}

          {nowOffset !== null ? (
            <div
              aria-hidden="true"
              className="agenda-now-line"
              style={{ "--agenda-now-offset": `${nowOffset}px` } as CSSProperties}
            >
              <span>Agora {currentTime}</span>
            </div>
          ) : null}
        </div>
      </div>

      {appointmentPreview ? (
        <div
          className="appointment-preview"
          style={{
            left: appointmentPreview.x,
            top: appointmentPreview.y,
          }}
        >
          <strong>{appointmentPreview.appointment.client_name ?? "Cliente sem nome"}</strong>
          <span>{appointmentPreview.appointment.client_phone ?? "Telefone não informado"}</span>
          <span>{appointmentPreview.appointment.procedure_name ?? "Procedimento não informado"}</span>
          <span>{appointmentPreview.appointment.professional_name ?? "Profissional não informado"}</span>
          <span>
            {formatTime(appointmentPreview.appointment.start_time)} - {formatTime(appointmentPreview.appointment.end_time)}
          </span>
          <span>{formatCurrency(appointmentPreview.appointment.price_at_booking)}</span>
          <span>{appointmentPreview.appointment.status_name ?? appointmentPreview.appointment.status_code ?? "Sem status"}</span>
          {appointmentPreview.appointment.appointment_notes ? (
            <p>{appointmentPreview.appointment.appointment_notes}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
