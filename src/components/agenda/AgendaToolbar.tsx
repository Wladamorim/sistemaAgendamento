import { useState } from "react";
import { formatDate, formatDateForQuery, getRelativeDateLabel, parseDateInput } from "../../lib/agenda";

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
  const relativeDateLabel = getRelativeDateLabel(date);

  function handleDateChange(value: string) {
    if (!value) {
      return;
    }

    onDateChange(parseDateInput(value));
    setIsCalendarOpen(false);
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
        {canManageBlocks ? (
          <div className="agenda-toolbar__admin-actions">
            <button className="secondary-button" onClick={onBlockTime} type="button">
              Bloquear horário
            </button>
          </div>
        ) : null}

        <div className="date-navigation" aria-label="Navegação de data">
          <button onClick={onPreviousDay} type="button">
            Ontem
          </button>
          <button onClick={onToday} type="button">
            Hoje
          </button>
          <button onClick={onNextDay} type="button">
            Amanhã
          </button>
        </div>

        <div className="date-picker-wrapper">
          <button
            aria-expanded={isCalendarOpen}
            className="selected-date selected-date-button"
            onClick={() => setIsCalendarOpen((current) => !current)}
            type="button"
          >
            <span>{formatDate(date)}</span>
            {relativeDateLabel ? <strong>{relativeDateLabel}</strong> : null}
          </button>

          {isCalendarOpen ? (
            <div className="date-picker-popover">
              <label className="field-label">
                Selecionar data
                <input
                  autoFocus
                  onChange={(event) => handleDateChange(event.target.value)}
                  type="date"
                  value={formatDateForQuery(date)}
                />
              </label>
            </div>
          ) : null}
        </div>

      </div>
    </header>
  );
}
