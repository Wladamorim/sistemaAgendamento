import { useEffect, useMemo, useState } from "react";
import { addMinutesToTime, formatDate, formatDateForQuery, formatTime, timeToMinutes } from "../../lib/agenda";
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

function getInsertErrorMessage(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes("conflict") ||
    normalized.includes("duplicate") ||
    normalized.includes("exclusion") ||
    normalized.includes("ocupado")
  ) {
    return "Esse horário já está ocupado para este profissional.";
  }

  return "Erro ao criar agendamento.";
}

function getJoinedProcedure(row: ProcedureProfessionalRow) {
  return Array.isArray(row.procedures) ? row.procedures[0] : row.procedures;
}

function doesBlockOverlap(block: ScheduleBlock, professionalId: string, startTime: string, endTime: string) {
  if (block.professional_id && block.professional_id !== professionalId) {
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

  useEffect(() => {
    if (!initialClient) {
      return;
    }

    setClientMode("existing");
    setSelectedClient(initialClient);
  }, [initialClient]);

  const endTime = useMemo(() => {
    if (!selectedProcedure?.duration_minutes) {
      return "";
    }

    return addMinutesToTime(slot.startTime, selectedProcedure.duration_minutes);
  }, [selectedProcedure, slot.startTime]);

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
    if (!selectedProcedure) {
      setErrorMessage("Selecione um serviço.");
      return;
    }

    const selectedProcedureIsLinked = availableProcedures.some((procedure) => procedure.id === selectedProcedure.id);

    if (!selectedProcedureIsLinked) {
      setErrorMessage("O serviço selecionado não está vinculado a este profissional.");
      return;
    }

    if (clientMode === "existing" && !selectedClient) {
      setErrorMessage("Selecione um cliente.");
      return;
    }

    if (clientMode === "new" && (!newClient.full_name.trim() || !newClient.phone.trim())) {
      setErrorMessage("Preencha nome e telefone do cliente.");
      return;
    }

    if (!clientMode) {
      setErrorMessage("Informe se o cliente já é cadastrado.");
      return;
    }

    if (!selectedProcedure.duration_minutes) {
      setErrorMessage("O serviço selecionado não possui duração cadastrada.");
      return;
    }

    if (scheduleBlocks.some((block) => doesBlockOverlap(block, slot.professional.id, slot.startTime, endTime))) {
      setErrorMessage("Este horário está bloqueado para agendamentos.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

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

    const { error } = await supabase.from("appointments").insert({
      client_id: clientForAppointment.id,
      procedure_id: selectedProcedure.id,
      professional_id: slot.professional.id,
      scheduled_date: formatDateForQuery(selectedDate),
      start_time: slot.startTime,
      end_time: endTime,
      price_at_booking: selectedProcedure.price ?? 0,
      duration_at_booking: selectedProcedure.duration_minutes,
      status_code: "scheduled",
      notes: notes.trim() || null,
    });

    if (error) {
      console.error("CREATE APPOINTMENT ERROR:", error);
      setErrorMessage(getInsertErrorMessage(error.message));
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
        className="appointment-modal appointment-modal--wide"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="create-appointment-title">Criar agendamento</h2>
            <p>
              {formatDate(selectedDate)} · {formatTime(slot.startTime)}
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
          </section>

          <ProcedureSelect
            emptyMessage="Este profissional não possui serviços vinculados."
            errorMessage={procedureLinkMessage?.startsWith("Erro") ? procedureLinkMessage : null}
            isLoading={isLoadingProcedures}
            onSelect={setSelectedProcedure}
            procedures={availableProcedures}
            selectedProcedure={selectedProcedure}
          />
          {procedureLinkMessage && !procedureLinkMessage.startsWith("Erro") ? (
            <p className="muted-text">{procedureLinkMessage}</p>
          ) : null}

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
          <button className="cancel-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="save-button"
            disabled={isSaving || isLoadingProcedures || !selectedProcedure || availableProcedures.length === 0}
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
