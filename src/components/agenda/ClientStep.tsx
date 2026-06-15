import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { maskPhone } from "../../lib/phone";
import { supabase } from "../../lib/supabase";
import type { Client } from "../../types/agenda";
import { AppDatePicker } from "../ui/AppDatePicker";
import { SearchInput } from "../ui/SearchInput";

export type ClientMode = "existing" | "new" | null;

export interface NewClientDraft {
  full_name: string;
  phone: string;
  birth_date: string;
  notes: string;
}

interface ClientStepProps {
  mode: ClientMode;
  newClient: NewClientDraft;
  selectedClient: Client | null;
  onModeChange: (mode: ClientMode) => void;
  onNewClientChange: (client: NewClientDraft) => void;
  onSelectClient: (client: Client | null) => void;
}

export const emptyNewClientDraft: NewClientDraft = {
  full_name: "",
  phone: "",
  birth_date: "",
  notes: "",
};

export function ClientStep({
  mode,
  newClient,
  selectedClient,
  onModeChange,
  onNewClientChange,
  onSelectClient,
}: ClientStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const normalizedTerm = searchTerm.trim();

    if (mode !== "existing" || normalizedTerm.length < 2) {
      setClients([]);
      setIsSearching(false);
      return;
    }

    async function searchClients() {
      setIsSearching(true);
      setErrorMessage(null);

      const safeTerm = normalizedTerm.replace(/[%_]/g, "\\$&");
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone, birth_date, notes, allergies, preferences, restrictions")
        .or(`full_name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`)
        .order("full_name", { ascending: true })
        .limit(8);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("CLIENTS ERROR:", error);
        setErrorMessage(error.message);
        setClients([]);
      } else {
        setClients((data ?? []) as Client[]);
      }

      setIsSearching(false);
    }

    const timeoutId = window.setTimeout(searchClients, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [mode, searchTerm]);

  function updateNewClient(field: keyof NewClientDraft) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onNewClientChange({
        ...newClient,
        [field]: field === "phone" ? maskPhone(event.target.value) : event.target.value,
      });
    };
  }

  function selectMode(nextMode: ClientMode) {
    onModeChange(nextMode);
    setErrorMessage(null);

    if (nextMode === "existing") {
      onNewClientChange(emptyNewClientDraft);
    } else {
      onSelectClient(null);
      setSearchTerm("");
      setClients([]);
    }
  }

  const filteredClients = useMemo(() => {
    const uniqueClients = new Map<string, Client>();

    clients.forEach((client) => {
      if (client.id && client.id !== selectedClient?.id) {
        uniqueClients.set(client.id, client);
      }
    });

    return [...uniqueClients.values()];
  }, [clients, selectedClient?.id]);

  return (
    <section className="modal-section">
      <h3>Cliente já cadastrado?</h3>

      <div className="segmented-choice">
        <button
          className={
            mode === "existing" ? "segmented-choice__button segmented-choice__button--active" : "segmented-choice__button"
          }
          onClick={() => selectMode("existing")}
          type="button"
        >
          Sim, buscar cliente
        </button>
        <button
          className={mode === "new" ? "segmented-choice__button segmented-choice__button--active" : "segmented-choice__button"}
          onClick={() => selectMode("new")}
          type="button"
        >
          Não, cadastrar novo cliente
        </button>
      </div>

      {mode === "existing" ? (
        <div className="client-step-panel">
          <h4>Buscar cliente</h4>
          <SearchInput
            ariaLabel="Nome ou telefone"
            className="field-label"
            onChange={setSearchTerm}
            placeholder="Digite nome ou telefone"
            value={searchTerm}
          />

          {selectedClient ? (
            <div className="selected-client">
              <div>
                <span>Cliente selecionado</span>
                <strong>{selectedClient.full_name}</strong>
                <small>{selectedClient.phone ?? "Sem telefone"}</small>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  onSelectClient(null);
                  setSearchTerm("");
                  setClients([]);
                }}
                type="button"
              >
                Trocar cliente
              </button>
            </div>
          ) : null}

          {isSearching ? <p className="muted-text">Buscando clientes...</p> : null}
          {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

          {filteredClients.length > 0 ? (
            <div className="client-results">
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    onSelectClient(client);
                    setSearchTerm("");
                    setClients([]);
                  }}
                  type="button"
                >
                  <strong>{client.full_name}</strong>
                  <span>{client.phone ?? "Sem telefone"}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "new" ? (
        <div className="client-step-panel">
          <h4>Cadastrar novo cliente</h4>

          <div className="modal-form-grid">
            <label className="field-label">
              Nome completo
              <input onChange={updateNewClient("full_name")} type="text" value={newClient.full_name} />
            </label>

            <label className="field-label">
              Número de telefone
              <input onChange={updateNewClient("phone")} type="tel" value={newClient.phone} />
            </label>

            <AppDatePicker
              allowClear
              className="field-label"
              label="Data de nascimento"
              maxDate={new Date().toISOString().slice(0, 10)}
              onChange={(value) => onNewClientChange({ ...newClient, birth_date: value })}
              value={newClient.birth_date}
            />
          </div>

          <label className="field-label">
            Observações adicionais
            <textarea onChange={updateNewClient("notes")} value={newClient.notes} />
          </label>
        </div>
      ) : null}
    </section>
  );
}
