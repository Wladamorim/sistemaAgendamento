export interface MovementAppointment {
  id: string;
  client_id: string | null;
  procedure_id: string | null;
  professional_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  client_name: string | null;
  procedure_name: string | null;
  professional_name: string | null;
  category_name: string | null;
  price_at_booking: number | string | null;
  status_code: string | null;
  status_name: string | null;
  payment_method: string | null;
  payment_installments: number | null;
  payment_details: unknown | null;
  paid_amount: number | string | null;
}

export interface MovementGroupItem {
  name: string;
  count: number;
  total: number;
  averageTicket: number;
}

export interface PaymentBreakdownItem {
  key: string;
  label: string;
  total: number;
  percent: number;
}

interface PaymentDetailItem {
  method?: string;
  amount?: number | string;
}

const paymentLabels: Record<string, string> = {
  cartao_credito: "Cartao de credito",
  cartao_debito: "Cartao de debito",
  cortesia: "Cortesia",
  dinheiro: "Dinheiro",
  multiplas: "Multiplas formas",
  nao_informado: "Nao informado",
  outro: "Outro",
  pix: "Pix",
  transferencia: "Transferencia",
};

export function getPaymentLabel(method: string | null | undefined) {
  if (!method) {
    return paymentLabels.nao_informado;
  }

  return paymentLabels[method] ?? method;
}

export function getAppointmentAmount(appointment: MovementAppointment) {
  const paidAmount = appointment.paid_amount === null ? null : Number(appointment.paid_amount);

  if (paidAmount !== null && !Number.isNaN(paidAmount)) {
    return paidAmount;
  }

  const bookingPrice = appointment.price_at_booking === null ? null : Number(appointment.price_at_booking);

  if (bookingPrice !== null && !Number.isNaN(bookingPrice)) {
    return bookingPrice;
  }

  return 0;
}

export function getCompletedAppointments(appointments: MovementAppointment[]) {
  return appointments.filter((appointment) => appointment.status_code === "completed");
}

export function groupByCategory(appointments: MovementAppointment[]) {
  return groupAppointments(appointments, (appointment) => appointment.category_name ?? "Sem categoria");
}

export function groupByProfessional(appointments: MovementAppointment[]) {
  return groupAppointments(appointments, (appointment) => appointment.professional_name ?? "Sem profissional");
}

export function getTopItem(groupedData: MovementGroupItem[]) {
  if (groupedData.length === 0) {
    return null;
  }

  return [...groupedData].sort((a, b) => b.total - a.total || b.count - a.count)[0];
}

export function buildPaymentBreakdown(appointments: MovementAppointment[]) {
  const totals = new Map<string, number>();
  const totalRevenue = appointments.reduce((sum, appointment) => sum + getAppointmentAmount(appointment), 0);

  appointments.forEach((appointment) => {
    const amount = getAppointmentAmount(appointment);

    if (appointment.payment_method === "multiplas") {
      const items = getMultiplePaymentItems(appointment.payment_details);

      if (items.length === 0) {
        addPaymentTotal(totals, "nao_informado", amount);
        return;
      }

      items.forEach((item) => {
        const itemAmount = Number(item.amount ?? 0);
        addPaymentTotal(totals, item.method || "nao_informado", Number.isNaN(itemAmount) ? 0 : itemAmount);
      });
      return;
    }

    addPaymentTotal(totals, appointment.payment_method || "nao_informado", amount);
  });

  return [...totals.entries()]
    .map(([key, total]) => ({
      key,
      label: getPaymentLabel(key),
      percent: totalRevenue > 0 ? (total / totalRevenue) * 100 : 0,
      total,
    }))
    .sort((first, second) => second.total - first.total || first.label.localeCompare(second.label, "pt-BR"));
}

function groupAppointments(appointments: MovementAppointment[], getName: (appointment: MovementAppointment) => string) {
  const groups = new Map<string, MovementGroupItem>();

  appointments.forEach((appointment) => {
    const name = getName(appointment);
    const current = groups.get(name) ?? { averageTicket: 0, count: 0, name, total: 0 };

    current.count += 1;
    current.total += getAppointmentAmount(appointment);
    current.averageTicket = current.count > 0 ? current.total / current.count : 0;
    groups.set(name, current);
  });

  return [...groups.values()].sort(
    (first, second) => second.total - first.total || second.count - first.count || first.name.localeCompare(second.name),
  );
}

function addPaymentTotal(totals: Map<string, number>, method: string, amount: number) {
  const key = method || "nao_informado";
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

function getMultiplePaymentItems(paymentDetails: unknown): PaymentDetailItem[] {
  if (!paymentDetails || typeof paymentDetails !== "object") {
    return [];
  }

  const details = paymentDetails as { items?: unknown };

  if (!Array.isArray(details.items)) {
    return [];
  }

  return details.items.filter((item): item is PaymentDetailItem => Boolean(item && typeof item === "object"));
}
