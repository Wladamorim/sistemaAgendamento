import { useMemo, useState } from "react";
import {
  DEFAULT_WORKING_HOURS,
  addDays,
  addMinutesToTime,
  formatDateForQuery,
  formatTime,
  generateTimeSlots,
  isTimeRangeWithinWorkingHours,
  timeToMinutes,
} from "../../lib/agenda";
import { getAppointmentStatusLabel as getAppointmentStatusDisplayLabel } from "../../lib/appointmentStatus";
import { supabase } from "../../lib/supabase";
import type { Appointment, Professional } from "../../types/agenda";
import type { AppUser } from "../../types/user";
import { AppDatePicker } from "../ui/AppDatePicker";

type ScheduleBlockMode = "time" | "professional";
type ScheduleBlockScope = "all" | "professional";
type ImpactedAppointment = Pick<
  Appointment,
  | "id"
  | "scheduled_date"
  | "start_time"
  | "end_time"
  | "client_name"
  | "client_phone"
  | "procedure_name"
  | "category_name"
  | "professional_id"
  | "professional_name"
  | "status_code"
  | "status_name"
>;

interface PendingBlockRequest {
  dates: string[];
  professionalIds: string[];
}

interface ScheduleBlockModalProps {
  currentUser: AppUser;
  initialDate: Date;
  initialProfessional?: Professional | null;
  initialStartTime?: string | null;
  mode: ScheduleBlockMode;
  professionals: Professional[];
  onClose: () => void;
  onCreated: (message: string) => void;
}

function getDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    if (current.getDay() !== 0) {
      dates.push(formatDateForQuery(current));
    }

    current = addDays(current, 1);
  }

  return dates;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function normalizePhoneForWhatsApp(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("55")) {
    return digits;
  }

  return `55${digits}`;
}

function getAppointmentServiceLabel(appointment: ImpactedAppointment) {
  return appointment.procedure_name ?? appointment.category_name ?? "Serviço não informado";
}

function getAppointmentStatusLabel(appointment: ImpactedAppointment) {
  return getAppointmentStatusDisplayLabel(appointment.status_code, appointment.status_name);
}

