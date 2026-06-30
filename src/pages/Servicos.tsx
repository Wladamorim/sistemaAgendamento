import { useEffect, useMemo, useState } from "react";
import { isAdmin } from "../components/AppShell";
import { ServiceFormModal } from "../components/services/ServiceFormModal";
import { ServiceProfessionalsModal } from "../components/services/ServiceProfessionalsModal";
import { ServiceSearch } from "../components/services/ServiceSearch";
import { ServiceSidePanel } from "../components/services/ServiceSidePanel";
import { ServiceTable } from "../components/services/ServiceTable";
import { PageContainer } from "../components/layout/PageContainer";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { formatDateForQuery } from "../lib/agenda";
import {
  NEW_CATEGORY_ID,
  RELATIONSHIP_TABLE_MESSAGE,
  isMissingRelationshipTableError,
  normalizeProfessional,
} from "../lib/services";
import { supabase } from "../lib/supabase";
import type {
  ProcedureProfessionalLink,
  ServiceAppointmentRecord,
  ServiceCategory,
  ServiceFilterKey,
  ServiceFormValues,
  ServiceOperationalSummary,
  ServiceProfessional,
  ServiceRecord,
} from "../types/service";
import type { AppUser } from "../types/user";

interface ServicosProps {
  user: AppUser;
}

interface LinkLoadResult {
  linksByProcedure: Map<string, ServiceProfessional[]>;
  missingRelationshipTable: boolean;
  error: unknown;
}

const futureStatusCodes = new Set(["scheduled", "confirmed", "in_progress"]);

const serviceFilterOptions: { label: string; value: ServiceFilterKey }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
  { label: "Com profissionais", value: "with_professionals" },
  { label: "Sem profissionais", value: "without_professionals" },
  { label: "Mais agendados", value: "most_scheduled" },
  { label: "Sem atendimentos recentes", value: "without_recent" },
];

const emptyServiceSummary: ServiceOperationalSummary = {
  averageTicket: 0,
  completedThisMonth: 0,
  history: [],
  lastCompleted: null,
  monthlyRevenue: 0,
  nextAppointment: null,
};

