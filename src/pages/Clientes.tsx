import { useEffect, useMemo, useState } from "react";
import { isAdmin } from "../components/AppShell";
import { ClientFormModal } from "../components/clients/ClientFormModal";
import { ClientSearch } from "../components/clients/ClientSearch";
import { ClientSidePanel } from "../components/clients/ClientSidePanel";
import { ClientTable } from "../components/clients/ClientTable";
import { PageContainer } from "../components/layout/PageContainer";
import { supabase } from "../lib/supabase";
import type {
  ClientAppointmentRecord,
  ClientFilterKey,
  ClientFormValues,
  ClientOperationalSummary,
  ClientRecord,
} from "../types/client";
import type { AppUser } from "../types/user";

interface ClientesProps {
  user: AppUser;
}

type ClientModalMode = "create" | "details" | "edit" | "deactivate" | null;
type ClientModalReturnMode = "details" | null;

const futureStatusCodes = new Set(["scheduled", "confirmed", "in_progress"]);

const clientFilterOptions: { label: string; value: ClientFilterKey }[] = [
  { label: "Todos", value: "all" },
  { label: "Com agendamento futuro", value: "future" },
  { label: "Sem agendamento futuro", value: "no_future" },
  { label: "Inativos", value: "inactive" },
];

const secondaryClientFilterOptions: { label: string; value: ClientFilterKey }[] = [
  { label: "Com atendimento concluído", value: "completed" },
  { label: "Cadastrados recentemente", value: "recent" },
];

const emptyClientSummary: ClientOperationalSummary = {
  history: [],
  lastCompleted: null,
  nextAppointment: null,
  totalCompleted: 0,
  totalSpent: 0,
};

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getAppointmentDateTime(appointment: ClientAppointmentRecord) {
  return new Date(`${appointment.scheduled_date}T${appointment.start_time || "00:00"}`);
}

function sortAppointmentsDescending(left: ClientAppointmentRecord, right: ClientAppointmentRecord) {
  return getAppointmentDateTime(right).getTime() - getAppointmentDateTime(left).getTime();
}

function sortAppointmentsAscending(left: ClientAppointmentRecord, right: ClientAppointmentRecord) {
  return getAppointmentDateTime(left).getTime() - getAppointmentDateTime(right).getTime();
}

function buildClientSummaries(clients: ClientRecord[], appointments: ClientAppointmentRecord[]) {
  const now = new Date();
  const summaries: Record<string, ClientOperationalSummary> = {};

  clients.forEach((client) => {
    const clientAppointments = appointments
      .filter((appointment) => appointment.client_id === client.id)
      .sort(sortAppointmentsDescending);
    const completedAppointments = clientAppointments.filter((appointment) => appointment.status_code === "completed");
    const nextAppointment =
      clientAppointments
        .filter((appointment) => {
          if (!appointment.status_code || !futureStatusCodes.has(appointment.status_code)) {
            return false;
          }

          return getAppointmentDateTime(appointment).getTime() >= now.getTime();
        })
        .sort(sortAppointmentsAscending)[0] ?? null;

    summaries[client.id] = {
      history: clientAppointments,
      lastCompleted: completedAppointments[0] ?? null,
      nextAppointment,
      totalCompleted: completedAppointments.length,
      totalSpent: completedAppointments.reduce(
        (total, appointment) => total + Number(appointment.price_at_booking ?? 0),
        0,
      ),
    };
  });

  return summaries;
}

function isRecentlyCreated(client: ClientRecord) {
  if (!client.created_at) {
    return false;
  }

  const createdAt = new Date(client.created_at);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  return createdAt.getTime() >= cutoff.getTime();
}

function getFilterMatch(client: ClientRecord, summary: ClientOperationalSummary, filter: ClientFilterKey) {
  if (filter === "inactive") {
    return client.is_active === false;
  }

  if (client.is_active === false) {
    return false;
  }

  if (filter === "future") {
    return Boolean(summary.nextAppointment);
  }

  if (filter === "no_future") {
    return !summary.nextAppointment;
  }

  if (filter === "completed") {
    return summary.totalCompleted > 0;
  }

  if (filter === "recent") {
    return isRecentlyCreated(client);
  }

  return true;
}

