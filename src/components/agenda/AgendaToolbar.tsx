import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateForQuery, getRelativeDateLabel, parseDateInput } from "../../lib/agenda";
import { AppDatePicker } from "../ui/AppDatePicker";

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

const dateWeekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const shortMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatAgendaDateLabel(date: Date) {
  return `${dateWeekdays[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")} ${
    shortMonths[date.getMonth()]
  } ${date.getFullYear()}`;
}

function formatAgendaMobileDateLabel(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")} ${shortMonths[date.getMonth()]} ${date.getFullYear()}`;
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
  const relativeDateLabel = getRelativeDateLabel(date);

  return (
    <header className="agenda-toolbar">
      <div className="agenda-toolbar__title">
        <h1>Agenda</h1>
        <p>
          {userName} · {userRole}
        </p>
      </div>

      <div className="agenda-toolbar__actions">
        <div className="date-navigation date-navigation--compact" aria-label="Navegação de data">
          <button onClick={onPreviousDay} type="button">
            <ChevronLeft aria-hidden="true" />
            <span className="sr-only">Dia anterior</span>
          </button>
          <button className={relativeDateLabel === "Hoje" ? "is-current-day" : ""} onClick={onToday} type="button">
            Hoje
          </button>
          <AppDatePicker
            buttonClassName="selected-date selected-date-button agenda-date-button"
            className="agenda-date-picker-wrapper"
            onChange={(value) => onDateChange(parseDateInput(value))}
            renderValue={(selectedDate) => (
              <>
                <span className="agenda-date-button__desktop">{formatAgendaDateLabel(selectedDate)}</span>
                <span className="agenda-date-button__mobile">{formatAgendaMobileDateLabel(selectedDate)}</span>
              </>
            )}
            value={formatDateForQuery(date)}
          />
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
