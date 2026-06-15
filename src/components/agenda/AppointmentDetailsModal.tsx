import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  DEFAULT_WORKING_HOURS,
  addMinutesToTime,
  formatCurrency,
  formatDate,
  formatTime,
  generateTimeSlots,
  isTimeRangeWithinWorkingHours,
} from "../../lib/agenda";
import { getAppointmentStatusClass, getAppointmentStatusLabel } from "../../lib/appointmentStatus";
import { formatDateValue, getComboBalanceLabel, getComboLinkedLabel, getComboPriceLabel } from "../../lib/combos";
import { supabase } from "../../lib/supabase";
import type {
  Appointment,
  AppointmentDetails,
  AppointmentItem,
  Client,
  Procedure,
  Professional,
} from "../../types/agenda";
import type { ClientComboFull } from "../../types/combo";
import type { AppUser } from "../../types/user";
import { AppDatePicker } from "../ui/AppDatePicker";

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

interface AppointmentItemRow {
  id: string;
  appointment_id: string;
  procedure_id: string;
  professional_id: string | null;
  duration_minutes: number;
  price_at_booking: number | string;
  payment_method: string | null;
  payment_installments: number | null;
  payment_details: unknown | null;
  paid_amount: number | string | null;
  combo_usage_id: string | null;
  created_at: string;
  updated_at: string;
  procedures: Procedure | Procedure[] | null;
  professionals: Professional | Professional[] | null;
}

interface AppointmentDisplayItem {
  id: string;
  category_name: string;
  duration_minutes: number | null;
  isFallback: boolean;
  price_at_booking: number | string | null;
  procedure_id: string | null;
  procedure_name: string;
  professional_id: string | null;
  professional_name: string;
}

interface ItemPaymentForm {
  appointment_item_id: string;
  client_combo_id: string;
  installments: string;
  method: string;
  note: string;
}

interface MultiplePaymentItem {
  id: string;
  amount: string;
  installments: string;
  method: string;
  note: string;
}

const inactiveStatusCodes = ["cancelled", "no_show", "rescheduled", "completed"];
const confirmableStatusCodes = ["scheduled"];
const finalizableStatusCodes = ["confirmed"];
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
const itemPaymentMethodOptions = paymentMethodOptions.filter((option) => option.value !== "multiplas");
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

function getJoinedRecord<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeAppointmentItems(items: AppointmentItemRow[]) {
  return items.map((item) => ({
    id: item.id,
    appointment_id: item.appointment_id,
    procedure_id: item.procedure_id,
    professional_id: item.professional_id,
    duration_minutes: item.duration_minutes,
    price_at_booking: item.price_at_booking,
    payment_method: item.payment_method,
    payment_installments: item.payment_installments,
    payment_details: item.payment_details,
    paid_amount: item.paid_amount,
    combo_usage_id: item.combo_usage_id,
    created_at: item.created_at,
    updated_at: item.updated_at,
    procedure: getJoinedRecord(item.procedures),
    professional: getJoinedRecord(item.professionals),
  })) satisfies AppointmentItem[];
}

function getDisplayItemProcedureName(item: AppointmentDisplayItem) {
  return item.procedure_name || "Serviço não informado";
}

function getUniqueKnownValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value && value !== "Não informado" && !value.includes("não informado"))));
}

function comboMatchesService(combo: ClientComboFull, procedureId: string | null, categoryId: string | null) {
  if (combo.linked_type === "procedure") {
    return Boolean(procedureId) && combo.procedure_id === procedureId;
  }

  return Boolean(categoryId) && combo.category_id === categoryId;
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }

  return String(value);
}

function normalizePhoneForWhatsApp(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;

  return normalizedPhone.length >= 12 ? normalizedPhone : null;
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

async function fetchAppointmentItems(appointmentId: string) {
  const { data, error } = await supabase
    .from("appointment_items")
    .select(
      `
      id,
      appointment_id,
      procedure_id,
      professional_id,
      duration_minutes,
      price_at_booking,
      payment_method,
      payment_installments,
      payment_details,
      paid_amount,
      combo_usage_id,
      created_at,
      updated_at,
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
      ),
      professionals (
        id,
        name,
        work_description,
        work_type,
        phone,
        email,
        is_active
      )
    `,
    )
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[AppointmentDetails] appointment_items error:", error);
    return [];
  }

  return normalizeAppointmentItems((data ?? []) as AppointmentItemRow[]);
}

