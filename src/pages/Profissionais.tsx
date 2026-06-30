import { useEffect, useMemo, useState } from "react";
import { isAdmin } from "../components/AppShell";
import { ScheduleBlockModal } from "../components/agenda/ScheduleBlockModal";
import { ProfessionalFormModal } from "../components/professionals/ProfessionalFormModal";
import { ProfessionalSearch } from "../components/professionals/ProfessionalSearch";
import { ProfessionalServicesModal } from "../components/professionals/ProfessionalServicesModal";
import { ProfessionalSidePanel } from "../components/professionals/ProfessionalSidePanel";
import { ProfessionalTable } from "../components/professionals/ProfessionalTable";
import { PageContainer } from "../components/layout/PageContainer";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { formatDateForQuery } from "../lib/agenda";
import { supabase } from "../lib/supabase";
import type {
  ProfessionalAppointmentRecord,
  ProfessionalFilterKey,
  ProfessionalFormValues,
  ProfessionalOperationalSummary,
  ProfessionalRecord,
  ProfessionalScheduleBlock,
  ProfessionalServiceRecord,
} from "../types/professional";
import type { AppUser } from "../types/user";

interface ProfissionaisProps {
  user: AppUser;
}

interface ProcedureProfessionalRow {
  procedure_id: string;
  professional_id: string;
  procedures: ProfessionalServiceRecord | ProfessionalServiceRecord[] | null;
}

const excludedAppointmentStatuses = new Set(["cancelled", "no_show", "rescheduled"]);
const futureAppointmentStatuses = new Set(["scheduled", "confirmed", "in_progress"]);

const professionalFilterOptions: { label: string; value: ProfessionalFilterKey }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
  { label: "Com serviços", value: "with_services" },
  { label: "Sem serviços", value: "without_services" },
  { label: "Com agenda hoje", value: "today_schedule" },
  { label: "Bloqueados hoje", value: "blocked_today" },
];

const emptyProfessionalSummary: ProfessionalOperationalSummary = {
  appointmentsToday: 0,
  averageTicket: 0,
  blocksToday: [],
  completedThisMonth: 0,
  futureBlocks: [],
  history: [],
  monthlyRevenue: 0,
  nextAppointments: [],
  operationalStatus: "Disponível hoje",
};

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getJoinedProcedure(row: ProcedureProfessionalRow) {
  return Array.isArray(row.procedures) ? row.procedures[0] : row.procedures;
}

function getAppointmentDateTime(appointment: ProfessionalAppointmentRecord) {
  return new Date(`${appointment.scheduled_date}T${appointment.start_time || "00:00"}`);
}

function sortAppointmentsDescending(left: ProfessionalAppointmentRecord, right: ProfessionalAppointmentRecord) {
  return getAppointmentDateTime(right).getTime() - getAppointmentDateTime(left).getTime();
}

function sortAppointmentsAscending(left: ProfessionalAppointmentRecord, right: ProfessionalAppointmentRecord) {
  return getAppointmentDateTime(left).getTime() - getAppointmentDateTime(right).getTime();
}

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return {
    end: formatDateForQuery(end),
    start: formatDateForQuery(start),
  };
}

function buildLinkedServicesByProfessional(rows: ProcedureProfessionalRow[]) {
  const result: Record<string, ProfessionalServiceRecord[]> = {};

  rows.forEach((row) => {
    const procedure = getJoinedProcedure(row);

    if (!procedure?.id) {
      return;
    }

    const currentServices = result[row.professional_id] ?? [];

    if (!currentServices.some((service) => service.id === procedure.id)) {
      result[row.professional_id] = [...currentServices, procedure];
    }
  });

  return result;
}

function getProfessionalBlocks(blocks: ProfessionalScheduleBlock[], professionalId: string) {
  return blocks.filter((block) => !block.professional_id || block.professional_id === professionalId);
}

