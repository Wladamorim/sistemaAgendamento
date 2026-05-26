import { useMemo, useState } from "react";
import { addDays, addMinutesToTime, formatDateForQuery, generateTimeSlots, timeToMinutes } from "../../lib/agenda";
import { supabase } from "../../lib/supabase";
import type { Professional } from "../../types/agenda";
import type { AppUser } from "../../types/user";

type ScheduleBlockMode = "time" | "professional";
type ScheduleBlockScope = "all" | "professional";

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
  const timeSlots = useMemo(() => generateTimeSlots("08:00", "20:00", 30), []);
  const defaultStartTime = initialStartTime ?? "08:00";
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

  async function warnIfConflicts(professionalIds: string[], dates: string[]) {
    let query = supabase
      .from("v_appointments_full")
      .select("id")
      .in("professional_id", professionalIds)
      .in("scheduled_date", dates)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .not("status_code", "eq", "cancelled")
      .not("status_code", "eq", "no_show")
      .not("status_code", "eq", "rescheduled")
      .limit(1);

    const { data, error } = await query;

    if (error) {
      console.error("CHECK BLOCK CONFLICTS ERROR:", error);
      throw error;
    }

    if ((data ?? []).length > 0) {
      return window.confirm("Existem agendamentos nesse período. Revise antes de bloquear.");
    }

    return true;
  }

  async function handleCreateBlock() {
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setErrorMessage("O horário final precisa ser maior que o horário inicial.");
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
      const canContinue = await warnIfConflicts(professionalIds, dates);

      if (!canContinue) {
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

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="appointment-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="appointment-modal__header">
          <div>
            <h2>{mode === "professional" ? "Bloquear profissional" : "Bloquear horário"}</h2>
            <p>Defina o período em que a agenda ficará indisponível.</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

        <div className="modal-form-grid">
          {mode === "time" ? (
            <>
              <label className="field-label">
                Data
                <input onChange={(event) => setBlockDate(event.target.value)} type="date" value={blockDate} />
              </label>
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
              <label className="field-label">
                Data inicial
                <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
              </label>
              <label className="field-label">
                Data final
                <input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
              </label>
            </>
          )}

          {(mode === "professional" || scope === "professional") ? (
            <label className="field-label">
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

          <label className="field-label">
            Horário inicial
            <select onChange={(event) => setStartTime(event.target.value)} value={startTime}>
              {timeSlots.map((timeSlot) => (
                <option key={timeSlot} value={timeSlot}>
                  {timeSlot}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Horário final
            <select onChange={(event) => setEndTime(event.target.value)} value={endTime}>
              {timeSlots.map((timeSlot) => (
                <option key={timeSlot} value={timeSlot}>
                  {timeSlot}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field-label">
          Motivo
          <textarea onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>

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
