import { ChangeEvent, useEffect, useState } from "react";
import { maskPhone } from "../../lib/phone";
import { supabase } from "../../lib/supabase";
import type { Client } from "../../types/agenda";
import { SearchInput } from "../ui/SearchInput";

interface ClientSearchSelectProps {
  selectedClient: Client | null;
  onSelect: (client: Client) => void;
}

interface NewClientForm {
  full_name: string;
  phone: string;
  birth_date: string;
  notes: string;
  preferences: string;
  allergies: string;
  restrictions: string;
}

const emptyNewClientForm: NewClientForm = {
  full_name: "",
  phone: "",
  birth_date: "",
  notes: "",
  preferences: "",
  allergies: "",
  restrictions: "",
};

export function ClientSearchSelect({ selectedClient, onSelect }: ClientSearchSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [newClient, setNewClient] = useState(emptyNewClientForm);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const normalizedTerm = searchTerm.trim();

    if (normalizedTerm.length < 2) {
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
  }, [searchTerm]);

  function updateNewClient(field: keyof NewClientForm) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setNewClient((current) => ({
        ...current,
        [field]: field === "phone" ? maskPhone(event.target.value) : event.target.value,
      }));
    };
  }

  async function handleCreateClient() {
    if (!newClient.full_name.trim() || !newClient.phone.trim()) {
      setErrorMessage("Informe nome completo e telefone do cliente.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("clients")
      .insert({
        full_name: newClient.full_name.trim(),
        phone: newClient.phone.trim(),
        birth_date: newClient.birth_date || null,
        notes: newClient.notes.trim() || null,
        preferences: newClient.preferences.trim() || null,
        allergies: newClient.allergies.trim() || null,
        restrictions: newClient.restrictions.trim() || null,
      })
      .select("id, full_name, phone, birth_date, notes, allergies, preferences, restrictions")
      .single();

    if (error) {
      console.error("CREATE CLIENT ERROR:", error);
      setErrorMessage(error.message);
      setIsCreating(false);
      return;
    }

    const createdClient = data as Client;
    onSelect(createdClient);
    setNewClient(emptyNewClientForm);
    setSearchTerm(createdClient.full_name);
    setClients([]);
    setIsCreating(false);
  }

  return (
    <section className="modal-section">
      <h3>Cliente</h3>

      <SearchInput
        ariaLabel="Buscar por nome ou telefone"
        className="field-label"
        onChange={setSearchTerm}
        placeholder="Digite pelo menos 2 caracteres"
        value={searchTerm}
      />

      {selectedClient ? (
        <div className="selected-client">
          <strong>{selectedClient.full_name}</strong>
          <span>{selectedClient.phone ?? "Sem telefone"}</span>
        </div>
      ) : null}

      {isSearching ? <p className="muted-text">Buscando clientes...</p> : null}
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

      {clients.length > 0 ? (
        <div className="client-results">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => {
                onSelect(client);
                setSearchTerm(client.full_name);
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

      <div className="new-client-box">
        <h4>Cliente não cadastrado</h4>

        <div className="modal-form-grid">
          <label className="field-label">
            Nome completo
            <input onChange={updateNewClient("full_name")} type="text" value={newClient.full_name} />
          </label>

          <label className="field-label">
            Número de telefone
            <input onChange={updateNewClient("phone")} type="tel" value={newClient.phone} />
          </label>

          <label className="field-label">
            Data de nascimento
            <input onChange={updateNewClient("birth_date")} type="date" value={newClient.birth_date} />
          </label>
        </div>

        <label className="field-label">
          Observações
          <textarea onChange={updateNewClient("notes")} value={newClient.notes} />
        </label>

        <label className="field-label">
          Preferências
          <textarea onChange={updateNewClient("preferences")} value={newClient.preferences} />
        </label>

        <label className="field-label">
          Alergias
          <textarea onChange={updateNewClient("allergies")} value={newClient.allergies} />
        </label>

        <label className="field-label">
          Restrições
          <textarea onChange={updateNewClient("restrictions")} value={newClient.restrictions} />
        </label>

        <button className="secondary-action-button" disabled={isCreating} onClick={handleCreateClient} type="button">
          {isCreating ? "Criando..." : "Criar cliente"}
        </button>
      </div>
    </section>
  );
}
