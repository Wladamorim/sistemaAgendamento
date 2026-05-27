import { useEffect, useMemo, useState } from "react";
import {
  addMinutesToTime,
  formatCurrency,
  formatDate,
  formatTime,
  generateTimeSlots,
} from "../../lib/agenda";
import { formatDateValue, getComboBalanceLabel, getComboLinkedLabel, getComboPriceLabel } from "../../lib/combos";
import { supabase } from "../../lib/supabase";
import type { Appointment, AppointmentDetails, Client, Procedure, Professional } from "../../types/agenda";
import type { ClientComboFull } from "../../types/combo";
import type { AppUser } from "../../types/user";

interface AppointmentDetailsModalProps {
  appointment: Appointment;
  currentUser: AppUser;
  onChanged: (message: string) => void;
  onClose: () => void;
}

interface AppointmentRow {
  id: string;
  client_id: string;
  procedure_id: string;
  professional_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_at_booking: number | string | null;
  duration_at_booking: number | null;
  payment_method?: string | null;
  payment_installments?: number | null;
  payment_details?: unknown | null;
  paid_amount?: number | string | null;
  status_code: string | null;
  notes: string | null;
  cancellation_reason: string | null;
}

interface MultiplePaymentItem {
  id: string;
  amount: string;
  installments: string;
  method: string;
  note: string;
}

const inactiveStatusCodes = ["cancelled", "no_show", "rescheduled", "completed"];
const finalizableStatusCodes = ["scheduled", "confirmed", "in_progress"];
const paymentMethodOptions = [
  { label: "Dinheiro", value: "dinheiro" },
  { label: "Pix", value: "pix" },
  { label: "Cartão de débito", value: "cartao_debito" },
  { label: "Cartão de crédito", value: "cartao_credito" },
  { label: "Transferência", value: "transferencia" },
  { label: "Cortesia", value: "cortesia" },
  { label: "Múltiplas formas", value: "multiplas" },
  { label: "Combo", value: "combo" },
  { label: "Outro", value: "outro" },
];
const singlePaymentMethodOptions = paymentMethodOptions.filter((option) => !["multiplas", "combo"].includes(option.value));
const installmentOptions = Array.from({ length: 12 }, (_, index) => index + 1);
const paymentColumnsSql =
  "alter table public.appointments add column if not exists payment_method text, add column if not exists payment_installments integer, add column if not exists payment_details jsonb, add column if not exists paid_amount numeric(10,2);";

function getCategoryName(procedure: Procedure | null) {
  if (!procedure) {
    return "Categoria não informada";
  }

  const category = Array.isArray(procedure.procedure_categories)
    ? procedure.procedure_categories[0]
    : procedure.procedure_categories;

  return category?.name ?? "Categoria não informada";
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }

  return String(value);
}

function getComboPaymentInfo(paymentDetails: unknown) {
  if (!paymentDetails || typeof paymentDetails !== "object") {
    return null;
  }

  const details = paymentDetails as {
    combo_name?: unknown;
    production_value?: unknown;
    sessions_used?: unknown;
    type?: unknown;
  };

  if (details.type !== "combo") {
    return null;
  }

  return {
    comboName: typeof details.combo_name === "string" ? details.combo_name : "Combo",
    productionValue:
      typeof details.production_value === "number" || typeof details.production_value === "string"
        ? details.production_value
        : null,
    sessionsUsed: typeof details.sessions_used === "number" ? details.sessions_used : 1,
  };
}

function getSchedulingErrorMessage(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();

  if (
    normalizedMessage.includes("conflict") ||
    normalizedMessage.includes("duplicate") ||
    normalizedMessage.includes("exclusion") ||
    normalizedMessage.includes("ocupado")
  ) {
    return "Esse horário já está ocupado para este profissional.";
  }

  return errorMessage;
}

function isMissingPaymentMethodColumn(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();

  return (
    ["payment_method", "payment_installments", "payment_details", "paid_amount"].some((columnName) =>
      normalizedMessage.includes(columnName),
    ) && normalizedMessage.includes("does not exist")
  );
}

function parseCurrencyInput(value: string) {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : value.replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getPriceNumber(value: number | string | null | undefined) {
  if (typeof value === "string") {
    return parseCurrencyInput(value);
  }

  return Number(value ?? 0);
}

function createEmptyPaymentItem(): MultiplePaymentItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    amount: "",
    installments: "",
    method: "",
    note: "",
  };
}