function toNumber(value: string) {
  const parsedValue = Number(value.replace(",", "."));
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getAppointmentDateTime(appointment: ServiceAppointmentRecord) {
  return new Date(`${appointment.scheduled_date}T${appointment.start_time || "00:00"}`);
}

function sortAppointmentsDescending(left: ServiceAppointmentRecord, right: ServiceAppointmentRecord) {
  return getAppointmentDateTime(right).getTime() - getAppointmentDateTime(left).getTime();
}

function sortAppointmentsAscending(left: ServiceAppointmentRecord, right: ServiceAppointmentRecord) {
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

function getCategoryName(service: ServiceRecord) {
  const category = Array.isArray(service.procedure_categories)
    ? service.procedure_categories[0]
    : service.procedure_categories;
  return category?.name ?? "";
}

function buildServiceSummaries(services: ServiceRecord[], appointments: ServiceAppointmentRecord[]) {
  const now = new Date();
  const monthRange = getMonthRange(now);
  const summaries: Record<string, ServiceOperationalSummary> = {};

  services.forEach((service) => {
    const serviceAppointments = appointments
      .filter((appointment) => appointment.procedure_id === service.id)
      .sort(sortAppointmentsDescending);
    const completedAppointments = serviceAppointments.filter((appointment) => appointment.status_code === "completed");
    const completedThisMonth = completedAppointments.filter(
      (appointment) => appointment.scheduled_date >= monthRange.start && appointment.scheduled_date <= monthRange.end,
    );
    const monthlyRevenue = completedThisMonth.reduce(
      (sum, appointment) => sum + Number(appointment.price_at_booking ?? 0),
      0,
    );
    const nextAppointment =
      serviceAppointments
        .filter((appointment) => {
          if (!appointment.status_code || !futureStatusCodes.has(appointment.status_code)) {
            return false;
          }

          return getAppointmentDateTime(appointment).getTime() >= now.getTime();
        })
        .sort(sortAppointmentsAscending)[0] ?? null;

    summaries[service.id] = {
      averageTicket: completedThisMonth.length > 0 ? monthlyRevenue / completedThisMonth.length : 0,
      completedThisMonth: completedThisMonth.length,
      history: serviceAppointments,
      lastCompleted: completedAppointments[0] ?? null,
      monthlyRevenue,
      nextAppointment,
    };
  });

  return summaries;
}

function getFilterMatch(service: ServiceRecord, summary: ServiceOperationalSummary, filter: ServiceFilterKey) {
  if (filter === "inactive") {
    return service.is_active === false;
  }

  if (filter === "active") {
    return service.is_active !== false;
  }

  if (service.is_active === false) {
    return false;
  }

  if (filter === "with_professionals") {
    return service.professionals.length > 0;
  }

  if (filter === "without_professionals") {
    return service.professionals.length === 0;
  }

  if (filter === "most_scheduled") {
    return summary.completedThisMonth > 0;
  }

  if (filter === "without_recent") {
    return summary.completedThisMonth === 0;
  }

  return true;
}

function getSearchMatch(service: ServiceRecord, searchTerm: string) {
  const normalizedSearch = normalizeSearch(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return [service.name, getCategoryName(service), service.description ?? "", ...service.professionals.map((item) => item.name)]
    .map(normalizeSearch)
    .some((value) => value.includes(normalizedSearch));
}

function ServiceListSkeleton() {
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

export function Servicos({ user }: ServicosProps) {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [professionals, setProfessionals] = useState<ServiceProfessional[]>([]);
  const [appointments, setAppointments] = useState<ServiceAppointmentRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<ServiceFilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [relationshipMessage, setRelationshipMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [detailsService, setDetailsService] = useState<ServiceRecord | null>(null);
  const [linksService, setLinksService] = useState<ServiceRecord | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceRecord | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const userIsAdmin = isAdmin(user);

  async function loadProcedureLinks(procedureIds: string[]): Promise<LinkLoadResult> {
    const linksByProcedure = new Map<string, ServiceProfessional[]>();

    if (procedureIds.length === 0) {
      return { linksByProcedure, missingRelationshipTable: false, error: null };
    }

    const linkQuery = supabase
      .from("procedure_professional")
      .select(`
        id,
        procedure_id,
        professional_id,
        professionals (
          id,
          name,
          work_description,
          work_type,
          phone,
          email,
          is_active
        )
      `);

    const { data, error } =
      procedureIds.length === 1
        ? await linkQuery.eq("procedure_id", procedureIds[0])
        : await linkQuery.in("procedure_id", procedureIds);

    if (error) {
      console.error(error);
      return {
        linksByProcedure,
        missingRelationshipTable: isMissingRelationshipTableError(error),
        error,
      };
    }

    const links = (data ?? []) as unknown as ProcedureProfessionalLink[];

    links.forEach((link) => {
      const professional = normalizeProfessional(link.professionals);

      if (!professional) {
        return;
      }

      const currentLinks = linksByProcedure.get(link.procedure_id) ?? [];

      if (!currentLinks.some((item) => item.id === professional.id)) {
        linksByProcedure.set(link.procedure_id, [...currentLinks, professional]);
      }
    });

    return { linksByProcedure, missingRelationshipTable: false, error: null };
  }

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      setIsLoading(true);
      setErrorMessage(null);

      const [servicesResult, categoriesResult, professionalsResult] = await Promise.all([
        supabase
          .from("procedures")
          .select(`
            id,
            category_id,
            name,
            description,
            price,
            duration_minutes,
            requires_return,
            return_after_days,
            is_active,
            created_at,
            updated_at,
            procedure_categories (
              id,
              name
            )
          `)
          .order("name"),
        supabase.from("procedure_categories").select("id, name, description, is_active").order("name"),
        supabase
          .from("professionals")
          .select("id, name, work_description, work_type, phone, email, is_active")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (!isMounted) {
        return;
      }

      if (servicesResult.error) {
        console.error(servicesResult.error);
        setErrorMessage("Erro ao carregar serviços.");
        setServices([]);
        setIsLoading(false);
        return;
      }

      if (categoriesResult.error) {
        console.error(categoriesResult.error);
        setErrorMessage("Erro ao carregar categorias.");
      } else {
        const activeCategories = ((categoriesResult.data ?? []) as ServiceCategory[]).filter(
          (category) => category.is_active !== false,
        );
        setCategories(activeCategories);
      }

      if (professionalsResult.error) {
        console.error(professionalsResult.error);
        setErrorMessage("Erro ao carregar profissionais.");
      } else {
        setProfessionals((professionalsResult.data ?? []) as ServiceProfessional[]);
      }

      const baseServices = ((servicesResult.data ?? []) as unknown as ServiceRecord[]).map((service) => ({
        ...service,
        professionals: [],
      }));

      const serviceIds = baseServices.map((service) => service.id);
      const linkResult = await loadProcedureLinks(serviceIds);

      if (!isMounted) {
        return;
      }

      if (linkResult.missingRelationshipTable) {
        setRelationshipMessage(RELATIONSHIP_TABLE_MESSAGE);
      } else if (linkResult.error) {
        setErrorMessage("Erro ao carregar vínculos dos serviços.");
      } else {
        setRelationshipMessage(null);
      }

      const servicesWithProfessionals = baseServices.map((service) => ({
        ...service,
        professionals: linkResult.linksByProcedure.get(service.id) ?? [],
      }));

      setServices(servicesWithProfessionals);

      if (serviceIds.length === 0) {
        setAppointments([]);
        setIsLoading(false);
        return;
      }

      const { data: appointmentData, error: appointmentError } = await supabase
        .from("appointments")
        .select(
          "id, procedure_id, professional_id, client_id, scheduled_date, start_time, end_time, price_at_booking, status_code, clients ( full_name ), professionals ( name )",
        )
        .in("procedure_id", serviceIds)
        .order("scheduled_date", { ascending: false })
        .order("start_time", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (appointmentError) {
        console.error("SERVICE APPOINTMENTS ERROR:", appointmentError);
        setAppointments([]);
        setErrorMessage("Serviços carregados, mas não foi possível carregar métricas.");
      } else {
        setAppointments((appointmentData ?? []) as unknown as ServiceAppointmentRecord[]);
      }

      setIsLoading(false);
    }

    loadServices();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const serviceSummaries = useMemo(() => buildServiceSummaries(services, appointments), [appointments, services]);

  const filteredServices = useMemo(() => {
    const result = services.filter((service) => {
      const summary = serviceSummaries[service.id] ?? emptyServiceSummary;
      return getFilterMatch(service, summary, activeFilter) && getSearchMatch(service, searchTerm);
    });

    if (activeFilter === "most_scheduled") {
      return [...result].sort(
        (first, second) =>
          (serviceSummaries[second.id]?.completedThisMonth ?? 0) -
          (serviceSummaries[first.id]?.completedThisMonth ?? 0),
      );
    }

    return result;
  }, [activeFilter, searchTerm, serviceSummaries, services]);

  const detailsSummary = detailsService ? serviceSummaries[detailsService.id] ?? emptyServiceSummary : emptyServiceSummary;

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3600);
  }

  function closeFormModal() {
    setModalMode(null);
    setSelectedService(null);
    setIsSaving(false);
  }

  function openEditModal(service: ServiceRecord) {
    setSelectedService(service);
    setDetailsService(null);
    setModalMode("edit");
  }

  function openDetails(service: ServiceRecord) {
    setDetailsService(service);
  }

  function validateService(values: ServiceFormValues) {
    if (!values.name.trim()) {
      setErrorMessage("Nome do serviço é obrigatório.");
      return false;
    }

    if (!values.category_id) {
      setErrorMessage("Selecione uma categoria.");
      return false;
    }

    if (values.category_id === NEW_CATEGORY_ID && !values.new_category_name.trim()) {
      setErrorMessage("Informe o nome da nova categoria.");
      return false;
    }

    if (toNumber(values.price) === null) {
      setErrorMessage("Informe o valor do serviço.");
      return false;
    }

    if (toNumber(values.duration_minutes) === null) {
      setErrorMessage("Informe a duração média do serviço.");
      return false;
    }

    return true;
  }

  async function resolveCategoryId(values: ServiceFormValues) {
    if (values.category_id !== NEW_CATEGORY_ID) {
      return values.category_id;
    }

    const { data, error } = await supabase
      .from("procedure_categories")
      .insert({
        description: values.new_category_description.trim() || null,
        is_active: true,
        name: values.new_category_name.trim(),
      })
      .select("id, name, description, is_active")
      .single();

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao cadastrar serviço.");
      return null;
    }

    const newCategory = data as ServiceCategory;
    setCategories((current) => sortByName([...current, newCategory]));

    return newCategory.id;
  }

  async function saveProfessionalLinks(procedureId: string, professionalIds: string[]) {
    if (relationshipMessage) {
      return true;
    }

    const currentProfessionalIds = services.find((service) => service.id === procedureId)?.professionals.map((item) => item.id) ?? [];
    const uniqueProfessionalIds = [...new Set(professionalIds)];
    const professionalsToRemove = currentProfessionalIds.filter((id) => !uniqueProfessionalIds.includes(id));
    const professionalsToAdd = uniqueProfessionalIds.filter((id) => !currentProfessionalIds.includes(id));

    if (professionalsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("procedure_professional")
        .delete()
        .eq("procedure_id", procedureId)
        .in("professional_id", professionalsToRemove);

      if (deleteError) {
        console.error(deleteError);

        if (isMissingRelationshipTableError(deleteError)) {
          setRelationshipMessage(RELATIONSHIP_TABLE_MESSAGE);
        }

        setErrorMessage("Erro ao vincular profissionais ao serviço.");
        return false;
      }
    }

    if (professionalsToAdd.length > 0) {
      const { error: insertError } = await supabase.from("procedure_professional").insert(
        professionalsToAdd.map((professionalId) => ({
          procedure_id: procedureId,
          professional_id: professionalId,
        })),
      );

      if (insertError) {
        console.error(insertError);

        if (isMissingRelationshipTableError(insertError)) {
          setRelationshipMessage(RELATIONSHIP_TABLE_MESSAGE);
        }

        setErrorMessage("Erro ao vincular profissionais ao serviço.");
        return false;
      }
    }

    return true;
  }

  async function handleCreateService(values: ServiceFormValues) {
    if (!userIsAdmin || !validateService(values)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const categoryId = await resolveCategoryId(values);

    if (!categoryId) {
      setIsSaving(false);
      return;
    }

    const price = toNumber(values.price);
    const durationMinutes = toNumber(values.duration_minutes);
    const returnAfterDays = values.requires_return ? toNumber(values.return_after_days) : null;

    const { data, error } = await supabase
      .from("procedures")
      .insert({
        category_id: categoryId,
        description: values.description.trim() || null,
        duration_minutes: durationMinutes,
        is_active: true,
        name: values.name.trim(),
        price,
        requires_return: values.requires_return,
        return_after_days: returnAfterDays,
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao cadastrar serviço.");
      setIsSaving(false);
      return;
    }

    const linksSaved = await saveProfessionalLinks(data.id as string, values.professional_ids);

    if (!linksSaved) {
      setIsSaving(false);
      return;
    }

    closeFormModal();
    setReloadKey((current) => current + 1);
    showToast("Serviço cadastrado com sucesso.");
  }

  async function handleUpdateService(values: ServiceFormValues) {
    if (!selectedService || !userIsAdmin || !validateService(values)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const categoryId = await resolveCategoryId(values);

    if (!categoryId) {
      setIsSaving(false);
      return;
    }

    const price = toNumber(values.price);
    const durationMinutes = toNumber(values.duration_minutes);
    const returnAfterDays = values.requires_return ? toNumber(values.return_after_days) : null;

    const { error } = await supabase
      .from("procedures")
      .update({
        category_id: categoryId,
        description: values.description.trim() || null,
        duration_minutes: durationMinutes,
        is_active: values.is_active,
        name: values.name.trim(),
        price,
        requires_return: values.requires_return,
        return_after_days: returnAfterDays,
      })
      .eq("id", selectedService.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao atualizar serviço.");
      setIsSaving(false);
      return;
    }

    const linksSaved = await saveProfessionalLinks(selectedService.id, values.professional_ids);

    if (!linksSaved) {
      setIsSaving(false);
      return;
    }

    closeFormModal();
    setReloadKey((current) => current + 1);
    showToast("Serviço atualizado com sucesso.");
  }

  async function handleSaveServiceProfessionals(professionalIds: string[]) {
    if (!linksService || !userIsAdmin) {
      return;
    }

    setIsSavingLinks(true);
    setErrorMessage(null);

    const linksSaved = await saveProfessionalLinks(linksService.id, professionalIds);

    if (!linksSaved) {
      setIsSavingLinks(false);
      return;
    }

    const nextProfessionals = professionals.filter((professional) => professionalIds.includes(professional.id));

    setDetailsService((current) =>
      current?.id === linksService.id
        ? {
            ...current,
            professionals: nextProfessionals,
          }
        : current,
    );
    setLinksService(null);
    setIsSavingLinks(false);
    setReloadKey((current) => current + 1);
    showToast("Profissionais vinculados atualizados com sucesso.");
  }

  async function handleDeleteService() {
    if (!serviceToDelete || !userIsAdmin) {
      return;
    }

    const { error } = await supabase.from("procedures").update({ is_active: false }).eq("id", serviceToDelete.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao desativar serviço.");
      setServiceToDelete(null);
      return;
    }

    if (detailsService?.id === serviceToDelete.id) {
      setDetailsService(null);
    }

    setServiceToDelete(null);
    setReloadKey((current) => current + 1);
    showToast("Serviço desativado com sucesso.");
  }

  return (
    <PageContainer className="clients-page services-page">
      <header className="clients-header">
        <div>
          <h1>Serviços</h1>
          <p>Gerencie procedimentos, preços, duração e profissionais vinculados</p>
        </div>
      </header>

      {toastMessage ? <p className="agenda-toast">{toastMessage}</p> : null}
      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}
      {relationshipMessage ? <p className="agenda-alert">{relationshipMessage}</p> : null}

      <section className="clients-toolbar clients-toolbar--operational">
        <div className="clients-toolbar-top">
          <ServiceSearch searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
          {userIsAdmin ? (
            <button className="add-button" onClick={() => setModalMode("create")} type="button">
              + Adicionar serviço
            </button>
          ) : null}
        </div>
        <div className="clients-filter-chips" aria-label="Filtros de serviços">
          {serviceFilterOptions.map((option) => (
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
        <ServiceListSkeleton />
      ) : services.length === 0 ? (
        <section className="clients-table-panel">
          <div className="clients-empty-state">
            <strong>Nenhum serviço cadastrado</strong>
            <span>Cadastre serviços para começar a montar sua agenda.</span>
          </div>
        </section>
      ) : (
        <ServiceTable
          canManage={userIsAdmin}
          onDelete={setServiceToDelete}
          onEdit={openEditModal}
          onManageProfessionals={setLinksService}
          onViewDetails={openDetails}
          serviceSummaries={serviceSummaries}
          services={filteredServices}
        />
      )}

      {detailsService ? (
        <ServiceSidePanel
          canManage={userIsAdmin}
          relationshipMessage={relationshipMessage}
          service={detailsService}
          summary={detailsSummary}
          onClose={() => setDetailsService(null)}
          onEdit={openEditModal}
          onManageProfessionals={setLinksService}
        />
      ) : null}

      {linksService && userIsAdmin ? (
        <ServiceProfessionalsModal
          isSaving={isSavingLinks}
          professionals={professionals}
          relationshipMessage={relationshipMessage}
          service={linksService}
          onClose={() => setLinksService(null)}
          onSave={handleSaveServiceProfessionals}
        />
      ) : null}

      {modalMode && userIsAdmin ? (
        <ServiceFormModal
          categories={categories}
          isSaving={isSaving}
          mode={modalMode}
          professionals={professionals}
          relationshipMessage={relationshipMessage}
          service={selectedService}
          onClose={closeFormModal}
          onSubmit={modalMode === "create" ? handleCreateService : handleUpdateService}
        />
      ) : null}

      {serviceToDelete ? (
        <ConfirmDialog
          confirmLabel="Desativar"
          message="Deseja desativar este serviço? Ele não será removido permanentemente, apenas ficará inativo."
          onCancel={() => setServiceToDelete(null)}
          onConfirm={handleDeleteService}
          title="Desativar serviço"
        />
      ) : null}
    </PageContainer>
  );
}