export function AppointmentDetailsModal({
  appointment,
  currentUser,
  onChanged,
  onClose,
}: AppointmentDetailsModalProps) {
  const [details, setDetails] = useState<AppointmentDetails | null>(null);
  const [appointmentItems, setAppointmentItems] = useState<AppointmentItem[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
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
  const [itemPaymentForms, setItemPaymentForms] = useState<ItemPaymentForm[]>([]);
  const [multiplePayments, setMultiplePayments] = useState<MultiplePaymentItem[]>([createEmptyPaymentItem()]);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newProfessionalId, setNewProfessionalId] = useState("");
  const [reschedulePassword, setReschedulePassword] = useState("");
  const [rescheduleNotes, setRescheduleNotes] = useState("");
  const timeSlots = useMemo(() => generateTimeSlots(), []);

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

      const [clientResult, procedureResult, professionalResult, professionalsResult, appointmentItemsResult] = await Promise.all([
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
        fetchAppointmentItems(appointment.id),
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
        appointment_items: appointmentItemsResult,
      };

      console.log("[AppointmentDetails] appointment:", appointment);
      console.log("[AppointmentDetails] appointmentItems:", appointmentItemsResult);

      setDetails(loadedDetails);
      setAppointmentItems(appointmentItemsResult);
      setItemPaymentForms(
        appointmentItemsResult.map((item) => ({
          appointment_item_id: item.id,
          client_combo_id: "",
          installments: item.payment_installments ? String(item.payment_installments) : "",
          method: item.payment_method ?? "",
          note: "",
        })),
      );
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
    const itemComboIsSelected = itemPaymentForms.some((item) => item.method === "combo");

    if (!currentDetails || (paymentMethod !== "combo" && !itemComboIsSelected)) {
      setCompatibleCombos([]);
      setSelectedClientComboId("");
      return;
    }

    let isMounted = true;
    const activeDetails = currentDetails;
    const comboClientId = activeDetails.client_id;

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

      const matchingCombos = (data ?? []) as ClientComboFull[];

      setCompatibleCombos(matchingCombos);
      setSelectedClientComboId((current) =>
        current &&
        matchingCombos.some((combo) =>
          comboMatchesService(combo, activeDetails.procedure_id, activeDetails.procedure?.category_id ?? null),
        )
          ? current
          : "",
      );
      setIsLoadingCombos(false);
    }

    loadCompatibleCombos();

    return () => {
      isMounted = false;
    };
  }, [details, itemPaymentForms, paymentMethod]);

  async function handleCancelAppointment() {
    const appointmentId = appointment.id?.trim();

    if (!appointmentId) {
      setErrorMessage("ID do agendamento não informado.");
      return;
    }

    if (!details) {
      setErrorMessage("Detalhes do agendamento não carregados.");
      return;
    }

    if (details.id !== appointmentId) {
      console.error("CANCEL APPOINTMENT ID MISMATCH:", {
        appointmentId,
        detailsId: details.id,
      });
      setErrorMessage("O agendamento selecionado não corresponde aos detalhes carregados.");
      return;
    }

    if (!reason.trim() || !password.trim()) {
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
    const updatedAt = new Date().toISOString();
    const newData = {
      ...oldData,
      status_code: "cancelled",
      cancellation_reason: reason.trim(),
      updated_at: updatedAt,
      updated_by: currentUser.id,
    };

    const { data: updatedAppointments, error: updateError } = await supabase
      .from("appointments")
      .update({
        status_code: "cancelled",
        cancellation_reason: reason.trim(),
        updated_at: updatedAt,
        updated_by: currentUser.id,
      })
      .eq("id", appointmentId)
      .select(
        "id, client_id, procedure_id, professional_id, scheduled_date, start_time, end_time, price_at_booking, duration_at_booking, status_code, notes, cancellation_reason",
      );

    if (updateError) {
      console.error("CANCEL APPOINTMENT ERROR:", updateError);
      setErrorMessage(`Erro ao cancelar agendamento: ${formatSupabaseError(updateError)}`);
      setIsCancelling(false);
      return;
    }

    if (!updatedAppointments || updatedAppointments.length === 0) {
      console.error("CANCEL APPOINTMENT AFFECTED NO ROWS:", { appointmentId });
      setErrorMessage("Agendamento não encontrado.");
      setIsCancelling(false);
      return;
    }

    if (updatedAppointments.length !== 1 || updatedAppointments[0]?.id !== appointmentId) {
      console.error("CANCEL APPOINTMENT INVALID ROW COUNT:", {
        affectedIds: updatedAppointments.map((item) => item.id),
        appointmentId,
      });
      setErrorMessage(`Cancelamento inválido: ${updatedAppointments.length} agendamentos afetados.`);
      setIsCancelling(false);
      return;
    }

    const updatedAppointment = updatedAppointments[0];

    const { error: historyError } = await supabase.from("appointment_history").insert({
      appointment_id: appointmentId,
      changed_by: currentUser.id,
      action: "cancelled",
      reason: reason.trim(),
      old_data: oldData,
      new_data: updatedAppointment ?? newData,
    });

    if (historyError) {
      console.error("APPOINTMENT HISTORY ERROR:", historyError);
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

  async function handleConfirmAppointment() {
    if (!details) {
      return;
    }

    if (!confirmableStatusCodes.includes(details.status_code ?? "")) {
      setErrorMessage("Apenas agendamentos em status Agendado podem ser confirmados.");
      return;
    }

    if (!["Administrador", "Atendente"].includes(currentUser.role)) {
      setErrorMessage("Você não tem permissão para confirmar agendamentos.");
      return;
    }

    setIsConfirming(true);
    setErrorMessage(null);

    const oldData = { ...details };
    const updatedAt = new Date().toISOString();
    const fallbackNewData = {
      ...oldData,
      status_code: "confirmed",
      updated_at: updatedAt,
      updated_by: currentUser.id,
    };

    const { data: updatedAppointment, error: updateError } = await supabase
      .from("appointments")
      .update({
        status_code: "confirmed",
        updated_at: updatedAt,
        updated_by: currentUser.id,
      })
      .eq("id", details.id)
      .select(
        "id, client_id, procedure_id, professional_id, scheduled_date, start_time, end_time, price_at_booking, duration_at_booking, payment_method, payment_installments, payment_details, paid_amount, status_code, notes, cancellation_reason",
      )
      .single();

    if (updateError) {
      console.error("CONFIRM APPOINTMENT ERROR:", updateError);
      setErrorMessage(`Erro ao confirmar agendamento: ${formatSupabaseError(updateError)}`);
      setIsConfirming(false);
      return;
    }

    const nextData = (updatedAppointment ?? fallbackNewData) as AppointmentRow;

    const { error: historyError } = await supabase.from("appointment_history").insert({
      appointment_id: details.id,
      changed_by: currentUser.id,
      action: "confirmed",
      reason: "Agendamento confirmado",
      old_data: oldData,
      new_data: updatedAppointment ?? fallbackNewData,
    });

    if (historyError) {
      console.error("CONFIRM HISTORY ERROR:", historyError);
    }

    setDetails((currentDetails) =>
      currentDetails
        ? {
            ...currentDetails,
            ...nextData,
          }
        : currentDetails,
    );
    setShowCancelForm(false);
    setShowFinishPaymentForm(false);
    setShowRescheduleForm(false);
    setIsConfirming(false);
    onChanged("Agendamento confirmado com sucesso.");
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

    if (details.status_code !== "confirmed") {
      setErrorMessage("Confirme o agendamento antes de finalizar o atendimento.");
      return;
    }

    if (!finishPassword.trim()) {
      setErrorMessage("Informe sua senha.");
      return;
    }

    if (hasAppointmentItems) {
      if (!canSubmitItemPayments) {
        setErrorMessage("Informe a forma de pagamento de todos os serviços.");
        return;
      }

      setIsFinishing(true);
      setErrorMessage(null);

      const passwordIsValid = await verifyCurrentPassword(finishPassword);

      if (!passwordIsValid) {
        setIsFinishing(false);
        return;
      }

      const oldData = { ...details };
      const itemsPayload = appointmentItems.map((item) => {
        const form = getItemPaymentForm(item.id);
        const paymentMethodValue = form?.method ?? "";
        const itemPrice = getPriceNumber(item.price_at_booking);
        const paidAmount = paymentMethodValue === "combo" || paymentMethodValue === "cortesia" ? 0 : itemPrice;
        const paymentDetails: Record<string, unknown> = {
          amount: itemPrice,
          type: paymentMethodValue,
        };

        if (form?.installments) {
          paymentDetails.installments = Number(form.installments);
        }

        if (form?.note.trim()) {
          paymentDetails.note = form.note.trim();
        }

        return {
          appointment_item_id: item.id,
          client_combo_id: paymentMethodValue === "combo" ? form?.client_combo_id : null,
          paid_amount: paidAmount,
          payment_details: paymentDetails,
          payment_installments: form?.installments ? Number(form.installments) : null,
          payment_method: paymentMethodValue,
        };
      });

      console.log("[AppointmentDetails] finishItemsPayload:", itemsPayload);

      const { data: finishResult, error: finishItemsError } = await supabase.rpc("finalize_appointment_with_items", {
        p_appointment_id: details.id,
        p_items: itemsPayload,
        p_used_by: currentUser.id,
      });

      if (finishItemsError) {
        console.error("FINISH APPOINTMENT ITEMS ERROR:", finishItemsError);
        setErrorMessage(
          finishItemsError.message.includes("finalize_appointment_with_items")
            ? "A função de finalizar com itens ainda não existe no Supabase. Aplique a migration de appointment_items."
            : formatSupabaseError(finishItemsError),
        );
        setIsFinishing(false);
        return;
      }

      const finishPayload = finishResult as { error?: string; success?: boolean } | null;

      if (finishPayload?.success === false) {
        console.error("FINISH APPOINTMENT ITEMS RPC ERROR:", finishPayload);
        setErrorMessage(finishPayload.error ?? "Erro ao finalizar atendimento por itens.");
        setIsFinishing(false);
        return;
      }

      const { error: historyError } = await supabase.from("appointment_history").insert({
        appointment_id: details.id,
        changed_by: currentUser.id,
        action: "completed",
        reason: "Atendimento finalizado por itens",
        old_data: oldData,
        new_data: finishResult ?? {
          ...oldData,
          status_code: "completed",
        },
      });

      if (historyError) {
        console.error("FINISH ITEMS HISTORY ERROR:", historyError);
      }

      setIsFinishing(false);
      setFinishPassword("");
      setShowFinishPaymentForm(false);
      onChanged("Atendimento finalizado com sucesso.");
      onClose();
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
      console.warn("FINISH HISTORY ERROR:", historyError);
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

    if (!isTimeRangeWithinWorkingHours(newStartTime, newEndTime)) {
      setErrorMessage(
        `O atendimento terminaria às ${formatTime(newEndTime)}, após o fechamento às ${DEFAULT_WORKING_HOURS.end}.`,
      );
      setIsRescheduling(false);
      return;
    }

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
        console.warn("RESCHEDULE HISTORY ERROR:", historyError);
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

  function updateItemPaymentForm(itemId: string, updates: Partial<ItemPaymentForm>) {
    setItemPaymentForms((items) =>
      items.map((item) =>
        item.appointment_item_id === itemId
          ? {
              ...item,
              ...updates,
              ...(updates.method ? { client_combo_id: "", installments: "" } : {}),
            }
          : item,
      ),
    );
  }

  function getItemPaymentForm(itemId: string) {
    return itemPaymentForms.find((item) => item.appointment_item_id === itemId);
  }

  function getCompatibleCombosForAppointmentItem(item: AppointmentItem) {
    return compatibleCombos.filter((combo) =>
      comboMatchesService(combo, item.procedure_id, item.procedure?.category_id ?? null),
    );
  }

  const displayItems = useMemo<AppointmentDisplayItem[]>(() => {
    if (appointmentItems.length > 0) {
      return appointmentItems.map((item) => ({
        id: item.id,
        category_name: getCategoryName(item.procedure ?? null),
        duration_minutes: item.duration_minutes,
        isFallback: false,
        price_at_booking: item.price_at_booking,
        procedure_id: item.procedure_id,
        procedure_name: item.procedure?.name ?? "Serviço não informado",
        professional_id: item.professional_id,
        professional_name: item.professional?.name ?? details?.professional?.name ?? appointment.professional_name ?? "Profissional não informado",
      }));
    }

    if (!details) {
      return [];
    }

    return [
      {
        id: details.id,
        category_name: getCategoryName(details.procedure) ?? appointment.category_name ?? "Categoria não informada",
        duration_minutes: details.duration_at_booking ?? details.procedure?.duration_minutes ?? null,
        isFallback: true,
        price_at_booking: details.price_at_booking ?? details.procedure?.price ?? appointment.price_at_booking,
        procedure_id: details.procedure_id,
        procedure_name: details.procedure?.name ?? appointment.procedure_name ?? "Serviço não informado",
        professional_id: details.professional_id,
        professional_name: details.professional?.name ?? appointment.professional_name ?? "Profissional não informado",
      },
    ];
  }, [appointment, appointmentItems, details]);

  const serviceSummaryLabel =
    displayItems.length > 1
      ? `${displayItems.length} serviços selecionados`
      : getDisplayItemProcedureName(displayItems[0] ?? {
          category_name: "Categoria não informada",
          duration_minutes: null,
          id: "empty",
          isFallback: true,
          price_at_booking: null,
          procedure_id: null,
          procedure_name: "Serviço não informado",
          professional_id: null,
          professional_name: "Profissional não informado",
        });
  const categorySummaryValues = getUniqueKnownValues(displayItems.map((item) => item.category_name));
  const professionalSummaryValues = getUniqueKnownValues(displayItems.map((item) => item.professional_name));
  const categorySummaryLabel =
    categorySummaryValues.length > 1 ? "Múltiplas categorias" : categorySummaryValues[0] ?? "Categoria não informada";
  const professionalSummaryLabel =
    professionalSummaryValues.length > 1 ? "Múltiplos profissionais" : professionalSummaryValues[0] ?? "Profissional não informado";
  const displayItemsTotal = displayItems.reduce((sum, item) => sum + getPriceNumber(item.price_at_booking), 0);
  const displayItemsDuration = displayItems.reduce((sum, item) => sum + Number(item.duration_minutes ?? 0), 0);
  const detailDate = details?.scheduled_date ? new Date(`${details.scheduled_date}T00:00:00`) : null;
  const selectedNewProfessional = professionals.find((professional) => professional.id === newProfessionalId);
  const rescheduleDuration =
    details?.duration_at_booking ?? (displayItemsDuration > 0 ? displayItemsDuration : details?.procedure?.duration_minutes ?? null);
  const newEndTime = newStartTime && rescheduleDuration ? addMinutesToTime(newStartTime, rescheduleDuration) : "";
  const canEditAppointment = Boolean(details && !inactiveStatusCodes.includes(details.status_code ?? ""));
  const canConfirmAppointmentStatus = Boolean(details && confirmableStatusCodes.includes(details.status_code ?? ""));
  const canConfirmAppointmentPermission = ["Administrador", "Atendente"].includes(currentUser.role);
  const canConfirmAppointment = canConfirmAppointmentStatus && canConfirmAppointmentPermission;
  const canFinishAppointment = Boolean(details && finalizableStatusCodes.includes(details.status_code ?? ""));
  const statusLabel = getAppointmentStatusLabel(details?.status_code, appointment.status_name);
  const statusClass = getAppointmentStatusClass(details?.status_code);
  const comboPaymentInfo = getComboPaymentInfo(details?.payment_details);
  const appointmentValue = displayItems.length > 0 ? displayItemsTotal : getPriceNumber(details?.price_at_booking ?? details?.procedure?.price ?? 0);
  const multiplePaymentTotal = multiplePayments.reduce((sum, item) => sum + parseCurrencyInput(item.amount), 0);
  const multiplePaymentDifference = Number((appointmentValue - multiplePaymentTotal).toFixed(2));
  const finishNeedsInstallments = paymentMethod === "cartao_credito";
  const hasInvalidMultipleCredit = multiplePayments.some(
    (item) => item.method === "cartao_credito" && !item.installments,
  );
  const hasAppointmentItems = appointmentItems.length > 0;
  const legacyCompatibleCombos = useMemo(
    () =>
      compatibleCombos.filter((combo) =>
        comboMatchesService(combo, details?.procedure_id ?? null, details?.procedure?.category_id ?? null),
      ),
    [compatibleCombos, details?.procedure?.category_id, details?.procedure_id],
  );
  const canSubmitItemPayments =
    hasAppointmentItems &&
    itemPaymentForms.length === appointmentItems.length &&
    itemPaymentForms.every(
      (item) =>
        Boolean(item.method) &&
        (item.method !== "combo" || Boolean(item.client_combo_id)) &&
        (item.method !== "cartao_credito" || Boolean(item.installments)),
    );
  const canSubmitFinish =
    Boolean(finishPassword.trim()) &&
    (hasAppointmentItems
      ? canSubmitItemPayments
      : Boolean(paymentMethod) &&
        (paymentMethod !== "combo" || Boolean(selectedClientComboId)) &&
        (!finishNeedsInstallments || Boolean(paymentInstallments)) &&
        (paymentMethod !== "multiplas" ||
          (multiplePayments.filter((item) => item.method && parseCurrencyInput(item.amount) > 0).length >= 2 &&
            !hasInvalidMultipleCredit &&
            Math.abs(multiplePaymentDifference) <= 0.009)));
  const whatsappPhoneSource = details?.client?.phone ?? appointment.client_phone ?? "";
  const hasWhatsappPhone = Boolean(whatsappPhoneSource.trim());
  const canContactOnWhatsApp = Boolean(details && details.status_code !== "cancelled");

  function handleOpenWhatsApp() {
    if (!hasWhatsappPhone) {
      setErrorMessage("Cliente sem telefone cadastrado.");
      return;
    }

    const whatsappPhone = normalizePhoneForWhatsApp(whatsappPhoneSource);

    if (!whatsappPhone) {
      setErrorMessage("Telefone do cliente inv\u00e1lido para WhatsApp.");
      return;
    }

    const clientName = details?.client?.full_name ?? appointment.client_name ?? "cliente";
    const procedureName =
      displayItems.length > 1
        ? displayItems.map((item) => getDisplayItemProcedureName(item)).join(", ")
        : details?.procedure?.name ?? appointment.procedure_name ?? "";
    const formattedDate = detailDate ? formatDate(detailDate) : "";
    const formattedTime = details?.start_time ? formatTime(details.start_time) : "";
    const hasFullAppointmentData = Boolean(procedureName && formattedDate && formattedTime);
    const message = hasFullAppointmentData
      ? `Ol\u00e1, ${clientName}! Tudo bem?\n\nEstamos passando para confirmar seu agendamento:\n\nServi\u00e7o: ${procedureName}\nData: ${formattedDate}\nHor\u00e1rio: ${formattedTime}\n\nPodemos confirmar sua presen\u00e7a?`
      : `Ol\u00e1, ${clientName}! Tudo bem? Estamos entrando em contato sobre seu agendamento.`;
    const url = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="appointment-details-title"
        className="appointment-modal appointment-modal--details"
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

        <div className="appointment-modal__body appointment-modal__body--details">
        {isLoading ? <p className="muted-text">Carregando detalhes...</p> : null}
        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

        {details ? (
          <div className="details-list details-list--appointment">
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
              <strong>{serviceSummaryLabel}</strong>
            </div>
            <div>
              <span>Categoria</span>
              <strong>{categorySummaryLabel}</strong>
            </div>
            <div>
              <span>Profissional</span>
              <strong>{professionalSummaryLabel}</strong>
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
              <strong>{formatCurrency(appointmentValue)}</strong>
            </div>
            <div>
              <span>Duração</span>
              <strong>{displayItemsDuration || details.duration_at_booking || "Não informado"} min</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={`appointment-status-badge appointment-status-badge--${statusClass}`}>{statusLabel}</strong>
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

        {details ? (
          <section className="appointment-services-section">
            <div className="appointment-services-section__header">
              <div>
                <h3>Serviços do agendamento</h3>
                <p>
                  Total: {formatCurrency(appointmentValue)} · Duração total:{" "}
                  {displayItemsDuration || details.duration_at_booking || "Não informada"} min
                </p>
              </div>
              <span>{displayItems.length} {displayItems.length === 1 ? "serviço" : "serviços"}</span>
            </div>

            <div className="appointment-services-list">
              {displayItems.map((item, index) => (
                <article className="appointment-service-card" key={item.id}>
                  <div className="appointment-service-card__title">
                    <strong>
                      {index + 1}. {getDisplayItemProcedureName(item)}
                    </strong>
                    <span>{formatCurrency(item.price_at_booking)}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Categoria</dt>
                      <dd>{item.category_name}</dd>
                    </div>
                    <div>
                      <dt>Profissional</dt>
                      <dd>{item.professional_name}</dd>
                    </div>
                    <div>
                      <dt>Duração</dt>
                      <dd>{item.duration_minutes ?? "Não informada"} min</dd>
                    </div>
                    <div>
                      <dt>Valor</dt>
                      <dd>{formatCurrency(item.price_at_booking)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {details && canContactOnWhatsApp ? (
          <div className="appointment-whatsapp-action">
            <button
              className="secondary-button whatsapp-button"
              disabled={!hasWhatsappPhone}
              onClick={handleOpenWhatsApp}
              type="button"
            >
              <MessageCircle aria-hidden="true" />
              {hasWhatsappPhone ? "Chamar no WhatsApp" : "Cliente sem telefone cadastrado"}
            </button>
          </div>
        ) : null}

        {details && canEditAppointment ? (
          <div className="appointment-actions">
            {canConfirmAppointment ? (
              <button
                className="save-button"
                disabled={isConfirming || isFinishing}
                onClick={handleConfirmAppointment}
                type="button"
              >
                {isConfirming ? "Confirmando..." : "Confirmar agendamento"}
              </button>
            ) : null}
            {canFinishAppointment ? (
              <button
                className="save-button"
                disabled={isConfirming || isFinishing}
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
              disabled={isConfirming || isFinishing}
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
              disabled={isConfirming || isFinishing}
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

            {hasAppointmentItems ? (
              <div className="appointment-item-payments">
                <div className="appointment-item-payments__header">
                  <strong>Pagamento por serviço</strong>
                  <span>Total do atendimento: {formatCurrency(appointmentValue)}</span>
                </div>

                {appointmentItems.map((item, index) => {
                  const paymentForm = getItemPaymentForm(item.id);
                  const compatibleItemCombos = getCompatibleCombosForAppointmentItem(item);

                  return (
                    <article className="appointment-item-payment-card" key={item.id}>
                      <div className="appointment-item-payment-card__summary">
                        <div>
                          <strong>
                            {index + 1}. {item.procedure?.name ?? "Serviço não informado"}
                          </strong>
                          <span>
                            {getCategoryName(item.procedure ?? null)} · {item.professional?.name ?? "Profissional não informado"}
                          </span>
                        </div>
                        <span>{formatCurrency(item.price_at_booking)}</span>
                      </div>

                      <div className="appointment-item-payment-card__fields">
                        <label className="field-label">
                          Forma
                          <select
                            onChange={(event) => updateItemPaymentForm(item.id, { method: event.target.value })}
                            value={paymentForm?.method ?? ""}
                          >
                            <option value="">Selecione</option>
                            {itemPaymentMethodOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {paymentForm?.method === "cartao_credito" ? (
                          <label className="field-label">
                            Parcelas
                            <select
                              onChange={(event) => updateItemPaymentForm(item.id, { installments: event.target.value })}
                              value={paymentForm.installments}
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

                        {paymentForm?.method === "combo" ? (
                          <label className="field-label appointment-item-payment-card__combo">
                            Combo
                            <select
                              disabled={isLoadingCombos || compatibleItemCombos.length === 0}
                              onChange={(event) => updateItemPaymentForm(item.id, { client_combo_id: event.target.value })}
                              value={paymentForm.client_combo_id}
                            >
                              <option value="">
                                {isLoadingCombos
                                  ? "Carregando combos..."
                                  : compatibleItemCombos.length === 0
                                    ? "Nenhum combo compatível"
                                    : "Selecione"}
                              </option>
                              {compatibleItemCombos.map((combo) => (
                                <option key={combo.id} value={combo.id}>
                                  {combo.name} · {getComboBalanceLabel(combo)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        <label className="field-label appointment-item-payment-card__note">
                          Observação
                          <input
                            onChange={(event) => updateItemPaymentForm(item.id, { note: event.target.value })}
                            value={paymentForm?.note ?? ""}
                          />
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <>
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
                ) : legacyCompatibleCombos.length === 0 ? (
                  <span>Este cliente não possui combo válido para este serviço ou categoria.</span>
                ) : (
                  <div className="combo-payment-options">
                    {legacyCompatibleCombos.map((combo) => (
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
              </>
            )}

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
                <strong>{professionalSummaryLabel}</strong>
              </div>
              <div>
                <span>Procedimento atual</span>
                <strong>{serviceSummaryLabel}</strong>
              </div>
            </div>

            <div className="modal-form-grid">
              <AppDatePicker className="field-label" label="Nova data" onChange={setNewDate} value={newDate} />
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
            <div>
              <h3>Tem certeza que deseja cancelar este agendamento?</h3>
              <p>Somente este agendamento será alterado para Cancelado.</p>
            </div>

            <div className="cancel-appointment-summary">
              <div>
                <span>Cliente</span>
                <strong>{displayValue(details.client?.full_name ?? appointment.client_name)}</strong>
              </div>
              <div>
                <span>Serviço</span>
                <strong>{serviceSummaryLabel}</strong>
              </div>
              <div>
                <span>Data</span>
                <strong>{detailDate ? formatDate(detailDate) : displayValue(details.scheduled_date)}</strong>
              </div>
              <div>
                <span>Horário</span>
                <strong>
                  {formatTime(details.start_time)} - {formatTime(details.end_time)}
                </strong>
              </div>
              <div>
                <span>Profissional</span>
                <strong>{professionalSummaryLabel}</strong>
              </div>
            </div>

            <label className="field-label">
              Motivo
              <textarea onChange={(event) => setReason(event.target.value)} required value={reason} />
            </label>
            <label className="field-label">
              Senha
              <input onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </label>
            <div className="cancel-form__actions">
              <button
                className="cancel-button"
                disabled={isCancelling}
                onClick={() => {
                  setReason("");
                  setPassword("");
                  setShowCancelForm(false);
                  setErrorMessage(null);
                }}
                type="button"
              >
                Voltar
              </button>
              <button
                className="danger-button"
                disabled={!reason.trim() || !password.trim() || isCancelling}
                onClick={handleCancelAppointment}
                type="button"
              >
                {isCancelling ? "Cancelando..." : "Cancelar agendamento"}
              </button>
            </div>
          </section>
        ) : null}
        </div>
      </section>
    </div>
  );
}
