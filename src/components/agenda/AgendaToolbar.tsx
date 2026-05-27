import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, formatDateForQuery, getRelativeDateLabel } from "../../lib/agenda";

interface AgendaToolbarProps {
  canManageBlocks?: boolean;
  date: Date;
  userName: string;
  userRole: string;
  onDateChange: (date: Date) => void;
  onBlockTime?: () => void;
  onNextDay: () => void;
  onPreviousDay: () => void;
  onToday: () => void;
}

const shortWeekdays = ["D", "S", "T", "Q", "Q", "S", "S"];
const dateWeekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const shortMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameCalendarDay(left: Date, right: Date) {
  return formatDateForQuery(left) === formatDateForQuery(right);
}

function formatAgendaDateLabel(date: Date) {
  return `${dateWeekdays[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")} ${
    shortMonths[date.getMonth()]
  } ${date.getFullYear()}`;
}

function formatAgendaMobileDateLabel(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")} ${shortMonths[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCalendarMonthLabel(date: Date) {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`;
}

function getCalendarDays(viewDate: Date) {
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const calendarStart = new Date(firstDayOfMonth);
  calendarStart.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
}

export function AgendaToolbar({
  canManageBlocks = false,
  date,
  userName,
  userRole,
  onDateChange,
  onBlockTime,
  onNextDay,
  onPreviousDay,
  onToday,
}: AgendaToolbarProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(() => getStartOfDay(date));
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const relativeDateLabel = getRelativeDateLabel(date);
  const desktopDateLabel = formatAgendaDateLabel(date);
  const mobileDateLabel = formatAgendaMobileDateLabel(date);
  const calendarDays = useMemo(() => getCalendarDays(calendarViewDate), [calendarViewDate]);
  const today = useMemo(() => getStartOfDay(new Date()), []);

  useEffect(() => {
    if (!isCalendarOpen) {
      return;
    }

    setCalendarViewDate(getStartOfDay(date));
  }, [date, isCalendarOpen]);

  useEffect(() => {
    if (!isCalendarOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCalendarOpen]);

  function selectDate(nextDate: Date) {
    onDateChange(getStartOfDay(nextDate));
    setIsCalendarOpen(false);
  }

  function changeCalendarMonth(amount: number) {
    setCalendarViewDate((currentDate) => new Date(currentDate.getFullYear(), currentDate.getMonth() + amount, 1));
  }

  return (
    <header className="agenda-toolbar">
      <div className="agenda-toolbar__title">
        <h1>Agenda</h1>
        <p>
          {userName} · {userRole}
        </p>
      </div>

      <div className="agenda-toolbar__actions">
        <div className="date-navigation date-navigation--compact" ref={pickerRef} aria-label="Navegação de data">
          <button onClick={onPreviousDay} type="button">
            <ChevronLeft aria-hidden="true" />
            <span className="sr-only">Dia anterior</span>
          </button>
          <button className={relativeDateLabel === "Hoje" ? "is-current-day" : ""} onClick={onToday} type="button">
            Hoje
          </button>
          <div className="date-picker-wrapper agenda-date-picker-wrapper">
            <button
              aria-expanded={isCalendarOpen}
              className="selected-date selected-date-button agenda-date-button"
              onClick={() => setIsCalendarOpen((current) => !current)}
              title={formatDate(date)}
              type="button"
            >
              <span className="agenda-date-button__desktop">{desktopDateLabel}</span>
              <span className="agenda-date-button__mobile">{mobileDateLabel}</span>
            </button>

            {isCalendarOpen ? (
              <div className="date-picker-popover agenda-calendar-popover">
                <div className="agenda-calendar-popover__header">
                  <button aria-label="Mês anterior" onClick={() => changeCalendarMonth(-1)} type="button">
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <strong>{formatCalendarMonthLabel(calendarViewDate)}</strong>
                  <button aria-label="Próximo mês" onClick={() => changeCalendarMonth(1)} type="button">
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
                <div className="agenda-calendar-popover__weekdays" aria-hidden="true">
                  {shortWeekdays.map((weekday, index) => (
                    <span key={`${weekday}-${index}`}>{weekday}</span>
                  ))}
                </div>
                <div className="agenda-calendar-popover__days">
                  {calendarDays.map((calendarDay) => {
                    const isOutsideMonth = calendarDay.getMonth() !== calendarViewDate.getMonth();
                    const isSelected = isSameCalendarDay(calendarDay, date);
                    const isToday = isSameCalendarDay(calendarDay, today);

                    return (
                      <button
                        aria-current={isToday ? "date" : undefined}
                        aria-label={formatDate(calendarDay)}
                        className={[
                          isOutsideMonth ? "is-outside-month" : "",
                          isSelected ? "is-selected" : "",
                          isToday ? "is-today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={formatDateForQuery(calendarDay)}
                        onClick={() => selectDate(calendarDay)}
                        type="button"
                      >
                        {calendarDay.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button onClick={onNextDay} type="button">
            <ChevronRight aria-hidden="true" />
            <span className="sr-only">Próximo dia</span>
          </button>
        </div>

        {canManageBlocks ? (
          <div className="agenda-toolbar__admin-actions">
            <button className="secondary-button agenda-block-button" onClick={onBlockTime} type="button">
              Bloquear horário
            </button>
          </div>
        ) : null}

      </div>
    </header>
  );
}
