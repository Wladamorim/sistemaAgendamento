import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_WORKING_HOURS,
  addMinutesToTime,
  formatDate,
  formatDateForQuery,
  formatTime,
  isTimeRangeWithinWorkingHours,
  timeToMinutes,
} from "../../lib/agenda";
import { supabase } from "../../lib/supabase";
import type { Client, Procedure, ScheduleBlock, SelectedAgendaSlot } from "../../types/agenda";
import { ClientStep, emptyNewClientDraft, type ClientMode, type NewClientDraft } from "./ClientStep";
import { ProcedureSelect } from "./ProcedureSelect";

interface AppointmentCreateModalProps {
  initialClient?: Client | null;
  selectedDate: Date;
  scheduleBlocks: ScheduleBlock[];
  slot: SelectedAgendaSlot;
  onClose: () => void;
  onCreated: () => void;
}

interface ProcedureProfessionalRow {
  procedure_id: string;
  procedures: Procedure | Procedure[] | null;
}

interface SelectedServiceItem {
  id: string;
  procedure: Procedure;
  professional_id: string;
  duration_minutes: number;
  price_at_booking: number | string;
}

interface AppointmentConflict {
  id: string;
  client_id: string | null;
  professional_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status_code: string | null;
}

interface AppointmentItemInsertPayload {
  appointment_id: string;
  procedure_id: string;
  professional_id: string;
  duration_minutes: number;
  price_at_booking: number;
  payment_method: string | null;
  payment_installments: number | null;
  payment_details: unknown | null;
  paid_amount: number | null;
  combo_usage_id: string | null;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Erro desconhecido.";
  }

  const supabaseError = error as {
    code?: string | null;
    details?: string | null;
    hint?: string | null;
    message?: string | null;
  };

  return [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
    supabaseError.code ? `Código: ${supabaseError.code}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function isTimeConflictError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const supabaseError = error as { code?: string | null; message?: string | null };
  const message = supabaseError.message?.toLowerCase() ?? "";

  return (
    supabaseError.code === "23P01" ||
    message.includes("appointments_no_time_overlap") ||
    message.includes("exclusion constraint") ||
    message.includes("conflicting key value")
  );
}

function getAppointmentConflictMessage(conflict?: AppointmentConflict | null) {
  if (!conflict?.start_time || !conflict.end_time) {
    return "Esse horário já está ocupado para este profissional. Escolha outro horário.";
  }

  return `Esse horário já está ocupado para este profissional. Já existe um agendamento entre ${formatTime(
    conflict.start_time,
  )} e ${formatTime(conflict.end_time)}.`;
}

function getJoinedProcedure(row: ProcedureProfessionalRow) {
  return Array.isArray(row.procedures) ? row.procedures[0] : row.procedures;
}

function doesBlockOverlap(block: ScheduleBlock, targetProfessionalId: string, startTime: string, endTime: string) {
  if (block.professional_id && block.professional_id !== targetProfessionalId) {
    return false;
  }

  return timeToMinutes(block.start_time) < timeToMinutes(endTime) && timeToMinutes(block.end_time) > timeToMinutes(startTime);
}

export function AppointmentCreateModal({
  initialClient = null,
  selectedDate,
  scheduleBlocks,
  slot,
  onClose,
  onCreated,
}: AppointmentCreateModalProps) {
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [availableProcedures, setAvailableProcedures] = useState<Procedure[]>([]);
  const [isLoadingProcedures, setIsLoadingProcedures] = useState(false);
  const [procedureLinkMessage, setProcedureLinkMessage] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientMode, setClientMode] = useState<ClientMode>(null);
  const [newClient, setNewClient] = useState<NewClientDraft>(emptyNewClientDraft);
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedServices, setSelectedServices] = useState<SelectedServiceItem[]>([]);
  const displayDate = selectedDate;
  const effectiveDate = formatDateForQuery(selectedDate);
  const effectiveProfessionalId = slot.professional.id;
  const effectiveStartTime = slot.startTime;
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate);

  const validSelectedServices = useMemo(
    () =>
      selectedServices.filter(
        (service) =>
          Boolean(service.procedure?.id) &&
          Boolean(service.professional_id || effectiveProfessionalId) &&
          Number(service.duration_minutes) > 0,
      ),
    [effectiveProfessionalId, selectedServices],
  );

  const totalDuration = useMemo(
    () => validSelectedServices.reduce((sum, service) => sum + Number(service.duration_minutes), 0),
    [validSelectedServices],
  );
  const calculatedEndTime = effectiveStartTime && totalDuration > 0 ? addMinutesToTime(effectiveStartTime, totalDuration) : "";
  const effectiveEndTime = calculatedEndTime;
  const endTime = effectiveEndTime;
  const exceedsWorkingHours = Boolean(
    effectiveStartTime && effectiveEndTime && !isTimeRangeWithinWorkingHours(effectiveStartTime, effectiveEndTime),
  );

  useEffect(() => {
    if (!initialClient) {
      return;
    }

    setClientMode("existing");
    setSelectedClient(initialClient);
  }, [initialClient]);

  function addServiceToList(procedure = selectedProcedure) {
    if (!procedure) {
      setErrorMessage("Selecione um serviço.");
      return;
    }

    const isAlreadyAdded = selectedServices.some((service) => service.procedure.id === procedure.id);
    if (isAlreadyAdded) {
      setErrorMessage("Este serviço já foi adicionado.");
      setSelectedProcedure(null);
      return;
    }

    if (!procedure.duration_minutes) {
      setErrorMessage("O serviço selecionado não possui duração cadastrada.");
      setSelectedProcedure(null);
      return;
    }

    const newService: SelectedServiceItem = {
      id: `${Date.now()}-${Math.random()}`,
      procedure,
      professional_id: effectiveProfessionalId,
      duration_minutes: procedure.duration_minutes,
      price_at_booking: procedure.price ?? 0,
    };

    setSelectedServices([...selectedServices, newService]);
    setSelectedProcedure(null);
    setErrorMessage(null);
  }

  function handleSelectProcedure(procedure: Procedure) {
    setSelectedProcedure(procedure);
    addServiceToList(procedure);
  }

  function removeServiceFromList(serviceId: string) {
    setSelectedServices((services) => services.filter((service) => service.id !== serviceId));
    setErrorMessage(null);
  }

  const totalPrice = useMemo(
    () => validSelectedServices.reduce((sum, service) => sum + Number(service.price_at_booking), 0),
    [validSelectedServices],
  );
  const isNewClientValid = clientMode === "new" && Boolean(newClient.full_name.trim() && newClient.phone.trim());

  const missingRequiredFields = useMemo(() => {
    const missingFields: string[] = [];

    if (!selectedClient && !isNewClientValid) {
      missingFields.push("cliente");
    }

    if (selectedServices.length === 0) {
      missingFields.push("serviço");
    }

    if (selectedServices.length > 0 && validSelectedServices.length !== selectedServices.length) {
      missingFields.push("serviço válido");
    }

    if (!effectiveProfessionalId) {
      missingFields.push("profissional");
    }

    if (!hasValidDate) {
      missingFields.push("data");
    }

    if (!effectiveStartTime) {
      missingFields.push("horário");
    }

    return [...new Set(missingFields)];
  }, [
    effectiveProfessionalId,
    effectiveStartTime,
    hasValidDate,
    isNewClientValid,
    selectedClient,
    selectedServices.length,
    validSelectedServices.length,
  ]);

  const disabledReason = isLoadingProcedures
    ? "Carregando serviços do profissional."
    : exceedsWorkingHours
      ? `O atendimento terminaria às ${formatTime(effectiveEndTime)}, após o fechamento às ${DEFAULT_WORKING_HOURS.end}.`
      : missingRequiredFields.length
        ? `Falta selecionar: ${missingRequiredFields.join(", ")}.`
        : "";
  const createButtonDisabled = isSaving || isLoadingProcedures || exceedsWorkingHours || missingRequiredFields.length > 0;

  useEffect(() => {
    let isMounted = true;

    async function loadLinkedProcedures() {
      setSelectedProcedure(null);
      setAvailableProcedures([]);
      setIsLoadingProcedures(true);
      setProcedureLinkMessage(null);

      const { data, error } = await supabase
        .from("procedure_professional")
        .select(
          `
          procedure_id,
          procedures (
            id,
            name,
            description,
            price,
            duration_minutes,
            category_id,
            is_active,
            procedure_categories (
              id,
              name
            )
          )
        `,
        )
        .eq("professional_id", slot.professional.id);

      if (!isMounted) {
        return;
      }

      setIsLoadingProcedures(false);

      if (error) {
        console.error("LOAD LINKED PROCEDURES ERROR:", error);
        setAvailableProcedures([]);
        setProcedureLinkMessage("Erro ao carregar serviços vinculados ao profissional.");
        return;
      }

      const linkedProcedures = ((data ?? []) as ProcedureProfessionalRow[])
        .map(getJoinedProcedure)
        .filter((procedure): procedure is Procedure => Boolean(procedure?.id && procedure.is_active === true));

      setAvailableProcedures(linkedProcedures);

      if (linkedProcedures.length === 0) {
        setProcedureLinkMessage(
          "Este profissional não possui serviços vinculados. Vincule serviços ao profissional antes de criar agendamentos.",
        );
      }
    }

    loadLinkedProcedures();

    return () => {
      isMounted = false;
    };
  }, [slot.professional.id]);

  async function createNewClient() {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        full_name: newClient.full_name.trim(),
        phone: newClient.phone.trim(),
        birth_date: newClient.birth_date || null,
        notes: newClient.notes.trim() || null,
        is_active: true,
      })
      .select("id, full_name, phone, birth_date, notes")
      .single();

    if (error) {
      console.error("CREATE CLIENT ERROR:", error);
      throw error;
    }

    return data as Client;
  }

  async function handleCreateAppointment() {
    console.log("[CreateAppointment] selectedClient:", selectedClient);
    console.log("[CreateAppointment] selectedClientId:", selectedClient?.id ?? null);
    console.log("[CreateAppointment] selectedServices:", selectedServices);
    console.log("[CreateAppointment] effectiveDate:", effectiveDate);
    console.log("[CreateAppointment] effectiveProfessionalId:", effectiveProfessionalId);
    console.log("[CreateAppointment] effectiveStartTime:", effectiveStartTime);
    console.log("[CreateAppointment] effectiveEndTime:", effectiveEndTime);
    console.log("[CreateAppointment] missingFields:", missingRequiredFields);

    if (missingRequiredFields.length > 0) {
      setErrorMessage(`Falta selecionar: ${missingRequiredFields.join(", ")}.`);
      return;
    }

    if (!endTime) {
      setErrorMessage("Não foi possível criar: horário final inválido.");
      return;
    }

    if (exceedsWorkingHours) {
      setErrorMessage(
        `O atendimento terminaria às ${formatTime(endTime)}, após o fechamento às ${DEFAULT_WORKING_HOURS.end}.`,
      );
      return;
    }

    if (scheduleBlocks.some((block) => doesBlockOverlap(block, effectiveProfessionalId, effectiveStartTime, endTime))) {
      setErrorMessage("Este horário está bloqueado para agendamentos.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { data: conflicts, error: conflictError } = await supabase
      .from("appointments")
      .select("id, client_id, professional_id, scheduled_date, start_time, end_time, status_code")
      .eq("professional_id", effectiveProfessionalId)
      .eq("scheduled_date", effectiveDate)
      .lt("start_time", effectiveEndTime)
      .gt("end_time", effectiveStartTime)
      .neq("status_code", "cancelled");

    console.log("[ConflictCheck] effectiveProfessionalId:", effectiveProfessionalId);
    console.log("[ConflictCheck] effectiveDate:", effectiveDate);
    console.log("[ConflictCheck] effectiveStartTime:", effectiveStartTime);
    console.log("[ConflictCheck] effectiveEndTime:", effectiveEndTime);
    console.log("[ConflictCheck] conflicts:", conflicts);
    console.log("[ConflictCheck] conflictError:", conflictError);

    if (conflictError) {
      console.error("[CreateAppointment] erro ao verificar disponibilidade:", conflictError);
      setErrorMessage(`Erro ao verificar disponibilidade: ${formatSupabaseError(conflictError)}`);
      setIsSaving(false);
      return;
    }

    const realConflicts = ((conflicts ?? []) as AppointmentConflict[]).filter(
      (item) =>
        item.professional_id === effectiveProfessionalId &&
        item.scheduled_date === effectiveDate &&
        formatTime(item.start_time) < formatTime(effectiveEndTime) &&
        formatTime(item.end_time) > formatTime(effectiveStartTime) &&
        item.status_code !== "cancelled",
    );

    if (realConflicts.length > 0) {
      const conflict = realConflicts[0];
      console.log("[CreateAppointment] conflito de horário encontrado antes do insert:", conflict);
      setErrorMessage(getAppointmentConflictMessage(conflict));
      setIsSaving(false);
      return;
    }

    let clientForAppointment = selectedClient;

    if (clientMode === "new") {
      try {
        clientForAppointment = await createNewClient();
        setSelectedClient(clientForAppointment);
      } catch {
        setErrorMessage("Erro ao cadastrar cliente.");
        setIsSaving(false);
        return;
      }
    }

    if (!clientForAppointment) {
      setErrorMessage("Selecione um cliente.");
      setIsSaving(false);
      return;
    }

    const firstService = validSelectedServices[0];

    if (!firstService?.procedure?.id) {
      setErrorMessage("Não foi possível criar: serviço selecionado sem ID.");
      setIsSaving(false);
      return;
    }

    if (!clientForAppointment.id) {
      setErrorMessage("Não foi possível criar: cliente sem ID.");
      setIsSaving(false);
      return;
    }

    const invalidService = validSelectedServices.find((service) => !service.procedure?.id);

    if (invalidService) {
      console.error("[CreateAppointment] serviço selecionado inválido:", invalidService);
      setErrorMessage("Não foi possível criar: serviço selecionado sem ID.");
      setIsSaving(false);
      return;
    }

    const appointmentPayload = {
      client_id: clientForAppointment.id,
      procedure_id: firstService.procedure.id,
      professional_id: effectiveProfessionalId,
      scheduled_date: effectiveDate,
      start_time: effectiveStartTime,
      end_time: endTime,
      price_at_booking: firstService.price_at_booking,
      duration_at_booking: totalDuration,
      status_code: "scheduled",
      notes: notes.trim() || null,
    };

    const appointmentItemsDraftPayload = validSelectedServices.map((service) => ({
      procedure_id: service.procedure.id,
      professional_id: service.professional_id || effectiveProfessionalId,
      duration_minutes: Number(service.duration_minutes),
      price_at_booking: Number(service.price_at_booking ?? 0),
    }));

    console.log("[CreateAppointment] appointmentPayload:", appointmentPayload);
    console.log("[CreateAppointment] appointmentItemsDraftPayload:", appointmentItemsDraftPayload);

    const { data: appointmentData, error: appointmentError } = await supabase
      .from("appointments")
      .insert(appointmentPayload)
      .select("id")
      .single();

    if (appointmentError) {
      if (isTimeConflictError(appointmentError)) {
        console.error("[CreateAppointment] conflito de horário:", appointmentError);
        setErrorMessage("Esse horário já está ocupado para este profissional. Escolha outro horário.");
        setIsSaving(false);
        return;
      }

      console.error("[CreateAppointment] erro ao criar appointment:", appointmentError);
      setErrorMessage(`Erro ao criar agendamento: ${formatSupabaseError(appointmentError)}`);
      setIsSaving(false);
      return;
    }

    if (!appointmentData) {
      setErrorMessage("Erro ao criar agendamento: Supabase não retornou o ID do agendamento.");
      setIsSaving(false);
      return;
    }

    const appointmentId = appointmentData.id;

    const appointmentItemsPayload: AppointmentItemInsertPayload[] = appointmentItemsDraftPayload.map((item) => ({
      appointment_id: appointmentId,
      procedure_id: item.procedure_id,
      professional_id: item.professional_id,
      duration_minutes: item.duration_minutes,
      price_at_booking: item.price_at_booking,
      payment_method: null,
      payment_installments: null,
      payment_details: null,
      paid_amount: null,
      combo_usage_id: null,
    }));

    console.log("[CreateAppointment] appointmentItemsPayload:", appointmentItemsPayload);

    const { error: itemsError } = await supabase.from("appointment_items").insert(appointmentItemsPayload);

    if (itemsError) {
      console.error("[CreateAppointment] erro ao criar appointment_items:", itemsError);
      console.log("[CreateAppointment] rollback appointment_id:", appointmentId);

      const { error: rollbackError } = await supabase.from("appointments").delete().eq("id", appointmentId);

      if (rollbackError) {
        console.error("[CreateAppointment] erro ao desfazer appointment:", rollbackError);
        setErrorMessage(
          `Erro ao criar itens do agendamento: ${formatSupabaseError(itemsError)} | Rollback falhou: ${formatSupabaseError(rollbackError)}`,
        );
      } else {
        setErrorMessage(`Erro ao criar itens do agendamento: ${formatSupabaseError(itemsError)}`);
      }

      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="create-appointment-title"
        className="appointment-modal appointment-modal--wide appointment-modal--create"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="create-appointment-title">Criar agendamento</h2>
            <p>
              {formatDate(displayDate)} · {formatTime(effectiveStartTime)}
              {endTime ? ` - ${formatTime(endTime)}` : ""}
            </p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

        <div className="appointment-modal__body">
          <section className="modal-section selected-professional-card">
            <span>Profissional selecionado</span>
            <strong>{slot.professional.name}</strong>
            <p>{slot.professional.work_description ?? slot.professional.work_type ?? "Descrição não informada"}</p>
            <div className="appointment-slot-summary">
              <span>Data e horário</span>
              <strong>{formatDate(displayDate)}</strong>
              <small>Início: {formatTime(effectiveStartTime)}</small>
              <small>Fim estimado: {effectiveEndTime ? formatTime(effectiveEndTime) : "Selecione um serviço"}</small>
            </div>
          </section>

          <div className="modal-section">
            <h3>Selecionar serviços</h3>
            <ProcedureSelect
              emptyMessage="Este profissional não possui serviços vinculados."
              errorMessage={procedureLinkMessage?.startsWith("Erro") ? procedureLinkMessage : null}
              isLoading={isLoadingProcedures}
              onSelect={handleSelectProcedure}
              procedures={availableProcedures}
              selectedProcedure={selectedProcedure}
            />
            {procedureLinkMessage && !procedureLinkMessage.startsWith("Erro") ? (
              <p className="muted-text">{procedureLinkMessage}</p>
            ) : null}

          </div>

          {selectedServices.length > 0 && (
            <div className="modal-section">
              <h3>Serviços selecionados ({selectedServices.length})</h3>
              <div className="appointment-items-list">
                {selectedServices.map((service, index) => (
                  <div key={service.id} className="appointment-item-card">
                    <div className="appointment-item-info">
                      <strong>
                        {index + 1}. {service.procedure.name}
                      </strong>
                      <span className="muted-text">
                        {service.duration_minutes} min · R$ {Number(service.price_at_booking).toFixed(2)}
                      </span>
                    </div>
                    <button
                      aria-label={`Remover ${service.procedure.name}`}
                      className="icon-button icon-button--small"
                      onClick={() => removeServiceFromList(service.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="appointment-summary">
                <div className="summary-row">
                  <span>Duração total:</span>
                  <strong>{totalDuration} min</strong>
                </div>
                <div className="summary-row">
                  <span>Valor total:</span>
                  <strong>R$ {totalPrice.toFixed(2)}</strong>
                </div>
                <div className="summary-row">
                  <span>Horário:</span>
                  <strong>
                    {formatTime(effectiveStartTime)} - {formatTime(endTime)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          <ClientStep
            mode={clientMode}
            newClient={newClient}
            onModeChange={setClientMode}
            onNewClientChange={setNewClient}
            onSelectClient={setSelectedClient}
            selectedClient={selectedClient}
          />

          <section className="modal-section">
            <h3>Observações do agendamento</h3>
            <label className="field-label">
              Notas
              <textarea onChange={(event) => setNotes(event.target.value)} value={notes} />
            </label>
          </section>
        </div>

        <div className="appointment-modal__footer">
          {createButtonDisabled && disabledReason ? (
            <p className="appointment-required-hint" aria-live="polite">
              {disabledReason}
            </p>
          ) : null}
          <button className="cancel-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="save-button"
            disabled={createButtonDisabled}
            onClick={handleCreateAppointment}
            type="button"
          >
            {isSaving ? "Salvando..." : "Criar agendamento"}
          </button>
        </div>
      </section>
    </div>
  );
}