function buildProfessionalSummaries(
  professionals: ProfessionalRecord[],
  appointments: ProfessionalAppointmentRecord[],
  blocks: ProfessionalScheduleBlock[],
  linkedServicesByProfessional: Record<string, ProfessionalServiceRecord[]>,
) {
  const now = new Date();
  const today = formatDateForQuery(now);
  const monthRange = getMonthRange(now);
  const summaries: Record<string, ProfessionalOperationalSummary> = {};

  professionals.forEach((professional) => {
    const linkedServices = linkedServicesByProfessional[professional.id] ?? [];
    const professionalAppointments = appointments
      .filter((appointment) => appointment.professional_id === professional.id)
      .sort(sortAppointmentsDescending);
    const activeToday = professionalAppointments.filter(
      (appointment) =>
        appointment.scheduled_date === today && !excludedAppointmentStatuses.has(appointment.status_code ?? ""),
    );
    const nextAppointments = professionalAppointments
      .filter((appointment) => {
        if (!appointment.status_code || !futureAppointmentStatuses.has(appointment.status_code)) {
          return false;
        }

        return getAppointmentDateTime(appointment).getTime() >= now.getTime();
      })
      .sort(sortAppointmentsAscending);
    const completedThisMonth = professionalAppointments.filter(
      (appointment) =>
        appointment.status_code === "completed" &&
        appointment.scheduled_date >= monthRange.start &&
        appointment.scheduled_date <= monthRange.end,
    );
    const professionalBlocks = getProfessionalBlocks(blocks, professional.id);
    const blocksToday = professionalBlocks.filter((block) => block.block_date === today);
    const monthlyRevenue = completedThisMonth.reduce(
      (total, appointment) => total + Number(appointment.price_at_booking ?? 0),
      0,
    );
    const operationalStatus =
      professional.is_active === false
        ? "Inativo"
        : linkedServices.length === 0
          ? "Sem serviços vinculados"
          : blocksToday.length > 0
            ? "Bloqueado hoje"
            : activeToday.length > 0
              ? "Com atendimentos hoje"
              : "Disponível hoje";

    summaries[professional.id] = {
      appointmentsToday: activeToday.length,
      averageTicket: completedThisMonth.length > 0 ? monthlyRevenue / completedThisMonth.length : 0,
      blocksToday,
      completedThisMonth: completedThisMonth.length,
      futureBlocks: professionalBlocks,
      history: professionalAppointments,
      monthlyRevenue,
      nextAppointments,
      operationalStatus,
    };
  });

  return summaries;
}

