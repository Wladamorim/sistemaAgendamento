import { useEffect, useMemo, useRef, useState } from "react";
import { AgendaGrid } from "../components/agenda/AgendaGrid";
import { AgendaMobileList } from "../components/agenda/AgendaMobileList";
import { AgendaToolbar } from "../components/agenda/AgendaToolbar";
import { AppointmentCreateModal } from "../components/agenda/AppointmentCreateModal";
import { AppointmentDetailsModal } from "../components/agenda/AppointmentDetailsModal";
import { ScheduleBlockModal } from "../components/agenda/ScheduleBlockModal";
import { SearchInput } from "../components/ui/SearchInput";
import { addDays, formatDateForQuery, formatTime, generateTimeSlots, timeToMinutes } from "../lib/agenda";
import { getAppointmentStatusLabel } from "../lib/appointmentStatus";
import { supabase } from "../lib/supabase";
import type { Appointment, Client, Professional, ScheduleBlock, SelectedAgendaSlot } from "../types/agenda";
import type { AppUser } from "../types/user";

interface AgendaProps {
  user: AppUser;
}

type AgendaQuickFilter = "all" | "scheduled" | "confirmed" | "completed" | "blocked";

const activeAppointmentStatuses = new Set(["scheduled", "confirmed", "in_progress", "completed"]);
const agendaFilterOptions: { label: string; value: AgendaQuickFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Agendados", value: "scheduled" },
  { label: "Confirmados", value: "confirmed" },
  { label: "Finalizados", value: "completed" },
  { label: "Bloqueados", value: "blocked" },
];

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isSameDate(left: Date, right: Date) {
  return formatDateForQuery(left) === formatDateForQuery(right);
}

function getCurrentTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function readStoredProfessionalFilter() {
  const rawValue = window.localStorage.getItem("agendaSelectedProfessionals");

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function Agenda({ user }: AgendaProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [quickFilter, setQuickFilter] = useState<AgendaQuickFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>(readStoredProfessionalFilter);
  const [professionalFilterIsOpen, setProfessionalFilterIsOpen] = useState(false);
  const [professionalFilterSearch, setProfessionalFilterSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<SelectedAgendaSlot | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [prefilledClient, setPrefilledClient] = useState<Client | null>(null);
  const [blockModalMode, setBlockModalMode] = useState<"time" | "professional" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const professionalFilterRef = useRef<HTMLDivElement | null>(null);
  const timeSlots = useMemo(() => generateTimeSlots(), []);
  const canManageBlocks = user.role === "Administrador";

  useEffect(() => {
    const rawClient = window.sessionStorage.getItem("agenda_prefill_client");

    if (rawClient) {
      window.sessionStorage.removeItem("agenda_prefill_client");

      try {
        const client = JSON.parse(rawClient) as Client;
        setPrefilledClient(client);
        setToastMessage(`Cliente selecionado: ${client.full_name}. Clique em um horario livre para concluir.`);
        window.setTimeout(() => setToastMessage(null), 4200);
      } catch (error) {
        console.error("AGENDA PREFILL CLIENT ERROR:", error);
      }
    }

    const rawProfessional = window.sessionStorage.getItem("agenda_focus_professional");

    if (rawProfessional) {
      window.sessionStorage.removeItem("agenda_focus_professional");

      try {
        const professional = JSON.parse(rawProfessional) as { id: string; name: string };
        setToastMessage(`Agenda de ${professional.name}. Arraste a grade para localizar a coluna do profissional.`);
        window.setTimeout(() => setToastMessage(null), 4200);
      } catch (error) {
        console.error("AGENDA FOCUS PROFESSIONAL ERROR:", error);
      }
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("agendaSelectedProfessionals", JSON.stringify(selectedProfessionalIds));
  }, [selectedProfessionalIds]);

  useEffect(() => {
    if (professionals.length === 0 || selectedProfessionalIds.length === 0) {
      return;
    }

    const availableProfessionalIds = new Set(professionals.map((professional) => professional.id));
    setSelectedProfessionalIds((currentIds) => currentIds.filter((professionalId) => availableProfessionalIds.has(professionalId)));
  }, [professionals, selectedProfessionalIds.length]);

  useEffect(() => {
    if (!professionalFilterIsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (professionalFilterRef.current && !professionalFilterRef.current.contains(event.target as Node)) {
        setProfessionalFilterIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfessionalFilterIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [professionalFilterIsOpen]);

  useEffect(() => {
    let isMounted = true;

    async function loadAgenda() {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, work_description, work_type, phone, email, is_active")
        .eq("is_active", true)
        .order("name");

      console.log("PROFESSIONALS DATA:", data);
      console.log("PROFESSIONALS ERROR:", error);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("PROFESSIONALS ERROR:", error);
        setProfessionals([]);
        setAppointments([]);
        setScheduleBlocks([]);
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from("v_appointments_full")
        .select(`
          id,
          scheduled_date,
          start_time,
          end_time,
          client_name,
          client_phone,
          procedure_name,
          category_name,
          professional_id,
          professional_name,
          professional_work_description,
          professional_work_type,
          price_at_booking,
          duration_at_booking,
          status_code,
          status_name,
          appointment_notes
        `)
        .eq("scheduled_date", formatDateForQuery(selectedDate))
        .not("status_code", "eq", "cancelled")
        .not("status_code", "eq", "no_show")
        .not("status_code", "eq", "rescheduled")
        .order("start_time", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (appointmentsError) {
        console.error("APPOINTMENTS ERROR:", appointmentsError);
        setProfessionals((data ?? []) as Professional[]);
        setAppointments([]);
        setScheduleBlocks([]);
        setErrorMessage("Erro ao carregar agendamentos.");
        setIsLoading(false);
        return;
      }

      const { data: blocksData, error: blocksError } = await supabase
        .from("schedule_blocks")
        .select("id, professional_id, block_date, start_time, end_time, reason")
        .eq("block_date", formatDateForQuery(selectedDate))
        .order("start_time", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (blocksError) {
        console.error("SCHEDULE BLOCKS ERROR:", blocksError);
        setProfessionals((data ?? []) as Professional[]);
        setAppointments((appointmentsData ?? []) as Appointment[]);
        setScheduleBlocks([]);
        setErrorMessage("Erro ao carregar bloqueios da agenda.");
        setIsLoading(false);
        return;
      }

      setProfessionals((data ?? []) as Professional[]);
      setAppointments((appointmentsData ?? []) as Appointment[]);
      setScheduleBlocks((blocksData ?? []) as ScheduleBlock[]);
      setIsLoading(false);
    }

    loadAgenda();

    return () => {
      isMounted = false;
    };
  }, [selectedDate, reloadKey]);

  const activeAppointments = useMemo(
    () => appointments.filter((appointment) => activeAppointmentStatuses.has(appointment.status_code ?? "")),
    [appointments],
  );

  const searchValue = normalizeSearch(searchTerm);
  const searchedAppointments = useMemo(() => {
    if (!searchValue) {
      return activeAppointments;
    }

    return activeAppointments.filter((appointment) => {
      const searchHaystack = normalizeSearch(
        [
          appointment.client_name,
          appointment.client_phone,
          appointment.procedure_name,
          appointment.category_name,
          appointment.professional_name,
          appointment.status_name,
          appointment.status_code,
        ]
          .filter(Boolean)
          .join(" "),
      );

      return searchHaystack.includes(searchValue);
    });
  }, [activeAppointments, searchValue]);

  const searchedBlocks = useMemo(() => {
    if (!searchValue) {
      return scheduleBlocks;
    }

    return scheduleBlocks.filter((block) => normalizeSearch(block.reason ?? "horário bloqueado").includes(searchValue));
  }, [scheduleBlocks, searchValue]);

  const filteredAppointments = useMemo(() => {
    if (quickFilter === "blocked") {
      return [];
    }

    if (quickFilter === "all") {
      return searchedAppointments;
    }

    return searchedAppointments.filter((appointment) => appointment.status_code === quickFilter);
  }, [quickFilter, searchedAppointments]);

  const filteredBlocks = useMemo(() => {
    if (quickFilter === "blocked" || quickFilter === "all") {
      return searchedBlocks;
    }

    return [];
  }, [quickFilter, searchedBlocks]);

  const selectedProfessionalIdSet = useMemo(() => new Set(selectedProfessionalIds), [selectedProfessionalIds]);
  const hasProfessionalFilter = selectedProfessionalIds.length > 0;
  const visibleProfessionals = useMemo(() => {
    if (!hasProfessionalFilter) {
      return professionals;
    }

    return professionals.filter((professional) => selectedProfessionalIdSet.has(professional.id));
  }, [hasProfessionalFilter, professionals, selectedProfessionalIdSet]);
  const visibleProfessionalIdSet = useMemo(
    () => new Set(visibleProfessionals.map((professional) => professional.id)),
    [visibleProfessionals],
  );
  const visibleAppointments = useMemo(
    () => filteredAppointments.filter((appointment) => visibleProfessionalIdSet.has(appointment.professional_id)),
    [filteredAppointments, visibleProfessionalIdSet],
  );
  const visibleBlocks = useMemo(
    () =>
      filteredBlocks.filter((block) => !block.professional_id || visibleProfessionalIdSet.has(block.professional_id)),
    [filteredBlocks, visibleProfessionalIdSet],
  );
  const professionalFilterSearchValue = normalizeSearch(professionalFilterSearch);
  const professionalFilterOptions = useMemo(() => {
    if (!professionalFilterSearchValue) {
      return professionals;
    }

    return professionals.filter((professional) =>
      normalizeSearch([professional.name, professional.work_description, professional.work_type].filter(Boolean).join(" ")).includes(
        professionalFilterSearchValue,
      ),
    );
  }, [professionalFilterSearchValue, professionals]);
  const professionalFilterLabel = useMemo(() => {
    if (!hasProfessionalFilter) {
      return "Todos os profissionais";
    }

    if (selectedProfessionalIds.length === 1) {
      return professionals.find((professional) => professional.id === selectedProfessionalIds[0])?.name ?? "1 profissional";
    }

    return `${selectedProfessionalIds.length} profissionais`;
  }, [hasProfessionalFilter, professionals, selectedProfessionalIds]);

  const finishedCount = activeAppointments.filter((appointment) => appointment.status_code === "completed").length;
  const scheduledOrConfirmedCount = activeAppointments.filter((appointment) =>
    ["scheduled", "confirmed"].includes(appointment.status_code ?? ""),
  ).length;
  const confirmedCount = activeAppointments.filter((appointment) => appointment.status_code === "confirmed").length;
  const selectedDateIsToday = isSameDate(selectedDate, now);
  const selectedDateIsPast = formatDateForQuery(selectedDate) < formatDateForQuery(now);
  const nextAppointment = useMemo(() => {
    const currentMinutes = selectedDateIsToday ? now.getHours() * 60 + now.getMinutes() : 0;

    if (selectedDateIsPast && !selectedDateIsToday) {
      return null;
    }

    return [...activeAppointments]
      .sort((left, right) => timeToMinutes(left.start_time) - timeToMinutes(right.start_time))
      .find((appointment) => timeToMinutes(appointment.start_time) >= currentMinutes);
  }, [activeAppointments, now, selectedDateIsPast, selectedDateIsToday]);
  const hasStatusOrSearchFilter = quickFilter !== "all" || searchValue.length > 0;
  const hasActiveViewFilter = hasStatusOrSearchFilter || hasProfessionalFilter;
  const hasVisibleItems =
    visibleAppointments.length > 0 ||
    visibleBlocks.length > 0 ||
    (!hasStatusOrSearchFilter && hasProfessionalFilter && visibleProfessionals.length > 0);
  const searchIsActive = searchValue.length > 0;
  const searchResultCount = visibleAppointments.length;
  const highlightedAppointmentIds = searchIsActive ? visibleAppointments.map((appointment) => appointment.id) : [];
  const emptyViewMessage = searchValue
    ? "Nenhum agendamento encontrado para esta busca."
    : quickFilter !== "all"
      ? "Nenhum item encontrado para este filtro."
      : "Nenhum agendamento para este dia. Use um horário livre para criar um novo agendamento.";

  function toggleProfessionalSelection(professionalId: string) {
    setSelectedProfessionalIds((currentIds) =>
      currentIds.includes(professionalId)
        ? currentIds.filter((currentId) => currentId !== professionalId)
        : [...currentIds, professionalId],
    );
  }

  function openCreateAppointmentFromSlot(professional: Professional, startTime: string) {
    const date = formatDateForQuery(selectedDate);

    console.log("[OpenCreateAppointment] slot recebido:", {
      date,
      professionalId: professional.id,
      professionalName: professional.name,
      startTime,
    });

    setSelectedSlot({ professional, startTime });
  }

  return (
    <main className="agenda-page">
      <AgendaToolbar
        canManageBlocks={canManageBlocks}
        date={selectedDate}
        onBlockTime={() => setBlockModalMode("time")}
        onDateChange={setSelectedDate}
        onNextDay={() => setSelectedDate((currentDate) => addDays(currentDate, 1))}
        onPreviousDay={() => setSelectedDate((currentDate) => addDays(currentDate, -1))}
        onToday={() => setSelectedDate(new Date())}
        userName={user.name}
        userRole={user.role}
      />

      {toastMessage ? <p className="agenda-toast">{toastMessage}</p> : null}
      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}

      {!isLoading && professionals.length > 0 ? (
        <>
          <section className="agenda-day-summary" aria-label="Resumo operacional do dia">
            <div className="agenda-day-summary__overview">
              <span>Resumo do dia</span>
              <div className="agenda-summary-metrics" aria-label="Indicadores do dia">
                <div className="agenda-summary-metric">
                  <strong>{activeAppointments.length}</strong>
                  <small>Agendamentos</small>
                </div>
                <div className="agenda-summary-metric">
                  <strong>{finishedCount}</strong>
                  <small>Finalizados</small>
                </div>
                <div className="agenda-summary-metric">
                  <strong>{confirmedCount}</strong>
                  <small>Confirmados</small>
                </div>
                <div className="agenda-summary-metric">
                  <strong>{scheduleBlocks.length}</strong>
                  <small>Bloqueios</small>
                </div>
              </div>
              <strong>
                {activeAppointments.length} agendamento(s) · {finishedCount} finalizado(s) · {confirmedCount} confirmado(s) ·{" "}
                {scheduleBlocks.length} bloqueio(s)
              </strong>
              <small>{scheduledOrConfirmedCount} agendado(s)/confirmado(s) ativos no período.</small>
            </div>
            <div className="agenda-day-summary__next">
              <span>Próximo atendimento</span>
              {nextAppointment ? (
                <strong>
                  {nextAppointment.client_name ?? "Cliente sem nome"} às {formatTime(nextAppointment.start_time)}
                  {nextAppointment.professional_name ? ` com ${nextAppointment.professional_name}` : ""}
                </strong>
              ) : (
                <strong>Nenhum próximo atendimento para este dia.</strong>
              )}
            </div>
          </section>

          <section className="agenda-quick-controls" aria-label="Busca e filtros da agenda">
            <SearchInput
              className="agenda-search"
              mobilePlaceholder="Buscar na agenda"
              onChange={setSearchTerm}
              placeholder="Cliente, serviço ou profissional"
              value={searchTerm}
            />
            <div className="agenda-quick-controls__filters">
              <div className="agenda-filter-chips" role="tablist" aria-label="Filtros rápidos">
                {agendaFilterOptions.map((option) => (
                  <button
                    aria-selected={quickFilter === option.value}
                    className={quickFilter === option.value ? "is-active" : ""}
                    key={option.value}
                    onClick={() => setQuickFilter(option.value)}
                    role="tab"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="agenda-professional-filter" ref={professionalFilterRef}>
                <button
                  aria-expanded={professionalFilterIsOpen}
                  className={hasProfessionalFilter ? "agenda-professional-filter__button is-active" : "agenda-professional-filter__button"}
                  onClick={() => setProfessionalFilterIsOpen((isOpen) => !isOpen)}
                  type="button"
                >
                  {professionalFilterLabel}
                  <span aria-hidden="true" className="agenda-professional-filter__chevron" />
                </button>
                {professionalFilterIsOpen ? (
                  <div className="agenda-professional-filter__popover">
                    <div className="agenda-professional-filter__header">
                      <strong>Profissionais</strong>
                      <button onClick={() => setSelectedProfessionalIds([])} type="button">
                        Limpar
                      </button>
                    </div>
                    <SearchInput
                      className="agenda-professional-filter__search"
                      onChange={setProfessionalFilterSearch}
                      placeholder="Buscar profissional"
                      value={professionalFilterSearch}
                    />
                    <div className="agenda-professional-filter__list">
                      <button
                        className={!hasProfessionalFilter ? "is-selected" : ""}
                        onClick={() => setSelectedProfessionalIds([])}
                        type="button"
                      >
                        <span aria-hidden="true" className="agenda-professional-filter__check" />
                        Todos
                      </button>
                      {professionalFilterOptions.map((professional) => {
                        const isSelected = selectedProfessionalIdSet.has(professional.id);

                        return (
                          <button
                            className={isSelected ? "is-selected" : ""}
                            key={professional.id}
                            onClick={() => toggleProfessionalSelection(professional.id)}
                            type="button"
                          >
                            <span aria-hidden="true" className="agenda-professional-filter__check" />
                            {professional.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {hasProfessionalFilter ? (
              <div className="agenda-selected-professionals" aria-label="Profissionais filtrados">
                <span>Profissionais:</span>
                {visibleProfessionals.map((professional) => (
                  <button key={professional.id} onClick={() => toggleProfessionalSelection(professional.id)} type="button">
                    {professional.name} <span aria-hidden="true">x</span>
                  </button>
                ))}
                <button className="agenda-selected-professionals__clear" onClick={() => setSelectedProfessionalIds([])} type="button">
                  Limpar
                </button>
              </div>
            ) : null}
          </section>

          {searchIsActive ? (
            <section className="agenda-search-results" aria-live="polite">
              <div className="agenda-search-results__header">
                <div>
                  <span>Resultado da busca</span>
                  {searchResultCount > 0 ? (
                    <strong>
                      {searchResultCount} {searchResultCount === 1 ? "agendamento encontrado" : "agendamentos encontrados"} para “{searchTerm.trim()}”
                    </strong>
                  ) : (
                    <strong>Nenhum agendamento encontrado para “{searchTerm.trim()}”</strong>
                  )}
                </div>
                {quickFilter !== "all" && searchResultCount === 0 ? (
                  <button className="ghost-button" onClick={() => setQuickFilter("all")} type="button">
                    Limpar filtro
                  </button>
                ) : null}
              </div>

              {searchResultCount > 0 ? (
                <div className="agenda-search-results__list">
                  {visibleAppointments.map((appointment) => (
                    <article className="agenda-search-result-item" key={appointment.id}>
                      <div>
                        <strong>{appointment.client_name ?? "Cliente sem nome"}</strong>
                        <span>
                          {appointment.procedure_name ?? appointment.category_name ?? "Procedimento não informado"} ·{" "}
                          {appointment.professional_name ?? "Profissional não informado"}
                        </span>
                        <span>
                          {formatShortDate(appointment.scheduled_date)} · {formatTime(appointment.start_time)} -{" "}
                          {formatTime(appointment.end_time)}
                        </span>
                        <span>
                          {appointment.client_phone ?? "Telefone não informado"} ·{" "}
                          {getAppointmentStatusLabel(appointment.status_code, appointment.status_name)}
                        </span>
                      </div>
                      <button className="secondary-button" onClick={() => setSelectedAppointment(appointment)} type="button">
                        Ver detalhes
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="agenda-search-results__empty">
                  <strong>Nenhum agendamento encontrado</strong>
                  <span>
                    {quickFilter !== "all"
                      ? "Nenhum resultado encontrado com o filtro atual."
                      : "Tente buscar por nome do cliente, telefone, serviço ou profissional."}
                  </span>
                </div>
              )}
            </section>
          ) : null}

          {hasActiveViewFilter && !hasVisibleItems ? <p className="agenda-empty-hint">{emptyViewMessage}</p> : null}
          {!hasActiveViewFilter && activeAppointments.length === 0 && scheduleBlocks.length === 0 ? (
            <p className="agenda-empty-hint">{emptyViewMessage}</p>
          ) : null}
        </>
      ) : null}

      {isLoading ? (
        <section className="agenda-state">Carregando agenda...</section>
      ) : professionals.length === 0 ? (
        <section className="agenda-state">Nenhum profissional cadastrado.</section>
      ) : (
        <>
          <AgendaMobileList
            appointments={visibleAppointments}
            onAppointmentClick={setSelectedAppointment}
            onEmptySlotClick={openCreateAppointmentFromSlot}
            professionals={visibleProfessionals}
            scheduleBlocks={visibleBlocks}
            showFreeSlots={!hasStatusOrSearchFilter}
            timeSlots={timeSlots}
          />
          <AgendaGrid
            appointments={visibleAppointments}
            currentTime={selectedDateIsToday ? getCurrentTimeLabel(now) : null}
            highlightedAppointmentIds={highlightedAppointmentIds}
            onAppointmentClick={setSelectedAppointment}
            onEmptySlotClick={openCreateAppointmentFromSlot}
            professionals={visibleProfessionals}
            scheduleBlocks={visibleBlocks}
            timeSlots={timeSlots}
          />
        </>
      )}

      {selectedSlot ? (
        <AppointmentCreateModal
          initialClient={prefilledClient}
          onClose={() => setSelectedSlot(null)}
          onCreated={() => {
            setPrefilledClient(null);
            setReloadKey((current) => current + 1);
          }}
          scheduleBlocks={scheduleBlocks}
          selectedDate={selectedDate}
          slot={selectedSlot}
        />
      ) : null}

      {blockModalMode ? (
        <ScheduleBlockModal
          currentUser={user}
          initialDate={selectedDate}
          mode={blockModalMode}
          onClose={() => setBlockModalMode(null)}
          onCreated={(message) => {
            setToastMessage(message);
            setReloadKey((current) => current + 1);
            window.setTimeout(() => setToastMessage(null), 3600);
          }}
          professionals={professionals}
        />
      ) : null}

      {selectedAppointment ? (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          currentUser={user}
          onChanged={(message) => {
            setToastMessage(message);
            setReloadKey((current) => current + 1);
            window.setTimeout(() => setToastMessage(null), 3600);
          }}
          onClose={() => setSelectedAppointment(null)}
        />
      ) : null}
    </main>
  );
}
