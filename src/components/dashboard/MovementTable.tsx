import { formatCurrency, formatTime } from "../../lib/agenda";
import { getAppointmentCashAmount, getAppointmentProductionAmount, getPaymentLabel, type MovementAppointment } from "../../lib/movement";

interface MovementTableProps {
  appointments: MovementAppointment[];
  title?: string;
}

function formatDateValue(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

export function MovementTable({ appointments, title = "Atendimentos do periodo" }: MovementTableProps) {
  return (
    <section className="dashboard-panel movement-table-panel">
      <h2>{title}</h2>
      {appointments.length === 0 ? (
        <div className="movement-empty-state">
          <strong>Nenhuma movimentacao encontrada</strong>
          <span>Nao ha atendimentos registrados para este periodo.</span>
        </div>
      ) : (
        <div className="movement-table-wrap">
          <table className="movement-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Cliente</th>
                <th>Servico</th>
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
                  <td data-label="Cliente">{appointment.client_name ?? "Nao informado"}</td>
                  <td data-label="Servico">{appointment.procedure_name ?? "Nao informado"}</td>
                  <td data-label="Profissional">{appointment.professional_name ?? "Nao informado"}</td>
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