export function ScheduleBlockModal({
  currentUser,
  initialDate,
  initialProfessional,
  initialStartTime,
  mode,
  professionals,
  onClose,
  onCreated,
}: ScheduleBlockModalProps) {
  const selectedDate = formatDateForQuery(initialDate);
  const timeSlots = useMemo(() => generateTimeSlots(), []);
  const endTimeOptions = useMemo(() => [...timeSlots, DEFAULT_WORKING_HOURS.end], [timeSlots]);
  const defaultStartTime = initialStartTime ?? DEFAULT_WORKING_HOURS.start;
  const [scope, setScope] = useState<ScheduleBlockScope>(mode === "time" ? "all" : "professional");
  const [professionalId, setProfessionalId] = useState(initialProfessional?.id ?? professionals[0]?.id ?? "");
  const [blockDate, setBlockDate] = useState(selectedDate);
  const [startDate, setStartDate] = useState(selectedDate);
  const [endDate, setEndDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(addMinutesToTime(defaultStartTime, 30));
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [impactedAppointments, setImpactedAppointments] = useState<ImpactedAppointment[]>([]);
  const [pendingBlockRequest, setPendingBlockRequest] = useState<PendingBlockRequest | null>(null);

  function getProfessionalLabel(appointment: ImpactedAppointment) {
    return (
      appointment.professional_name ??
      professionals.find((professional) => professional.id === appointment.professional_id)?.name ??
      "Profissional não informado"
    );
  }

  function openWhatsAppNotice(appointment: ImpactedAppointment) {
    const phone = normalizePhoneForWhatsApp(appointment.client_phone);

    if (!phone) {
      return;
    }

    const professionalName = getProfessionalLabel(appointment);
    const message = `Olá, ${appointment.client_name ?? "cliente"}! Tudo bem?

Precisamos avisar que o profissional ${professionalName} ficará indisponível no dia ${formatDateLabel(appointment.scheduled_date)} no horário do seu agendamento.

Seu agendamento:
Serviço: ${getAppointmentServiceLabel(appointment)}
Horário: ${formatTime(appointment.start_time)}

Podemos remarcar para outro horário?`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  async function loadImpactedAppointments(professionalIds: string[], dates: string[]) {
    const { data, error } = await supabase
      .from("v_appointments_full")
      .select(
        "id, scheduled_date, start_time, end_time, client_name, client_phone, procedure_name, category_name, professional_id, professional_name, status_code, status_name",
      )
      .in("professional_id", professionalIds)
      .in("scheduled_date", dates)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .not("status_code", "eq", "cancelled")
      .not("status_code", "eq", "no_show")
      .not("status_code", "eq", "rescheduled")
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("CHECK BLOCK CONFLICTS ERROR:", error);
      throw error;
    }

    const uniqueAppointments = new Map<string, ImpactedAppointment>();

    ((data ?? []) as ImpactedAppointment[]).forEach((appointment) => {
      uniqueAppointments.set(appointment.id, appointment);
    });

    return [...uniqueAppointments.values()];
  }

  async function createPendingScheduleBlocks(blockRequest: PendingBlockRequest) {
    const records = blockRequest.dates.flatMap((date) =>
      blockRequest.professionalIds.map((id) => ({
        block_date: date,
        created_by: currentUser.id,
        end_time: endTime,
        professional_id: id,
        reason: reason.trim() || null,
        start_time: startTime,
      })),
    );

    const { error } = await supabase.from("schedule_blocks").insert(records);

    if (error) {
      console.error("CREATE SCHEDULE BLOCK ERROR:", error);
      throw error;
    }

    onCreated(mode === "professional" ? "Profissional bloqueado com sucesso." : "Horário bloqueado com sucesso.");
    onClose();
  }

  async function handleCreateBlock() {
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setErrorMessage("O horário final precisa ser maior que o horário inicial.");
      return;
    }

    if (!isTimeRangeWithinWorkingHours(startTime, endTime)) {
      setErrorMessage(
        `O bloqueio deve ficar entre ${DEFAULT_WORKING_HOURS.start} e ${DEFAULT_WORKING_HOURS.end}.`,
      );
      return;
    }

    const dates = mode === "professional" ? getDateRange(startDate, endDate || startDate) : [blockDate];

    if (dates.length === 0) {
      setErrorMessage("Selecione um período válido.");
      return;
    }

    const professionalIds =
      mode === "professional" || scope === "professional"
        ? [professionalId].filter(Boolean)
        : professionals.map((professional) => professional.id);

    if (professionalIds.length === 0) {
      setErrorMessage("Selecione ao menos um profissional.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const impacted = await loadImpactedAppointments(professionalIds, dates);

      if (impacted.length > 0) {
        setImpactedAppointments(impacted);
        setPendingBlockRequest({ dates, professionalIds });
        setIsSaving(false);
        return;
      }

      const records = dates.flatMap((date) =>
        professionalIds.map((id) => ({
          block_date: date,
          created_by: currentUser.id,
          end_time: endTime,
          professional_id: id,
          reason: reason.trim() || null,
          start_time: startTime,
        })),
      );

      const { error } = await supabase.from("schedule_blocks").insert(records);

      if (error) {
        console.error("CREATE SCHEDULE BLOCK ERROR:", error);
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }

      onCreated(mode === "professional" ? "Profissional bloqueado com sucesso." : "Horário bloqueado com sucesso.");
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao bloquear horário.");
      setIsSaving(false);
    }
  }

  async function handleContinueBlock() {
    if (!pendingBlockRequest) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await createPendingScheduleBlocks(pendingBlockRequest);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao bloquear horário.");
      setIsSaving(false);
    }
  }

  if (pendingBlockRequest && impactedAppointments.length > 0) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section
          aria-labelledby="impacted-appointments-title"
          className="appointment-modal appointment-modal--wide appointment-modal--impacted"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="appointment-modal__header">
            <div>
              <h2 id="impacted-appointments-title">Clientes impactados</h2>
              <p>Existem clientes agendados nesse período. Avise os clientes antes de confirmar o bloqueio.</p>
            </div>
            <button aria-label="Cancelar bloqueio" className="icon-button" onClick={onClose} type="button">
              x
            </button>
          </div>

          {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

          <div className="appointment-modal__body impacted-appointments">
            <div className="impacted-appointments__list">
              {impactedAppointments.map((appointment) => {
                const whatsappPhone = normalizePhoneForWhatsApp(appointment.client_phone);

                return (
                  <article className="impacted-appointment-card" key={appointment.id}>
                    <div className="impacted-appointment-card__header">
                      <div>
                        <span>Cliente</span>
                        <strong>{appointment.client_name ?? "Cliente sem nome"}</strong>
                      </div>
                      <span>{appointment.client_phone ?? "Cliente sem telefone"}</span>
                    </div>

                    <dl className="impacted-appointment-card__details">
                      <div>
                        <dt>Serviço</dt>
                        <dd>{getAppointmentServiceLabel(appointment)}</dd>
                      </div>
                      <div>
                        <dt>Data</dt>
                        <dd>{formatDateLabel(appointment.scheduled_date)}</dd>
                      </div>
                      <div>
                        <dt>Horário</dt>
                        <dd>
                          {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{getAppointmentStatusLabel(appointment)}</dd>
                      </div>
                      <div>
                        <dt>Profissional</dt>
                        <dd>{getProfessionalLabel(appointment)}</dd>
                      </div>
                    </dl>

                    <button
                      className="secondary-button"
                      disabled={!whatsappPhone}
                      onClick={() => openWhatsAppNotice(appointment)}
                      type="button"
                    >
                      {whatsappPhone ? "Chamar no WhatsApp" : "Cliente sem telefone"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="appointment-modal__footer">
            <button className="cancel-button" disabled={isSaving} onClick={onClose} type="button">
              Cancelar bloqueio
            </button>
            <button className="save-button" disabled={isSaving} onClick={handleContinueBlock} type="button">
              {isSaving ? "Bloqueando..." : "Continuar bloqueio"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="appointment-modal appointment-modal--block" onMouseDown={(event) => event.stopPropagation()}>
        <div className="appointment-modal__header">
          <div>
            <h2>{mode === "professional" ? "Bloquear profissional" : "Bloquear horário"}</h2>
            <p>Defina o período em que a agenda ficará indisponível.</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body appointment-modal__body--block">
          {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

          <div className="modal-form-grid schedule-block-grid">
          {mode === "time" ? (
            <>
              <AppDatePicker className="field-label" label="Data" onChange={setBlockDate} value={blockDate} />
              <label className="field-label">
                Afetar
                <select onChange={(event) => setScope(event.target.value as ScheduleBlockScope)} value={scope}>
                  <option value="all">Todos os profissionais</option>
                  <option value="professional">Profissional específico</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <AppDatePicker
                className="field-label"
                label="Data inicial"
                maxDate={endDate || undefined}
                onChange={setStartDate}
                value={startDate}
              />
              <AppDatePicker
                className="field-label"
                label="Data final"
                minDate={startDate || undefined}
                onChange={setEndDate}
                value={endDate}
              />
            </>
          )}

          {(mode === "professional" || scope === "professional") ? (
            <label className="field-label schedule-block-professional">
              Profissional
              <select onChange={(event) => setProfessionalId(event.target.value)} value={professionalId}>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {professional.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field-label schedule-block-start">
            Horário inicial
            <select onChange={(event) => setStartTime(event.target.value)} value={startTime}>
              {timeSlots.map((timeSlot) => (
                <option key={timeSlot} value={timeSlot}>
                  {timeSlot}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label schedule-block-end">
            Horário final
            <select onChange={(event) => setEndTime(event.target.value)} value={endTime}>
              {endTimeOptions.map((timeSlot) => (
                <option key={timeSlot} value={timeSlot}>
                  {timeSlot}
                </option>
              ))}
            </select>
          </label>
          </div>

          <label className="field-label field-label--full schedule-block-reason">
            Motivo
            <textarea onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        </div>

        <div className="appointment-modal__footer">
          <button className="cancel-button" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="save-button" disabled={isSaving} onClick={handleCreateBlock} type="button">
            {isSaving ? "Bloqueando..." : "Bloquear"}
          </button>
        </div>
      </section>
    </div>
  );
}