export function AppointmentDetailsModal({
  appointment,
  currentUser,
  onChanged,
  onClose,
}: AppointmentDetailsModalProps) {
  const [details, setDetails] = useState<AppointmentDetails | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [showFinishPaymentForm, setShowFinishPaymentForm] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentInstallments, setPaymentInstallments] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [finishPassword, setFinishPassword] = useState("");
  const [compatibleCombos, setCompatibleCombos] = useState<ClientComboFull[]>([]);
  const [isLoadingCombos, setIsLoadingCombos] = useState(false);
  const [selectedClientComboId, setSelectedClientComboId] = useState("");
  const [multiplePayments, setMultiplePayments] = useState<MultiplePaymentItem[]>([createEmptyPaymentItem()]);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newProfessionalId, setNewProfessionalId] = useState("");
  const [reschedulePassword, setReschedulePassword] = useState("");
  const [rescheduleNotes, setRescheduleNotes] = useState("");
  const timeSlots = useMemo(() => generateTimeSlots("08:00", "20:00", 30), []);

  useEffect(() => {
    let isMounted = true;

    async function loadDetails() {
      setIsLoading(true);
      setErrorMessage(null);

      const { data: appointmentData, error: appointmentError } = await supabase
        .from("appointments")
        .select(
          "id, client_id, procedure_id, professional_id, scheduled_date, start_time, end_time, price_at_booking, duration_at_booking, payment_method, payment_installments, payment_details, paid_amount, status_code, notes, cancellation_reason",
        )
        .eq("id", appointment.id)
        .single();

      if (!isMounted) {
        return;
      }

      if (appointmentError) {
        console.error("APPOINTMENT DETAILS ERROR:", appointmentError);
        setErrorMessage(appointmentError.message);
        setIsLoading(false);
        return;
      }

      const row = appointmentData as AppointmentRow;

      const [clientResult, procedureResult, professionalResult, professionalsResult] = await Promise.all([
        supabase
          .from("clients")
          .select("id, full_name, phone, birth_date, notes, allergies, preferences, restrictions")
          .eq("id", row.client_id)
          .maybeSingle(),
        supabase
          .from("procedures")
          .select(
            "id, name, description, price, duration_minutes, category_id, is_active, procedure_categories ( id, name )",
          )
          .eq("id", row.procedure_id)
          .maybeSingle(),
        supabase
          .from("professionals")
          .select("id, name, work_description, work_type, phone, email, is_active")
          .eq("id", row.professional_id)
          .maybeSingle(),
        supabase
          .from("professionals")
          .select("id, name, work_description, work_type, phone, email, is_active")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (!isMounted) {
        return;
      }

      if (clientResult.error || procedureResult.error || professionalResult.error || professionalsResult.error) {
        const error =
          clientResult.error ?? procedureResult.error ?? professionalResult.error ?? professionalsResult.error;
        console.error("APPOINTMENT RELATED DETAILS ERROR:", error);
        setErrorMessage(error?.message ?? "Erro ao carregar detalhes do agendamento.");
        setIsLoading(false);
        return;
      }

      const loadedDetails = {
        ...row,
        payment_method: row.payment_method ?? null,
        client: (clientResult.data as Client | null) ?? null,
        procedure: (procedureResult.data as Procedure | null) ?? null,
        professional: (professionalResult.data as Professional | null) ?? null,
      };

      setDetails(loadedDetails);
      setProfessionals((professionalsResult.data ?? []) as Professional[]);
      setNewDate(row.scheduled_date);
      setNewStartTime(formatTime(row.start_time));
      setNewProfessionalId(row.professional_id);
      setRescheduleNotes(row.notes ?? "");
      setIsLoading(false);
    }

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [appointment.id]);

  useEffect(() => {
    const currentDetails = details;

    if (!currentDetails || paymentMethod !== "combo") {
      setCompatibleCombos([]);
      setSelectedClientComboId("");
      return;
    }

    let isMounted = true;
    const comboClientId = currentDetails.client_id;
    const comboProcedureId = currentDetails.procedure_id;
    const comboCategoryId = currentDetails.procedure?.category_id ?? null;

    async function loadCompatibleCombos() {
      setIsLoadingCombos(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("v_client_combos_full")
        .select("*")
        .eq("client_id", comboClientId)
        .eq("effective_status", "active")
        .gt("remaining_sessions", 0)
        .gte("expiration_date", new Date().toISOString().slice(0, 10))
        .order("expiration_date", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("LOAD COMPATIBLE COMBOS ERROR:", error);
        setCompatibleCombos([]);
        setErrorMessage("Não foi possível carregar combos do cliente. Verifique se a migration de Combos foi aplicada.");
        setIsLoadingCombos(false);
        return;
      }

      const matchingCombos = ((data ?? []) as ClientComboFull[]).filter((combo) => {
        if (combo.linked_type === "procedure") {
          return combo.procedure_id === comboProcedureId;
        }

        return Boolean(comboCategoryId) && combo.category_id === comboCategoryId;
      });

      setCompatibleCombos(matchingCombos);
      setSelectedClientComboId((current) =>
        current && matchingCombos.some((combo) => combo.id === current) ? current : "",
      );
      setIsLoadingCombos(false);
    }

    loadCompatibleCombos();

    return () => {
      isMounted = false;
    };
  }, [details, paymentMethod]);

  async function handleCancelAppointment() {
    if (!details || !reason.trim() || !password.trim()) {
      setErrorMessage("Informe o motivo e a senha.");
      return;
    }

    setIsCancelling(true);
    setErrorMessage(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password,
    });

    if (authError) {
      setErrorMessage("Senha incorreta.");
      setIsCancelling(false);
      return;
    }

    const oldData = { ...details };
    const newData = {
      ...oldData,
      status_code: "cancelled",
      cancellation_reason: reason.trim(),
      updated_by: currentUser.id,
    };

    const { data: updatedAppointment, error: updateError } = await supabase
      .from("appointments")
      .update({
        status_code: "cancelled",
        cancellation_reason: reason.trim(),
        updated_by: currentUser.id,
      })
      .eq("id", details.id)
      .select(
        "id, client_id, procedure_id, professional_id, scheduled_date, start_time, end_time, price_at_booking, duration_at_booking, status_code, notes, cancellation_reason",
      )
      .single();

    if (updateError) {
      console.error("CANCEL APPOINTMENT ERROR:", updateError);
      setErrorMessage(updateError.message);
      setIsCancelling(false);
      return;
    }

    const { error: historyError } = await supabase.from("appointment_history").insert({
      appointment_id: details.id,
      changed_by: currentUser.id,
      action: "cancelled",
      reason: reason.trim(),
      old_data: oldData,
      new_data: updatedAppointment ?? newData,
    });

    if (historyError) {
      console.error("APPOINTMENT HISTORY ERROR:", historyError);
      setErrorMessage(historyError.message);
      setIsCancelling(false);
      return;
    }

    setReason("");
    setPassword("");
    setIsCancelling(false);
    onChanged("Agendamento cancelado com sucesso.");
    onClose();
  }

  async function checkPaymentMethodColumn() {
    const { error } = await supabase
      .from("appointments")
      .select("payment_method, payment_installments, payment_details, paid_amount")
      .limit(1);

    if (!error) {
      return true;
    }

    if (isMissingPaymentMethodColumn(error.message)) {
      setErrorMessage(
        `As colunas de pagamento ainda não existem no Supabase. Rode a migration: ${paymentColumnsSql}`,
      );
      return false;
    }

    setErrorMessage(error.message);
    return false;
  }

  async function verifyCurrentPassword(passwordToCheck: string) {
    if (!passwordToCheck.trim()) {
      setErrorMessage("Informe sua senha.");
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: passwordToCheck,
    });

    if (error) {
      setErrorMessage("Senha incorreta.");
      return false;
    }

    return true;
  }

  function buildPaymentPayload() {
    if (!details) {
      return null;
    }

    const appointmentValue = getPriceNumber(details.price_at_booking ?? details.procedure?.price ?? 0);
    const note = paymentNote.trim() || null;

    if (!paymentMethod) {
      setErrorMessage("Selecione a forma de pagamento.");
      return null;
    }

    if (paymentMethod === "cartao_credito" && !paymentInstallments) {
      setErrorMessage("Selecione a quantidade de parcelas.");
      return null;
    }

    if (paymentMethod === "multiplas") {
      const normalizedItems = multiplePayments
        .map((item) => ({
          amount: parseCurrencyInput(item.amount),
          installments: item.method === "cartao_credito" ? Number(item.installments) : null,
          method: item.method,
          note: item.note.trim() || null,
        }))
        .filter((item) => item.method && item.amount > 0);

      if (normalizedItems.length < 2) {
        setErrorMessage("Informe pelo menos duas formas de pagamento.");
        return null;
      }

      if (normalizedItems.some((item) => item.method === "cartao_credito" && !item.installments)) {
        setErrorMessage("Informe as parcelas do cartão de crédito.");
        return null;
      }

      const total = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
      const difference = Number((appointmentValue - total).toFixed(2));

      if (Math.abs(difference) > 0.009) {
        setErrorMessage(
          difference > 0
            ? `Faltam ${formatCurrency(difference)} para concluir o pagamento.`
            : `Valor excede em ${formatCurrency(Math.abs(difference))}.`,
        );
        return null;
      }

      return {
        paid_amount: appointmentValue,
        payment_details: {
          items: normalizedItems,
          type: "multiplas",
        },
        payment_installments: null,
        payment_method: "multiplas",
      };
    }

    const installments = paymentMethod === "cartao_credito" ? Number(paymentInstallments) : null;
    const paymentDetails: Record<string, unknown> = {
      amount: appointmentValue,
      type: paymentMethod,
    };

    if (installments) {
      paymentDetails.installments = installments;
    }

    if (paymentMethod === "dinheiro" && cashReceived.trim()) {
      const received = parseCurrencyInput(cashReceived);
      paymentDetails.amount_received = received;
      paymentDetails.change = Math.max(0, received - appointmentValue);
    }

    if (note) {
      paymentDetails.note = note;
    }

    return {
      paid_amount: appointmentValue,
      payment_details: paymentDetails,
      payment_installments: installments,
      payment_method: paymentMethod,
    };
  }

  async function handleFinishAppointment() {
    if (!details) {
      return;
    }

    if (!finishPassword.trim()) {
      setErrorMessage("Informe sua senha.");
      return;
    }

    if (paymentMethod === "combo") {
      if (!selectedClientComboId) {
        setErrorMessage("Selecione o combo que será usado neste atendimento.");
        return;
      }

      setIsFinishing(true);
      setErrorMessage(null);

      const passwordIsValid = await verifyCurrentPassword(finishPassword);

      if (!passwordIsValid) {
        setIsFinishing(false);
        return;
      }

      const { error: comboError } = await supabase.rpc("finalize_appointment_with_combo", {
        p_appointment_id: details.id,
        p_client_combo_id: selectedClientComboId,
        p_used_by: currentUser.id,
      });

      if (comboError) {
        console.error("FINISH APPOINTMENT WITH COMBO ERROR:", comboError);
        setErrorMessage(
          comboError.message.includes("finalize_appointment_with_combo")
            ? "A função de finalizar com combo ainda não existe no Supabase. Aplique a migration de Combos."
            : comboError.message,
        );
        setIsFinishing(false);
        return;
      }

      setIsFinishing(false);
      setPaymentMethod("");
      setPaymentInstallments("");
      setPaymentNote("");
      setCashReceived("");
      setFinishPassword("");
      setSelectedClientComboId("");
      setCompatibleCombos([]);
      setMultiplePayments([createEmptyPaymentItem()]);
      setShowFinishPaymentForm(false);
      onChanged("Atendimento finalizado com sucesso.");
      onClose();
      return;
    }

    const paymentPayload = buildPaymentPayload();

    if (!paymentPayload) {
      return;
    }

    setIsFinishing(true);
    setErrorMessage(null);

    const hasPaymentMethodColumn = await checkPaymentMethodColumn();

    if (!hasPaymentMethodColumn) {
      setIsFinishing(false);
      return;
    }

    const passwordIsValid = await verifyCurrentPassword(finishPassword);

    if (!passwordIsValid) {
      setIsFinishing(false);
      return;
    }

    const oldData = { ...details };
    const updatedAt = new Date().toISOString();
    const fallbackNewData = {
      ...oldData,
      ...paymentPayload,
      status_code: "completed",
      updated_at: updatedAt,
      updated_by: currentUser.id,
    };

    const { data: updatedAppointment, error: updateError } = await supabase
      .from("appointments")
      .update({
        ...paymentPayload,
        status_code: "completed",
        updated_at: updatedAt,
        updated_by: currentUser.id,
      })
      .eq("id", details.id)
      .select(
        "id, client_id, procedure_id, professional_id, scheduled_date, start_time, end_time, price_at_booking, duration_at_booking, payment_method, payment_installments, payment_details, paid_amount, status_code, notes, cancellation_reason",
      )
      .single();

    if (updateError) {
      console.error("FINISH APPOINTMENT ERROR:", updateError);
      setErrorMessage(
        isMissingPaymentMethodColumn(updateError.message)
          ? `As colunas de pagamento ainda não existem no Supabase. Rode a migration: ${paymentColumnsSql}`
          : updateError.message,
      );
      setIsFinishing(false);
      return;
    }

    const { error: historyError } = await supabase.from("appointment_history").insert({
      appointment_id: details.id,
      changed_by: currentUser.id,
      action: "completed",
      reason: "Atendimento finalizado",
      old_data: oldData,
      new_data: updatedAppointment ?? fallbackNewData,
    });

    if (historyError) {
      console.error("FINISH HISTORY ERROR:", historyError);
      setErrorMessage(historyError.message);
      setIsFinishing(false);
      return;
    }

    setIsFinishing(false);
    setPaymentMethod("");
    setPaymentInstallments("");
    setPaymentNote("");
    setCashReceived("");
    setFinishPassword("");
    setSelectedClientComboId("");
    setCompatibleCombos([]);
    setMultiplePayments([createEmptyPaymentItem()]);
    setShowFinishPaymentForm(false);
    onChanged("Atendimento finalizado com sucesso.");
    onClose();
  }

  async function isSlotAvailable(professionalId: string, scheduledDate: string, startTime: string, endTime: string) {
    const { data, error } = await supabase
      .from("v_appointments_full")
      .select("id")
      .eq("scheduled_date", scheduledDate)
      .eq("professional_id", professionalId)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .not("status_code", "eq", "cancelled")
      .not("status_code", "eq", "no_show")
      .not("status_code", "eq", "rescheduled")
      .neq("id", details?.id ?? "")
      .limit(1);

    if (error) {
      console.error("CHECK AVAILABILITY ERROR:", error);
      throw error;
    }

    if ((data ?? []).length > 0) {
      return false;
    }

    const { data: blockData, error: blockError } = await supabase
      .from("schedule_blocks")
      .select("id")
      .eq("block_date", scheduledDate)
      .or(`professional_id.is.null,professional_id.eq.${professionalId}`)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(1);

    if (blockError) {
      console.error("CHECK SCHEDULE BLOCK ERROR:", blockError);
      throw blockError;
    }

    return (blockData ?? []).length === 0;
  }

  async function handleRescheduleAppointment() {
    if (!details || !newDate || !newStartTime || !newProfessionalId || !reschedulePassword.trim()) {
      setErrorMessage("Informe nova data, horário, profissional e senha.");
      return;
    }

    const duration = details.duration_at_booking ?? details.procedure?.duration_minutes;

    if (!duration) {
      setErrorMessage("Não foi possível calcular a duração do agendamento.");
      return;
    }

    setIsRescheduling(true);
    setErrorMessage(null);

    const newEndTime = addMinutesToTime(newStartTime, duration);

    try {
      const passwordIsValid = await verifyCurrentPassword(reschedulePassword);

      if (!passwordIsValid) {
        setIsRescheduling(false);
        return;
      }

      const available = await isSlotAvailable(newProfessionalId, newDate, newStartTime, newEndTime);

      if (!available) {
        setErrorMessage("Esse horário já está ocupado para este profissional.");
        setIsRescheduling(false);
        return;
      }

      const oldData = { ...details };
      const rescheduledOldData = {
        ...oldData,
        status_code: "rescheduled",
        updated_by: currentUser.id,
      };

      const { error: updateError } = await supabase
        .from("appointments")
        .update({
          status_code: "rescheduled",
          updated_by: currentUser.id,
        })
        .eq("id", details.id);

      if (updateError) {
        console.error("RESCHEDULE OLD APPOINTMENT ERROR:", updateError);
        setErrorMessage(updateError.message);
        setIsRescheduling(false);
        return;
      }

      const { data: newAppointment, error: insertError } = await supabase
        .from("appointments")
        .insert({
          client_id: details.client_id,
          procedure_id: details.procedure_id,
          professional_id: newProfessionalId,
          scheduled_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
          price_at_booking: details.price_at_booking ?? details.procedure?.price ?? 0,
          duration_at_booking: duration,
          status_code: "scheduled",
          notes: rescheduleNotes.trim() || null,
          created_by: currentUser.id,
        })
        .select(
          "id, client_id, procedure_id, professional_id, scheduled_date, start_time, end_time, price_at_booking, duration_at_booking, status_code, notes, cancellation_reason",
        )
        .single();

      if (insertError) {
        console.error("CREATE RESCHEDULED APPOINTMENT ERROR:", insertError);
        await supabase
          .from("appointments")
          .update({
            status_code: details.status_code,
            updated_by: currentUser.id,
          })
          .eq("id", details.id);
        setErrorMessage(getSchedulingErrorMessage(insertError.message));
        setIsRescheduling(false);
        return;
      }

      const { error: historyError } = await supabase.from("appointment_history").insert({
        appointment_id: details.id,
        changed_by: currentUser.id,
        action: "rescheduled",
        reason: "Agendamento reagendado",
        old_data: oldData,
        new_data: newAppointment ?? rescheduledOldData,
      });

      if (historyError) {
        console.error("RESCHEDULE HISTORY ERROR:", historyError);
        setErrorMessage(historyError.message);
        setIsRescheduling(false);
        return;
      }

      setIsRescheduling(false);
      setReschedulePassword("");
      onChanged("Agendamento reagendado com sucesso.");
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao reagendar agendamento.");
      setIsRescheduling(false);
    }
  }

  function updateMultiplePaymentItem(itemId: string, updates: Partial<MultiplePaymentItem>) {
    setMultiplePayments((items) =>
      items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  }

  function removeMultiplePaymentItem(itemId: string) {
    setMultiplePayments((items) => (items.length > 1 ? items.filter((item) => item.id !== itemId) : items));
  }

  const detailDate = details?.scheduled_date ? new Date(`${details.scheduled_date}T00:00:00`) : null;
  const selectedNewProfessional = professionals.find((professional) => professional.id === newProfessionalId);
  const rescheduleDuration = details?.duration_at_booking ?? details?.procedure?.duration_minutes ?? null;
  const newEndTime = newStartTime && rescheduleDuration ? addMinutesToTime(newStartTime, rescheduleDuration) : "";
  const canEditAppointment = Boolean(details && !inactiveStatusCodes.includes(details.status_code ?? ""));
  const canFinishAppointment = Boolean(details && finalizableStatusCodes.includes(details.status_code ?? ""));
  const comboPaymentInfo = getComboPaymentInfo(details?.payment_details);
  const appointmentValue = getPriceNumber(details?.price_at_booking ?? details?.procedure?.price ?? 0);
  const multiplePaymentTotal = multiplePayments.reduce((sum, item) => sum + parseCurrencyInput(item.amount), 0);
  const multiplePaymentDifference = Number((appointmentValue - multiplePaymentTotal).toFixed(2));
  const finishNeedsInstallments = paymentMethod === "cartao_credito";
  const hasInvalidMultipleCredit = multiplePayments.some(
    (item) => item.method === "cartao_credito" && !item.installments,
  );
  const canSubmitFinish =
    Boolean(finishPassword.trim()) &&
    Boolean(paymentMethod) &&
    (paymentMethod !== "combo" || Boolean(selectedClientComboId)) &&
    (!finishNeedsInstallments || Boolean(paymentInstallments)) &&
    (paymentMethod !== "multiplas" ||
      (multiplePayments.filter((item) => item.method && parseCurrencyInput(item.amount) > 0).length >= 2 &&
        !hasInvalidMultipleCredit &&
        Math.abs(multiplePaymentDifference) <= 0.009));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="appointment-details-title"
        className="appointment-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="appointment-details-title">Detalhes do agendamento</h2>
            <p>{appointment.client_name ?? "Cliente sem nome"}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        {isLoading ? <p className="muted-text">Carregando detalhes...</p> : null}
        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

        {details ? (
          <div className="details-list">
            <div>
              <span>Cliente</span>
              <strong>{displayValue(details.client?.full_name ?? appointment.client_name)}</strong>
            </div>
            <div>
              <span>Telefone</span>
              <strong>{displayValue(details.client?.phone ?? appointment.client_phone)}</strong>
            </div>
            <div>
              <span>Serviço/procedimento</span>
              <strong>{displayValue(details.procedure?.name ?? appointment.procedure_name)}</strong>
            </div>
            <div>
              <span>Categoria</span>
              <strong>{getCategoryName(details.procedure)}</strong>
            </div>
            <div>
              <span>Profissional</span>
              <strong>{displayValue(details.professional?.name ?? appointment.professional_name)}</strong>
            </div>
            <div>
              <span>Data</span>
              <strong>{detailDate ? formatDate(detailDate) : displayValue(details.scheduled_date)}</strong>
            </div>
            <div>
              <span>Horário inicial</span>
              <strong>{formatTime(details.start_time)}</strong>
            </div>
            <div>
              <span>Horário final</span>
              <strong>{formatTime(details.end_time)}</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{formatCurrency(details.price_at_booking)}</strong>
            </div>
            <div>
              <span>Duração</span>
              <strong>{details.duration_at_booking ?? "Não informado"} min</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{displayValue(appointment.status_name ?? details.status_code)}</strong>
            </div>
            {details.payment_method === "combo" ? (
              <>
                <div>
                  <span>Pagamento</span>
                  <strong>Pago com combo</strong>
                </div>
                <div>
                  <span>Combo usado</span>
                  <strong>{comboPaymentInfo?.comboName ?? "Combo"}</strong>
                </div>
                <div>
                  <span>ProduÃ§Ã£o registrada</span>
                  <strong>{formatCurrency(comboPaymentInfo?.productionValue ?? details.price_at_booking)}</strong>
                </div>
              </>
            ) : null}
            <div>
              <span>Observações do agendamento</span>
              <strong>{displayValue(details.notes ?? appointment.appointment_notes)}</strong>
            </div>
            <div>
              <span>Observações do cliente</span>
              <strong>{displayValue(details.client?.notes)}</strong>
            </div>
            <div>
              <span>Alergias</span>
              <strong>{displayValue(details.client?.allergies)}</strong>
            </div>
            <div>
              <span>Preferências</span>
              <strong>{displayValue(details.client?.preferences)}</strong>
            </div>
            <div>
              <span>Restrições</span>
              <strong>{displayValue(details.client?.restrictions)}</strong>
            </div>
          </div>
        ) : null}

        {details && canEditAppointment ? (
          <div className="appointment-actions">
            {canFinishAppointment ? (
              <button
                className="save-button"
                disabled={isFinishing}
                onClick={() => {
                  setShowCancelForm(false);
                  setShowFinishPaymentForm(true);
                  setShowRescheduleForm(false);
                  setErrorMessage(null);
                }}
                type="button"
              >
                {isFinishing ? "Finalizando..." : "Finalizar atendimento"}
              </button>
            ) : null}
            <button
              className="save-button"
              disabled={isFinishing}
                onClick={() => {
                  setShowRescheduleForm((current) => !current);
                  setShowCancelForm(false);
                  setShowFinishPaymentForm(false);
                  setErrorMessage(null);
                }}
              type="button"
            >
              Reagendar
            </button>
            <button
              className="danger-button"
              disabled={isFinishing}
                onClick={() => {
                  setShowCancelForm((current) => !current);
                  setShowFinishPaymentForm(false);
                  setShowRescheduleForm(false);
                  setErrorMessage(null);
                }}
              type="button"
            >
              Cancelar agendamento
            </button>
          </div>
        ) : null}

        {details && showFinishPaymentForm ? (
          <section className="finish-payment-form">
            <div>
              <h3>Finalizar atendimento</h3>
              <p>Confirme sua senha e selecione a forma de pagamento para concluir este atendimento.</p>
            </div>

            <label className="field-label">
              Senha do usuário logado
              <input
                onChange={(event) => setFinishPassword(event.target.value)}
                required
                type="password"
                value={finishPassword}
              />
            </label>

            <label className="field-label">
              Forma de pagamento
              <select
                onChange={(event) => {
                  setPaymentMethod(event.target.value);
                  setPaymentInstallments("");
                  setSelectedClientComboId("");
                }}
                value={paymentMethod}
              >
                <option value="">Selecione</option>
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {paymentMethod === "combo" ? (
              <div className="combo-payment-box">
                <strong>Combo do cliente</strong>
                {isLoadingCombos ? (
                  <span>Carregando combos compativeis...</span>
                ) : compatibleCombos.length === 0 ? (
                  <span>Este cliente não possui combo válido para este serviço ou categoria.</span>
                ) : (
                  <div className="combo-payment-options">
                    {compatibleCombos.map((combo) => (
                      <label
                        className={
                          selectedClientComboId === combo.id
                            ? "combo-payment-option combo-payment-option--selected"
                            : "combo-payment-option"
                        }
                        key={combo.id}
                      >
                        <input
                          checked={selectedClientComboId === combo.id}
                          onChange={() => setSelectedClientComboId(combo.id)}
                          type="radio"
                          value={combo.id}
                        />
                        <span>
                          <strong>{combo.name}</strong>
                          <em>{getComboBalanceLabel(combo)}</em>
                          <small>
                            {getComboLinkedLabel(combo)} Â· Validade: {formatDateValue(combo.expiration_date)} Â· Valor do
                            combo: {getComboPriceLabel(combo)}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {paymentMethod === "cartao_credito" ? (
              <label className="field-label">
                Quantidade de parcelas
                <select
                  onChange={(event) => setPaymentInstallments(event.target.value)}
                  value={paymentInstallments}
                >
                  <option value="">Selecione</option>
                  {installmentOptions.map((installment) => (
                    <option key={installment} value={installment}>
                      {installment}x
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {paymentMethod === "dinheiro" ? (
              <label className="field-label">
                Valor recebido
                <input
                  inputMode="decimal"
                  onChange={(event) => setCashReceived(event.target.value)}
                  placeholder="0,00"
                  value={cashReceived}
                />
              </label>
            ) : null}

            {paymentMethod === "multiplas" ? (
              <div className="payment-split">
                <div className="payment-split__header">
                  <strong>Formas de pagamento</strong>
                  <span>Total do atendimento: {formatCurrency(appointmentValue)}</span>
                </div>

                {multiplePayments.map((item) => (
                  <div className="payment-split__item" key={item.id}>
                    <label className="field-label">
                      Forma
                      <select
                        onChange={(event) =>
                          updateMultiplePaymentItem(item.id, {
                            installments: "",
                            method: event.target.value,
                          })
                        }
                        value={item.method}
                      >
                        <option value="">Selecione</option>
                        {singlePaymentMethodOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Valor
                      <input
                        inputMode="decimal"
                        onChange={(event) => updateMultiplePaymentItem(item.id, { amount: event.target.value })}
                        placeholder="0,00"
                        value={item.amount}
                      />
                    </label>
                    {item.method === "cartao_credito" ? (
                      <label className="field-label">
                        Parcelas
                        <select
                          onChange={(event) =>
                            updateMultiplePaymentItem(item.id, { installments: event.target.value })
                          }
                          value={item.installments}
                        >
                          <option value="">Selecione</option>
                          {installmentOptions.map((installment) => (
                            <option key={installment} value={installment}>
                              {installment}x
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="field-label payment-split__note">
                      Observação
                      <input
                        onChange={(event) => updateMultiplePaymentItem(item.id, { note: event.target.value })}
                        value={item.note}
                      />
                    </label>
                    <button
                      className="ghost-button"
                      onClick={() => removeMultiplePaymentItem(item.id)}
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                ))}

                <button
                  className="secondary-button"
                  onClick={() => setMultiplePayments((items) => [...items, createEmptyPaymentItem()])}
                  type="button"
                >
                  Adicionar forma
                </button>

                <p className={multiplePaymentDifference === 0 ? "payment-diff payment-diff--ok" : "payment-diff"}>
                  {multiplePaymentDifference > 0
                    ? `Faltam ${formatCurrency(multiplePaymentDifference)}`
                    : multiplePaymentDifference < 0
                      ? `Valor excede em ${formatCurrency(Math.abs(multiplePaymentDifference))}`
                      : "Pagamento fechado corretamente."}
                </p>
              </div>
            ) : null}

            {paymentMethod && paymentMethod !== "multiplas" ? (
              <label className="field-label">
                Observação
                <textarea onChange={(event) => setPaymentNote(event.target.value)} value={paymentNote} />
              </label>
            ) : null}

            <div className="finish-payment-form__actions">
              <button
                className="cancel-button"
                disabled={isFinishing}
                onClick={() => {
                  setPaymentMethod("");
                  setPaymentInstallments("");
                  setPaymentNote("");
                  setCashReceived("");
                  setFinishPassword("");
                  setMultiplePayments([createEmptyPaymentItem()]);
                  setShowFinishPaymentForm(false);
                  setErrorMessage(null);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="save-button"
                disabled={!canSubmitFinish || isFinishing}
                onClick={handleFinishAppointment}
                type="button"
              >
                {isFinishing ? "Concluindo..." : "Concluir"}
              </button>
            </div>
          </section>
        ) : null}

        {details && showRescheduleForm ? (
          <section className="reschedule-form">
            <h3>Reagendar</h3>
            <div className="reschedule-summary">
              <div>
                <span>Data atual</span>
                <strong>{detailDate ? formatDate(detailDate) : displayValue(details.scheduled_date)}</strong>
              </div>
              <div>
                <span>Horário atual</span>
                <strong>
                  {formatTime(details.start_time)} - {formatTime(details.end_time)}
                </strong>
              </div>
              <div>
                <span>Profissional atual</span>
                <strong>{displayValue(details.professional?.name ?? appointment.professional_name)}</strong>
              </div>
              <div>
                <span>Procedimento atual</span>
                <strong>{displayValue(details.procedure?.name ?? appointment.procedure_name)}</strong>
              </div>
            </div>

            <div className="modal-form-grid">
              <label className="field-label">
                Nova data
                <input onChange={(event) => setNewDate(event.target.value)} type="date" value={newDate} />
              </label>
              <label className="field-label">
                Novo horário
                <select onChange={(event) => setNewStartTime(event.target.value)} value={newStartTime}>
                  {timeSlots.map((timeSlot) => (
                    <option key={timeSlot} value={timeSlot}>
                      {timeSlot}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Profissional
                <select onChange={(event) => setNewProfessionalId(event.target.value)} value={newProfessionalId}>
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="muted-text">
              Novo horário: {newStartTime}
              {newEndTime ? ` - ${newEndTime}` : ""} · {selectedNewProfessional?.name ?? "Profissional não informado"}
            </p>

            <label className="field-label">
              Observações
              <textarea onChange={(event) => setRescheduleNotes(event.target.value)} value={rescheduleNotes} />
            </label>

            <label className="field-label">
              Senha
              <input
                onChange={(event) => setReschedulePassword(event.target.value)}
                required
                type="password"
                value={reschedulePassword}
              />
            </label>

            <button
              className="save-button"
              disabled={!reschedulePassword.trim() || isRescheduling}
              onClick={handleRescheduleAppointment}
              type="button"
            >
              {isRescheduling ? "Reagendando..." : "Confirmar reagendamento"}
            </button>
          </section>
        ) : null}

        {details && showCancelForm ? (
          <section className="cancel-form danger-zone">
            <label className="field-label">
              Motivo
              <textarea onChange={(event) => setReason(event.target.value)} required value={reason} />
            </label>
            <label className="field-label">
              Senha
              <input onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </label>
            <button
              className="danger-button"
              disabled={!reason.trim() || !password.trim() || isCancelling}
              onClick={handleCancelAppointment}
              type="button"
            >
              {isCancelling ? "Cancelando..." : "Confirmar cancelamento"}
            </button>
          </section>
        ) : null}
      </section>
    </div>
  );
}