function getSearchMatch(client: ClientRecord, searchTerm: string) {
  const normalizedSearch = normalizeSearch(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return [client.full_name, client.phone, client.notes ?? ""]
    .map(normalizeSearch)
    .some((value) => value.includes(normalizedSearch));
}

function ClientTableSkeleton() {
  return (
    <section className="clients-table-panel clients-loading-panel" aria-live="polite">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="clients-skeleton-row" key={index}>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </section>
  );
}

interface ClientDeactivateModalProps {
  client: ClientRecord;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ClientDeactivateModal({ client, isSaving, onCancel, onConfirm }: ClientDeactivateModalProps) {
  return (
    <div className="modal-backdrop client-action-modal-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="client-deactivate-title"
        aria-modal="true"
        className="appointment-modal client-form-modal client-deactivate-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="client-deactivate-title">Desativar cliente</h2>
            <p>Tem certeza que deseja desativar este cliente?</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onCancel} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body">
          <div className="client-deactivate-summary">
            <div>
              <span>Cliente</span>
              <strong>{client.full_name}</strong>
            </div>
            <div>
              <span>Telefone</span>
              <strong>{client.phone || "Não informado"}</strong>
            </div>
          </div>
        </div>

        <div className="appointment-modal__footer">
          <button className="cancel-button" disabled={isSaving} onClick={onCancel} type="button">
            Cancelar
          </button>
          <button className="danger-button" disabled={isSaving} onClick={onConfirm} type="button">
            {isSaving ? "Desativando..." : "Desativar cliente"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function Clientes({ user }: ClientesProps) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientAppointments, setClientAppointments] = useState<ClientAppointmentRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<ClientFilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [clientModalMode, setClientModalMode] = useState<ClientModalMode>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [clientModalReturnMode, setClientModalReturnMode] = useState<ClientModalReturnMode>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const userIsAdmin = isAdmin(user);

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone, birth_date, notes, is_active, created_at, updated_at")
        .order("full_name");

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error(error);
        setErrorMessage("Erro ao carregar clientes.");
        setClients([]);
        setClientAppointments([]);
        setIsLoading(false);
        return;
      }

      const loadedClients = (data ?? []) as ClientRecord[];
      setClients(loadedClients);

      if (loadedClients.length === 0) {
        setClientAppointments([]);
        setIsLoading(false);
        return;
      }

      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from("v_appointments_full")
        .select(
          "id, client_id, scheduled_date, start_time, end_time, procedure_name, professional_name, price_at_booking, status_code, status_name",
        )
        .in(
          "client_id",
          loadedClients.map((client) => client.id),
        )
        .order("scheduled_date", { ascending: false })
        .order("start_time", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (appointmentsError) {
        console.error("CLIENT APPOINTMENTS ERROR:", appointmentsError);
        setClientAppointments([]);
        setErrorMessage("Clientes carregados, mas não foi possível carregar o histórico de agendamentos.");
        setIsLoading(false);
        return;
      }

      setClientAppointments((appointmentsData ?? []) as ClientAppointmentRecord[]);
      setIsLoading(false);
    }

    loadClients();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const clientSummaries = useMemo(
    () => buildClientSummaries(clients, clientAppointments),
    [clientAppointments, clients],
  );

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const summary = clientSummaries[client.id] ?? emptyClientSummary;
      return getFilterMatch(client, summary, activeFilter) && getSearchMatch(client, searchTerm);
    });
  }, [activeFilter, clientSummaries, clients, searchTerm]);

  const selectedClientSummary = selectedClient ? clientSummaries[selectedClient.id] ?? emptyClientSummary : emptyClientSummary;
  const hasSearchOrFilter = Boolean(searchTerm.trim()) || activeFilter !== "all";
  const emptyTitle = clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado";
  const emptyDescription =
    clients.length === 0
      ? "Cadastre o primeiro cliente para começar a criar agendamentos."
      : "Tente ajustar a busca ou limpar os filtros.";

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3600);
  }

  function closeClientModal() {
    setClientModalMode(null);
    setSelectedClient(null);
    setClientModalReturnMode(null);
    setIsSaving(false);
  }

  function openClientDetails(client: ClientRecord) {
    setSelectedClient(client);
    setClientModalReturnMode(null);
    setIsSaving(false);
    setClientModalMode("details");
  }

  function handleEditClient(client: ClientRecord) {
    const shouldReturnToDetails = clientModalMode === "details" && selectedClient?.id === client.id;

    setSelectedClient(client);
    setClientModalReturnMode(shouldReturnToDetails ? "details" : null);
    setIsSaving(false);
    setClientModalMode("edit");
  }

  function handleDeactivateRequest(client: ClientRecord) {
    const shouldReturnToDetails = clientModalMode === "details" && selectedClient?.id === client.id;

    setSelectedClient(client);
    setClientModalReturnMode(shouldReturnToDetails ? "details" : null);
    setIsSaving(false);
    setClientModalMode("deactivate");
  }

  function openCreateClientModal() {
    setSelectedClient(null);
    setClientModalReturnMode(null);
    setIsSaving(false);
    setClientModalMode("create");
  }

  function cancelClientModalAction() {
    if (clientModalReturnMode === "details" && selectedClient) {
      setClientModalMode("details");
      setClientModalReturnMode(null);
      setIsSaving(false);
      return;
    }

    closeClientModal();
  }

  function handleNewAppointment(client: ClientRecord) {
    closeClientModal();
    window.sessionStorage.setItem(
      "agenda_prefill_client",
      JSON.stringify({
        allergies: null,
        birth_date: client.birth_date,
        full_name: client.full_name,
        id: client.id,
        notes: client.notes,
        phone: client.phone,
        preferences: null,
        restrictions: null,
      }),
    );
    window.location.hash = "#/agenda";
  }

  async function handleCreateClient(values: ClientFormValues) {
    if (!values.full_name.trim() || !values.phone.trim()) {
      setErrorMessage("Nome completo e número de telefone são obrigatórios.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase.from("clients").insert({
      full_name: values.full_name.trim(),
      phone: values.phone.trim(),
      birth_date: values.birth_date || null,
      notes: values.notes.trim() || null,
      is_active: true,
    });

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao cadastrar cliente.");
      setIsSaving(false);
      return;
    }

    closeClientModal();
    setReloadKey((current) => current + 1);
    showToast("Cliente cadastrado com sucesso.");
  }

  async function handleUpdateClient(values: ClientFormValues) {
    if (!selectedClient) {
      return;
    }

    if (!values.phone.trim()) {
      setErrorMessage("Número de telefone é obrigatório.");
      return;
    }

    if (userIsAdmin && !values.full_name.trim()) {
      setErrorMessage("Nome completo é obrigatório.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const updatePayload = userIsAdmin
      ? {
          full_name: values.full_name.trim(),
          phone: values.phone.trim(),
          birth_date: values.birth_date || null,
          notes: values.notes.trim() || null,
          is_active: values.is_active,
        }
      : {
          phone: values.phone.trim(),
          notes: values.notes.trim() || null,
        };

    const { error } = await supabase.from("clients").update(updatePayload).eq("id", selectedClient.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao atualizar cliente.");
      setIsSaving(false);
      return;
    }

    const updatedClient = {
      ...selectedClient,
      ...updatePayload,
      updated_at: new Date().toISOString(),
    } as ClientRecord;

    setClients((current) => current.map((client) => (client.id === selectedClient.id ? updatedClient : client)));
    setIsSaving(false);
    setClientModalReturnMode(null);
    setClientModalMode(clientModalReturnMode === "details" ? "details" : null);
    setSelectedClient(clientModalReturnMode === "details" ? updatedClient : null);
    setReloadKey((current) => current + 1);
    showToast("Cliente atualizado com sucesso.");
  }

  async function handleDeactivateClient() {
    if (!selectedClient || !userIsAdmin) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase.from("clients").update({ is_active: false }).eq("id", selectedClient.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao desativar cliente.");
      setIsSaving(false);
      return;
    }

    const deactivatedClient = {
      ...selectedClient,
      is_active: false,
      updated_at: new Date().toISOString(),
    } as ClientRecord;

    setClients((current) => current.map((client) => (client.id === selectedClient.id ? deactivatedClient : client)));
    setIsSaving(false);
    setClientModalReturnMode(null);
    setClientModalMode(clientModalReturnMode === "details" ? "details" : null);
    setSelectedClient(clientModalReturnMode === "details" ? deactivatedClient : null);
    setReloadKey((current) => current + 1);
    showToast("Cliente desativado com sucesso.");
  }

  return (
    <PageContainer className="clients-page clients-page--operational">
      <header className="clients-header">
        <div>
          <h1>Clientes</h1>
          <p>Gerencie clientes, histórico e próximos agendamentos</p>
        </div>
      </header>

      {toastMessage ? <p className="agenda-toast">{toastMessage}</p> : null}
      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}

      <section className="clients-toolbar clients-toolbar--operational">
        <div className="clients-toolbar-top">
          <ClientSearch searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
          <button className="add-button" onClick={openCreateClientModal} type="button">
            + Adicionar cliente
          </button>
        </div>
        <div className="clients-filter-chips" aria-label="Filtros de clientes">
          {clientFilterOptions.map((option) => (
            <button
              className={activeFilter === option.value ? "filter-chip filter-chip--active" : "filter-chip"}
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
          <details className="clients-more-filters">
            <summary
              className={
                secondaryClientFilterOptions.some((option) => option.value === activeFilter)
                  ? "filter-chip filter-chip--active"
                  : "filter-chip"
              }
            >
              Mais filtros
            </summary>
            <div className="clients-more-filters__content">
              {secondaryClientFilterOptions.map((option) => (
                <button
                  className={activeFilter === option.value ? "filter-chip filter-chip--active" : "filter-chip"}
                  key={option.value}
                  onClick={() => setActiveFilter(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </details>
        </div>
      </section>

      {isLoading ? (
        <ClientTableSkeleton />
      ) : (
        <ClientTable
          canDelete={userIsAdmin}
          clientSummaries={clientSummaries}
          clients={filteredClients}
          emptyDescription={hasSearchOrFilter ? emptyDescription : "Cadastre o primeiro cliente para começar."}
          emptyTitle={emptyTitle}
          onDeactivate={handleDeactivateRequest}
          onEdit={handleEditClient}
          onNewAppointment={handleNewAppointment}
          onView={openClientDetails}
        />
      )}

      {clientModalMode === "create" || clientModalMode === "edit" ? (
        <ClientFormModal
          client={selectedClient}
          isSaving={isSaving}
          mode={clientModalMode}
          onClose={clientModalMode === "edit" ? cancelClientModalAction : closeClientModal}
          onSubmit={clientModalMode === "create" ? handleCreateClient : handleUpdateClient}
          user={user}
        />
      ) : null}

      {selectedClient && clientModalMode === "details" ? (
        <ClientSidePanel
          canDelete={userIsAdmin}
          client={selectedClient}
          onClose={closeClientModal}
          onDeactivate={handleDeactivateRequest}
          onEdit={handleEditClient}
          onNewAppointment={handleNewAppointment}
          summary={selectedClientSummary}
        />
      ) : null}

      {selectedClient && clientModalMode === "deactivate" ? (
        <ClientDeactivateModal
          client={selectedClient}
          isSaving={isSaving}
          onCancel={cancelClientModalAction}
          onConfirm={handleDeactivateClient}
        />
      ) : null}
    </PageContainer>
  );
}
