import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../../lib/agenda";
import { supabase } from "../../lib/supabase";
import type { Procedure, ProcedureCategory } from "../../types/agenda";

interface ProcedureSelectProps {
  emptyMessage?: string;
  errorMessage?: string | null;
  isLoading?: boolean;
  procedures?: Procedure[];
  selectedProcedure: Procedure | null;
  onSelect: (procedure: Procedure) => void;
}

function getCategory(procedure: Procedure) {
  const category = Array.isArray(procedure.procedure_categories)
    ? procedure.procedure_categories[0]
    : procedure.procedure_categories;

  return category as ProcedureCategory | null;
}

function getProcedureOptionLabel(procedure: Procedure) {
  const category = getCategory(procedure);

  return `${procedure.name} · ${category?.name ?? "Sem categoria"} · ${procedure.duration_minutes ?? 0} min · ${formatCurrency(procedure.price)}`;
}

export function ProcedureSelect({
  emptyMessage = "Nenhum serviço cadastrado.",
  errorMessage: externalErrorMessage,
  isLoading: externalIsLoading,
  procedures: externalProcedures,
  selectedProcedure,
  onSelect,
}: ProcedureSelectProps) {
  const [loadedProcedures, setLoadedProcedures] = useState<Procedure[]>([]);
  const [internalIsLoading, setInternalIsLoading] = useState(true);
  const [internalErrorMessage, setInternalErrorMessage] = useState<string | null>(null);
  const procedures = externalProcedures ?? loadedProcedures;
  const isLoading = externalIsLoading ?? internalIsLoading;
  const errorMessage = externalErrorMessage ?? internalErrorMessage;
  const selectedProcedureDescription = useMemo(() => {
    if (!selectedProcedure) {
      return null;
    }

    const category = getCategory(selectedProcedure);

    return `${category?.name ?? "Sem categoria"} · ${selectedProcedure.duration_minutes ?? 0} min · ${formatCurrency(selectedProcedure.price)}`;
  }, [selectedProcedure]);

  useEffect(() => {
    if (externalProcedures) {
      setInternalIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadProcedures() {
      setInternalIsLoading(true);
      setInternalErrorMessage(null);

      const { data, error } = await supabase
        .from("procedures")
        .select(
          `
          id,
          name,
          description,
          price,
          duration_minutes,
          category_id,
          is_active,
          procedure_categories (
            id,
            name
          )
        `,
        )
        .eq("is_active", true)
        .order("name");

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("PROCEDURES ERROR:", error);
        setInternalErrorMessage(error.message);
        setLoadedProcedures([]);
      } else {
        setLoadedProcedures((data ?? []) as Procedure[]);
      }

      setInternalIsLoading(false);
    }

    loadProcedures();

    return () => {
      isMounted = false;
    };
  }, [externalProcedures]);

  return (
    <section className="modal-section">
      <h3>Serviço</h3>

      {isLoading ? <p className="muted-text">Carregando serviços...</p> : null}
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
      {!isLoading && !errorMessage && procedures.length === 0 ? <p className="muted-text">{emptyMessage}</p> : null}

      <label className="field-label">
        Serviço
        <select
          disabled={isLoading || procedures.length === 0}
          onChange={(event) => {
            const procedure = procedures.find((item) => item.id === event.target.value);

            if (procedure) {
              onSelect(procedure);
            }
          }}
          value={selectedProcedure?.id ?? ""}
        >
          <option value="">{isLoading ? "Carregando serviços..." : "Selecione um serviço"}</option>
          {procedures.map((procedure) => (
            <option key={procedure.id} value={procedure.id}>
              {getProcedureOptionLabel(procedure)}
            </option>
          ))}
        </select>
      </label>

      {selectedProcedureDescription ? <p className="muted-text">{selectedProcedureDescription}</p> : null}
    </section>
  );
}
