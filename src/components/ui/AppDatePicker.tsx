import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface AppDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  buttonClassName?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  maxDate?: string;
  minDate?: string;
  placeholder?: string;
  renderValue?: (date: Date) => ReactNode;
}

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayValue(date: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatMonthLabel(date: Date) {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`;
}

function getCalendarDays(viewDate: Date) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function isSameDay(left: Date, right: Date) {
  return formatDateValue(left) === formatDateValue(right);
}

export function AppDatePicker({
  value,
  onChange,
  allowClear = false,
  buttonClassName = "",
  className = "",
  disabled = false,
  label,
  maxDate,
  minDate,
  placeholder = "Selecione uma data",
  renderValue,
}: AppDatePickerProps) {
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const [popoverStyle, setPopoverStyle] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (isOpen) {
      setViewDate(selectedDate ?? new Date());
    }
  }, [isOpen, selectedDate]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function positionPopover() {
      const trigger = triggerRef.current;

      if (!trigger || window.innerWidth <= 640) {
        setPopoverStyle(null);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 32);
      const estimatedHeight = 408;
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
      const top =
        window.innerHeight - rect.bottom >= estimatedHeight
          ? rect.bottom + 8
          : Math.max(16, rect.top - estimatedHeight - 8);

      setPopoverStyle({ left, top, width });
    }

    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);

    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function isDateDisabled(date: Date) {
    const dateValue = formatDateValue(date);
    return Boolean((minDate && dateValue < minDate) || (maxDate && dateValue > maxDate));
  }

  function selectDate(date: Date) {
    if (isDateDisabled(date)) {
      return;
    }

    onChange(formatDateValue(date));
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function selectToday() {
    if (!isDateDisabled(today)) {
      selectDate(today);
    }
  }

  const popover = isOpen ? (
    <div
      className="app-date-picker__portal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setIsOpen(false);
        }
      }}
      role="presentation"
    >
      <div
        aria-label="Calendário"
        className={[
          "app-date-picker__popover",
          popoverStyle ? "app-date-picker__popover--positioned" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={popoverRef}
        role="dialog"
        style={
          popoverStyle
            ? {
                left: `${popoverStyle.left}px`,
                top: `${popoverStyle.top}px`,
                width: `${popoverStyle.width}px`,
              }
            : undefined
        }
      >
        <div className="app-date-picker__header">
          <button
            aria-label="Mês anterior"
            onClick={() =>
              setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
            }
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={19} />
          </button>
          <strong>{formatMonthLabel(viewDate)}</strong>
          <button
            aria-label="Próximo mês"
            onClick={() =>
              setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
            }
            type="button"
          >
            <ChevronRight aria-hidden="true" size={19} />
          </button>
        </div>

        <div aria-hidden="true" className="app-date-picker__weekdays">
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="app-date-picker__days">
          {calendarDays.map((date) => {
            const outsideMonth = date.getMonth() !== viewDate.getMonth();
            const selected = Boolean(selectedDate && isSameDay(date, selectedDate));
            const currentDay = isSameDay(date, today);
            const dateDisabled = isDateDisabled(date);

            return (
              <button
                aria-current={currentDay ? "date" : undefined}
                aria-label={new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(date)}
                className={[
                  outsideMonth ? "is-outside-month" : "",
                  selected ? "is-selected" : "",
                  currentDay ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={dateDisabled}
                key={formatDateValue(date)}
                onClick={() => selectDate(date)}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="app-date-picker__footer">
          {allowClear ? (
            <button
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              type="button"
            >
              Limpar
            </button>
          ) : (
            <span />
          )}
          <button disabled={isDateDisabled(today)} onClick={selectToday} type="button">
            Hoje
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={["app-date-picker", className].filter(Boolean).join(" ")}>
      {label ? <span className="app-date-picker__label">{label}</span> : null}
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={["app-date-picker__trigger", buttonClassName].filter(Boolean).join(" ")}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays aria-hidden="true" className="app-date-picker__trigger-icon" size={18} />
        <span className={selectedDate ? "" : "is-placeholder"}>
          {selectedDate ? (renderValue ? renderValue(selectedDate) : formatDisplayValue(selectedDate)) : placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="app-date-picker__chevron" size={17} />
      </button>
      {popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