function getSearchMatch(
  professional: ProfessionalRecord,
  linkedServices: ProfessionalServiceRecord[],
  searchTerm: string,
) {
  const normalizedSearch = normalizeSearch(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return [
    professional.name,
    professional.phone ?? "",
    professional.email ?? "",
    professional.work_type ?? "",
    professional.work_description ?? "",
    ...linkedServices.map((service) => service.name),
  ]
    .map(normalizeSearch)
    .some((value) => value.includes(normalizedSearch));
}

function getFilterMatch(
  professional: ProfessionalRecord,
  linkedServices: ProfessionalServiceRecord[],
  summary: ProfessionalOperationalSummary,
  filter: ProfessionalFilterKey,
) {
  if (filter === "inactive") {
    return professional.is_active === false;
  }

  if (filter === "active") {
    return professional.is_active !== false;
  }

  if (professional.is_active === false) {
    return false;
  }

  if (filter === "with_services") {
    return linkedServices.length > 0;
  }

  if (filter === "without_services") {
    return linkedServices.length === 0;
  }

  if (filter === "today_schedule") {
    return summary.appointmentsToday > 0;
  }

  if (filter === "blocked_today") {
    return summary.blocksToday.length > 0;
  }

  return true;
}

function ProfessionalListSkeleton() {
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

export function Profissionais({ user }: ProfissionaisProps) {
  const [professionals, setProfessionals] = useState<ProfessionalRecord[]>([]);
  const [allServices, setAllServices] = useState<ProfessionalServiceRecord[]>([]);
  const [linkedServicesByProfessional, setLinkedServicesByProfessional] = useState<
    Record<string, ProfessionalServiceRecord[]>
  >({});
  const [appointments, setAppointments] = useState<ProfessionalAppointmentRecord[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<ProfessionalScheduleBlock[]>([]);
  const [activeFilter, setActiveFilter] = useState<ProfessionalFilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalRecord | null>(null);
  const [panelProfessional, setPanelProfessional] = useState<ProfessionalRecord | null>(null);
  const [professionalToDeactivate, setProfessionalToDeactivate] = useState<ProfessionalRecord | null>(null);
  const [blockProfessional, setBlockProfessional] = useState<ProfessionalRecord | null>(null);
  const [servicesProfessional, setServicesProfessional] = useState<ProfessionalRecord | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const userIsAdmin = isAdmin(user);

  useEffect(() => {
    let isMounted = true;

    async function loadProfessionals() {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, work_description, work_type, phone, email, is_active, created_at, updated_at")
        .order("name");

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error(error);
        setErrorMessage("Erro ao carregar profissionais.");
        setProfessionals([]);
        setIsLoading(false);
        return;
      }

      const loadedProfessionals = (data ?? []) as ProfessionalRecord[];
      setProfessionals(loadedProfessionals);

      const professionalIds = loadedProfessionals.map((professional) => professional.id);
      const today = formatDateForQuery(new Date());

      const [servicesResult, linksResult, appointmentsResult, blocksResult] = await Promise.all([
        supabase
          .from("procedures")
          .select(
            "id, name, description, price, duration_minutes, is_active, procedure_categories ( id, name )",
          )
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("procedure_professional")
          .select(
            `
              professional_id,
              procedure_id,
              procedures (
                id,
                name,
                description,
                price,
                duration_minutes,
                is_active,
                procedure_categories (
                  id,
                  name
                )
              )
            `,
          ),
        professionalIds.length > 0
          ? supabase
              .from("v_appointments_full")
              .select(
                "id, professional_id, client_name, scheduled_date, start_time, end_time, procedure_name, price_at_booking, status_code, status_name",
              )
              .in("professional_id", professionalIds)
              .order("scheduled_date", { ascending: false })
              .order("start_time", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("schedule_blocks")
          .select("id, professional_id, block_date, start_time, end_time, reason")
          .gte("block_date", today)
          .order("block_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      if (!isMounted) {
        return;
      }

      if (servicesResult.error) {
        console.error("PROFESSIONAL SERVICES ERROR:", servicesResult.error);
        setErrorMessage("Profissionais carregados, mas não foi possível carregar os serviços.");
      } else {
        setAllServices((servicesResult.data ?? []) as ProfessionalServiceRecord[]);
      }

      if (linksResult.error) {
        console.error("PROFESSIONAL LINKS ERROR:", linksResult.error);
        setLinkedServicesByProfessional({});
        setErrorMessage("Profissionais carregados, mas não foi possível carregar os vínculos de serviços.");
      } else {
        setLinkedServicesByProfessional(
          buildLinkedServicesByProfessional((linksResult.data ?? []) as unknown as ProcedureProfessionalRow[]),
        );
      }

      if (appointmentsResult.error) {
        console.error("PROFESSIONAL APPOINTMENTS ERROR:", appointmentsResult.error);
        setAppointments([]);
        setErrorMessage("Profissionais carregados, mas não foi possível carregar os agendamentos.");
      } else {
        setAppointments((appointmentsResult.data ?? []) as ProfessionalAppointmentRecord[]);
      }

      if (blocksResult.error) {
        console.error("PROFESSIONAL BLOCKS ERROR:", blocksResult.error);
        setScheduleBlocks([]);
        setErrorMessage("Profissionais carregados, mas não foi possível carregar os bloqueios.");
      } else {
        setScheduleBlocks((blocksResult.data ?? []) as ProfessionalScheduleBlock[]);
      }

      setIsLoading(false);
    }

    loadProfessionals();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const professionalSummaries = useMemo(
    () => buildProfessionalSummaries(professionals, appointments, scheduleBlocks, linkedServicesByProfessional),
    [appointments, linkedServicesByProfessional, professionals, scheduleBlocks],
  );

  const filteredProfessionals = useMemo(() => {
    return professionals.filter((professional) => {
      const linkedServices = linkedServicesByProfessional[professional.id] ?? [];
      const summary = professionalSummaries[professional.id] ?? emptyProfessionalSummary;

      return (
        getFilterMatch(professional, linkedServices, summary, activeFilter) &&
        getSearchMatch(professional, linkedServices, searchTerm)
      );
    });
  }, [activeFilter, linkedServicesByProfessional, professionalSummaries, professionals, searchTerm]);

  const activeProfessionals = useMemo(
    () => professionals.filter((professional) => professional.is_active !== false),
    [professionals],
  );
  const panelSummary = panelProfessional
    ? professionalSummaries[panelProfessional.id] ?? emptyProfessionalSummary
    : emptyProfessionalSummary;
  const selectedLinkedServices = panelProfessional ? linkedServicesByProfessional[panelProfessional.id] ?? [] : [];
  const servicesModalLinkedIds = servicesProfessional
    ? (linkedServicesByProfessional[servicesProfessional.id] ?? []).map((service) => service.id)
    : [];

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3600);
  }

  function closeModal() {
    setModalMode(null);
    setSelectedProfessional(null);
    setIsSaving(false);
  }

  function handleEditProfessional(professional: ProfessionalRecord) {
    if (!userIsAdmin) {
      return;
    }

    setSelectedProfessional(professional);
    setModalMode("edit");
  }

  function handleViewAgenda(professional: ProfessionalRecord) {
    window.sessionStorage.setItem(
      "agenda_focus_professional",
      JSON.stringify({
        id: professional.id,
        name: professional.name,
      }),
    );
    window.location.hash = "#/agenda";
  }

  function validateProfessional(values: ProfessionalFormValues) {
    if (!values.name.trim()) {
      setErrorMessage("Nome do profissional é obrigatório.");
      return false;
    }

    if (!values.work_description.trim()) {
      setErrorMessage("O que ele faz é obrigatório.");
      return false;
    }

    if (!values.work_type.trim()) {
      setErrorMessage("Tipo de trabalho é obrigatório.");
      return false;
    }

    return true;
  }

  async function handleCreateProfessional(values: ProfessionalFormValues) {
    if (!userIsAdmin || !validateProfessional(values)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase.from("professionals").insert({
      name: values.name.trim(),
      work_description: values.work_description.trim(),
      work_type: values.work_type.trim(),
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
      is_active: true,
    });

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao cadastrar profissional.");
      setIsSaving(false);
      return;
    }

    closeModal();
    setReloadKey((current) => current + 1);
    showToast("Profissional cadastrado com sucesso.");
  }

  async function handleUpdateProfessional(values: ProfessionalFormValues) {
    if (!selectedProfessional || !userIsAdmin || !validateProfessional(values)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const updatePayload = {
      email: values.email.trim() || null,
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      work_description: values.work_description.trim(),
      work_type: values.work_type.trim(),
    };

    const { error } = await supabase.from("professionals").update(updatePayload).eq("id", selectedProfessional.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao atualizar profissional.");
      setIsSaving(false);
      return;
    }

    setPanelProfessional((current) =>
      current?.id === selectedProfessional.id
        ? ({
            ...current,
            ...updatePayload,
            updated_at: new Date().toISOString(),
          } as ProfessionalRecord)
        : current,
    );
    closeModal();
    setReloadKey((current) => current + 1);
    showToast("Profissional atualizado com sucesso.");
  }

  async function handleDeactivateProfessional() {
    if (!professionalToDeactivate || !userIsAdmin) {
      return;
    }

    const { error } = await supabase
      .from("professionals")
      .update({ is_active: false })
      .eq("id", professionalToDeactivate.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao desativar profissional.");
      setProfessionalToDeactivate(null);
      return;
    }

    if (panelProfessional?.id === professionalToDeactivate.id) {
      setPanelProfessional(null);
    }

    setProfessionalToDeactivate(null);
    setReloadKey((current) => current + 1);
    showToast("Profissional desativado com sucesso.");
  }

  async function handleSaveProfessionalServices(serviceIds: string[]) {
    if (!servicesProfessional || !userIsAdmin) {
      return;
    }

    setIsSavingLinks(true);
    setErrorMessage(null);

    const uniqueServiceIds = [...new Set(serviceIds)];
    const currentLinkedIds = servicesModalLinkedIds;
    const serviceIdsToRemove = currentLinkedIds.filter((serviceId) => !uniqueServiceIds.includes(serviceId));
    const serviceIdsToAdd = uniqueServiceIds.filter((serviceId) => !currentLinkedIds.includes(serviceId));

    if (serviceIdsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("procedure_professional")
        .delete()
        .eq("professional_id", servicesProfessional.id)
        .in("procedure_id", serviceIdsToRemove);

      if (deleteError) {
        console.error("DELETE PROFESSIONAL LINKS ERROR:", deleteError);
        setErrorMessage("Erro ao atualizar serviços do profissional.");
        setIsSavingLinks(false);
        return;
      }
    }

    if (serviceIdsToAdd.length > 0) {
      const { error: insertError } = await supabase.from("procedure_professional").insert(
        serviceIdsToAdd.map((procedureId) => ({
          procedure_id: procedureId,
          professional_id: servicesProfessional.id,
        })),
      );

      if (insertError) {
        console.error("INSERT PROFESSIONAL LINKS ERROR:", insertError);
        setErrorMessage("Erro ao atualizar serviços do profissional.");
        setIsSavingLinks(false);
        return;
      }
    }

    setIsSavingLinks(false);
    setServicesProfessional(null);
    setReloadKey((current) => current + 1);
    showToast("Serviços do profissional atualizados com sucesso.");
  }

  return (
    <PageContainer className="clients-page professionals-page">
      <header className="clients-header">
        <div>
          <h1>Profissionais</h1>
          <p>Visualize e gerencie a equipe, serviços vinculados e disponibilidade</p>
        </div>
      </header>

      {toastMessage ? <p className="agenda-toast">{toastMessage}</p> : null}
      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}

      <section className="clients-toolbar clients-toolbar--operational">
        <div className="clients-toolbar-top">
          <ProfessionalSearch searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
          {userIsAdmin ? (
            <button className="add-button" onClick={() => setModalMode("create")} type="button">
              + Adicionar profissional
            </button>
          ) : null}
        </div>
        <div className="clients-filter-chips" aria-label="Filtros de profissionais">
          {professionalFilterOptions.map((option) => (
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
      </section>

      {isLoading ? (
        <ProfessionalListSkeleton />
      ) : professionals.length === 0 ? (
        <section className="clients-table-panel">
          <div className="clients-empty-state">
            <strong>Nenhum profissional cadastrado</strong>
            <span>Cadastre profissionais para começar a montar a agenda.</span>
          </div>
        </section>
      ) : (
        <ProfessionalTable
          canManage={userIsAdmin}
          linkedServicesByProfessional={linkedServicesByProfessional}
          onBlockAgenda={setBlockProfessional}
          onDeactivate={setProfessionalToDeactivate}
          onEdit={handleEditProfessional}
          onManageServices={setServicesProfessional}
          onViewAgenda={handleViewAgenda}
          onViewDetails={setPanelProfessional}
          professionalSummaries={professionalSummaries}
          professionals={filteredProfessionals}
        />
      )}

      {modalMode && userIsAdmin ? (
        <ProfessionalFormModal
          isSaving={isSaving}
          mode={modalMode}
          professional={selectedProfessional}
          onClose={closeModal}
          onSubmit={modalMode === "create" ? handleCreateProfessional : handleUpdateProfessional}
        />
      ) : null}

      {panelProfessional ? (
        <ProfessionalSidePanel
          canManage={userIsAdmin}
          linkedServices={selectedLinkedServices}
          onBlockAgenda={setBlockProfessional}
          onClose={() => setPanelProfessional(null)}
          onEdit={handleEditProfessional}
          onManageServices={setServicesProfessional}
          onViewAgenda={handleViewAgenda}
          professional={panelProfessional}
          summary={panelSummary}
        />
      ) : null}

      {servicesProfessional && userIsAdmin ? (
        <ProfessionalServicesModal
          allServices={allServices}
          isSaving={isSavingLinks}
          linkedServiceIds={servicesModalLinkedIds}
          onClose={() => setServicesProfessional(null)}
          onSave={handleSaveProfessionalServices}
          professional={servicesProfessional}
        />
      ) : null}

      {blockProfessional && userIsAdmin ? (
        <ScheduleBlockModal
          currentUser={user}
          initialDate={new Date()}
          initialProfessional={blockProfessional}
          mode="professional"
          onClose={() => setBlockProfessional(null)}
          onCreated={(message) => {
            setBlockProfessional(null);
            setReloadKey((current) => current + 1);
            showToast(message);
          }}
          professionals={activeProfessionals}
        />
      ) : null}

      {professionalToDeactivate ? (
        <ConfirmDialog
          confirmLabel="Desativar"
          message="Deseja desativar este profissional? Ele não será removido permanentemente, apenas ficará inativo."
          onCancel={() => setProfessionalToDeactivate(null)}
          onConfirm={handleDeactivateProfessional}
          title="Desativar profissional"
        />
      ) : null}
    </PageContainer>
  );
}
