import { useEffect, useState } from "react";
import { formatCurrency, formatTime } from "../../lib/agenda";
import {
  formatDateValue as formatComboDateValue,
  getComboBalanceLabel,
  getComboLinkedLabel,
  getComboStatusLabel,
} from "../../lib/combos";
import { supabase } from "../../lib/supabase";
import type { ClientAppointmentRecord, ClientOperationalSummary, ClientRecord } from "../../types/client";
import type { ClientComboFull, ComboUsageFull } from "../../types/combo";

interface ClientSidePanelProps {
  canDelete: boolean;
  client: ClientRecord;
  summary: ClientOperationalSummary;
  onClose: () => void;
  onDeactivate: (client: ClientRecord) => void;
  onEdit: (client: ClientRecord) => void;
  onNewAppointment: (client: ClientRecord) => void;
}

function formatDateValue(value: string | null) {
  if (!value) {
    return "Não informado";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function formatDateTimeValue(value: string | null) {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(appointment: ClientAppointmentRecord) {
  return appointment.status_name ?? appointment.status_code ?? "Sem status";
}

function getAverageTicket(summary: ClientOperationalSummary) {
  if (summary.totalCompleted === 0) {
    return 0;
  }

  return summary.totalSpent / summary.totalCompleted;
}

function AppointmentHistoryItem({ appointment }: { appointment: ClientAppointmentRecord }) {
  return (
    <li className="client-history-item">
      <div>
        <strong>{appointment.procedure_name ?? "Serviço não informado"}</strong>
        <span>{appointment.professional_name ?? "Profissional não informado"}</span>
      </div>
      <div>
        <span>
          {formatDateValue(appointment.scheduled_date)} · {formatTime(appointment.start_time)} -{" "}
          {formatTime(appointment.end_time)}
        </span>
        <span>
          {formatCurrency(appointment.price_at_booking)} · {getStatusLabel(appointment)}
        </span>
      </div>
    </li>
  );
}

export function ClientSidePanel({
  canDelete,
  client,
  summary,
  onClose,
  onDeactivate,
  onEdit,
  onNewAppointment,
}: ClientSidePanelProps) {
  const isInactive = client.is_active === false;
  const [clientCombos, setClientCombos] = useState<ClientComboFull[]>([]);
  const [comboUsages, setComboUsages] = useState<ComboUsageFull[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadClientCombos() {
      const [combosResult, usagesResult] = await Promise.all([
        supabase
          .from("v_client_combos_full")
          .select("*")
          .eq("client_id", client.id)
          .order("expiration_date", { ascending: true }),
        supabase
          .from("v_combo_usages_full")
          .select("*")
          .eq("client_id", client.id)
          .order("used_at", { ascending: false })
          .limit(6),
      ]);

      if (!isMounted) {
        return;
      }

      if (combosResult.error) {
        console.error("CLIENT COMBOS ERROR:", combosResult.error);
        setClientCombos([]);
      } else {
        setClientCombos((combosResult.data ?? []) as ClientComboFull[]);
      }

      if (usagesResult.error) {
        console.error("CLIENT COMBO USAGES ERROR:", usagesResult.error);
        setComboUsages([]);
      } else {
        setComboUsages((usagesResult.data ?? []) as ComboUsageFull[]);
      }
    }

    loadClientCombos();

    return () => {
      isMounted = false;
    };
  }, [client.id]);

  return (
    <div
      className="client-drawer-backdrop client-profile-modal-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        aria-label="Ficha do cliente"
        aria-modal="true"
        className="client-side-panel client-profile-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-side-panel__header">
          <div>
            <span className={isInactive ? "status-pill client-status-pill" : "status-pill status-pill--active client-status-pill"}>
              {isInactive ? "Inativo" : "Ativo"}
            </span>
            <h2>{client.full_name}</h2>
            <p>{client.phone || "Sem telefone"}</p>
          </div>
          <button aria-label="Fechar ficha" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="client-side-panel__actions">
          <button className="primary-button" onClick={() => onNewAppointment(client)} type="button">
            Novo agendamento
          </button>
          <button className="secondary-button" onClick={() => onEdit(client)} type="button">
            Editar
          </button>
          {canDelete ? (
            <button className="danger-button" onClick={() => onDeactivate(client)} type="button">
              Desativar
            </button>
          ) : null}
        </div>

        <section className="client-drawer-section">
          <h3>Dados do cliente</h3>
          <dl className="client-detail-grid">
            <div>
              <dt>Nome completo</dt>
              <dd>{client.full_name}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{client.phone || "Não informado"}</dd>
            </div>
            <div>
              <dt>Data de nascimento</dt>
              <dd>{formatDateValue(client.birth_date)}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDateTimeValue(client.created_at)}</dd>
            </div>
          </dl>
          <div className="client-notes-box">
            <span>Observações adicionais</span>
            <p>{client.notes || "Sem observações cadastradas."}</p>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Resumo</h3>
          <div className="client-summary-grid">
            <div>
              <span>Total de atendimentos</span>
              <strong>{summary.totalCompleted}</strong>
            </div>
            <div>
              <span>Total gasto</span>
              <strong>{formatCurrency(summary.totalSpent)}</strong>
            </div>
            <div>
              <span>Ticket medio</span>
              <strong>{formatCurrency(getAverageTicket(summary))}</strong>
            </div>
            <div>
              <span>Último atendimento</span>
              <strong>
                {summary.lastCompleted
                  ? `${formatDateValue(summary.lastCompleted.scheduled_date)} · ${
                      summary.lastCompleted.procedure_name ?? "Serviço não informado"
                    }`
                  : "Sem atendimentos"}
              </strong>
            </div>
            <div>
              <span>Próximo agendamento</span>
              <strong>
                {summary.nextAppointment
                  ? `${formatDateValue(summary.nextAppointment.scheduled_date)} as ${formatTime(
                      summary.nextAppointment.start_time,
                    )}`
                  : "Sem agendamento futuro"}
              </strong>
            </div>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Combos do cliente</h3>
          {clientCombos.length === 0 ? (
            <div className="client-panel-empty">Nenhum combo vinculado a este cliente.</div>
          ) : (
            <ul className="client-history-list">
              {clientCombos.slice(0, 6).map((combo) => (
                <li className="client-history-item" key={combo.id}>
                  <div>
                    <strong>{combo.name}</strong>
                    <span>{getComboLinkedLabel(combo)}</span>
                  </div>
                  <div>
                    <span>{getComboBalanceLabel(combo)}</span>
                    <span>
                      Validade: {formatComboDateValue(combo.expiration_date)} Â·{" "}
                      {getComboStatusLabel(combo.effective_status)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="client-drawer-section">
          <h3>Uso de combos</h3>
          {comboUsages.length === 0 ? (
            <div className="client-panel-empty">Nenhum uso de combo registrado para este cliente.</div>
          ) : (
            <ul className="client-history-list">
              {comboUsages.map((usage) => (
                <li className="client-history-item" key={usage.id}>
                  <div>
                    <strong>{usage.combo_name ?? "Combo"}</strong>
                    <span>{usage.procedure_name ?? "Serviço não informado"}</span>
                  </div>
                  <div>
                    <span>
                      {usage.used_at
                        ? new Intl.DateTimeFormat("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }).format(new Date(usage.used_at))
                        : "Data não informada"}
                    </span>
                    <span>{formatCurrency(usage.production_value)} de produção</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="client-drawer-section">
          <h3>Histórico de agendamentos</h3>
          {summary.history.length === 0 ? (
            <div className="client-panel-empty">Nenhum atendimento registrado para este cliente.</div>
          ) : (
            <ul className="client-history-list">
              {summary.history.slice(0, 8).map((appointment) => (
                <AppointmentHistoryItem appointment={appointment} key={appointment.id} />
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
