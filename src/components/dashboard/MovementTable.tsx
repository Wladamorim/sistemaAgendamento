import type { ReactNode } from "react";
import { formatCurrency, formatTime } from "../../lib/agenda";
import { getAppointmentCashAmount, getAppointmentProductionAmount, getPaymentLabel, type MovementAppointment } from "../../lib/movement";

interface MovementTableProps {
  appointments: MovementAppointment[];
  description?: string;
  filters?: ReactNode;
  title?: string;
}

function formatDateValue(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

export function MovementTable({ appointments, description, filters, title = "Atendimentos do período" }: MovementTableProps) {
  return (
    <section className="dashboard-panel movement-table-panel">
      <div className="dashboard-panel__header movement-table-panel__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <span>{appointments.length} atendimento(s)</span>
      </div>

      {filters ? <div className="movement-table-panel__filters">{filters}</div> : null}

      {appointments.length === 0 ? (
        <div className="movement-empty-state">
          <strong>Nenhuma movimentação encontrada</strong>
          <span>Não há atendimentos registrados para este período.</span>
        </div>
      ) : (
        <div className="movement-table-wrap">
          <table className="movement-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td data-label="Data/Hora">
                    <strong>{formatDateValue(appointment.scheduled_date)}</strong>
                    <span className="movement-table-muted">
                      {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                    </span>
                  </td>
                  <td data-label="Cliente">{appointment.client_name ?? "Não informado"}</td>
                  <td data-label="Serviço">{appointment.procedure_name ?? "Não informado"}</td>
                  <td data-label="Profissional">{appointment.professional_name ?? "Não informado"}</td>
                  <td data-label="Pagamento">{getPaymentLabel(appointment.payment_method)}</td>
                  <td data-label="Valor">
                    <strong>{formatCurrency(getAppointmentProductionAmount(appointment))}</strong>
                    {appointment.payment_method === "combo" ? (
                      <span className="movement-table-muted">Caixa {formatCurrency(getAppointmentCashAmount(appointment))}</span>
                    ) : null}
                  </td>
                  <td data-label="Status">
                    <span className={appointment.status_code === "completed" ? "status-pill status-pill--active" : "status-pill"}>
                      {appointment.status_name ?? appointment.status_code ?? "Sem status"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
