import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isAdmin } from "../components/AppShell";
import { SearchInput } from "../components/ui/SearchInput";
import {
  comboLinkedTypeLabels,
  comboPaymentOptions,
  comboStatusLabels,
  formatDateValue,
  getComboBalanceLabel,
  getComboLinkedLabel,
  getComboPaymentLabel,
  getComboPriceLabel,
  parseMoneyValue,
} from "../lib/combos";
import { formatCurrency, formatDateForQuery } from "../lib/agenda";
import { supabase } from "../lib/supabase";
import type {
  ClientComboEditFormValues,
  ClientComboFull,
  ClientComboFormValues,
  ComboTemplate,
  ComboTemplateFormValues,
  ComboUsageFull,
} from "../types/combo";
import type { ClientRecord } from "../types/client";
import type { ServiceCategory, ServiceRecord } from "../types/service";
import type { AppUser } from "../types/user";

interface CombosProps {
  user: AppUser;
}

type ComboTab = "templates" | "client-combos";
type ComboFilter = "all" | "active" | "inactive" | "expired" | "completed" | "cancelled" | "with_balance" | "without_balance";
type ComboSalePaymentItem = {
  id: string;
  amount: string;
  installments: string;
  method: string;
};

const comboFilters: { label: string; value: ComboFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
  { label: "Expirados", value: "expired" },
  { label: "Finalizados", value: "completed" },
  { label: "Cancelados", value: "cancelled" },
  { label: "Com saldo", value: "with_balance" },
  { label: "Sem saldo", value: "without_balance" },
];

const defaultTemplateForm: ComboTemplateFormValues = {
  category_id: "",
  description: "",
  is_active: true,
  linked_type: "procedure",
  name: "",
  notes: "",
  package_price: "",
  procedure_id: "",
  total_sessions: "",
  validity_days: "",
};

const defaultClientComboForm: ClientComboFormValues = {
  client_id: "",
  combo_template_id: "",
  notes: "",
  payment_installments: "",
  purchase_payment_method: "",
  start_date: formatDateForQuery(new Date()),
};

const defaultClientComboEditForm: ClientComboEditFormValues = {
  expiration_date: "",
  notes: "",
  total_sessions: "",
};

const comboSalePaymentOptions = comboPaymentOptions;
const comboMultiplePaymentItemOptions = comboPaymentOptions.filter((option) => option.value !== "multiplas");
const installmentOptions = Array.from({ length: 12 }, (_, index) => index + 1);

function createComboSalePaymentItem(): ComboSalePaymentItem {
  return {
    amount: "",
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    installments: "",
    method: "",
  };
}

function getSingle<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function templateToForm(template: ComboTemplate): ComboTemplateFormValues {
  return {
    category_id: template.category_id ?? "",
    description: template.description ?? "",
    is_active: template.is_active,
    linked_type: template.linked_type,
    name: template.name,
    notes: template.notes ?? "",
    package_price: String(template.package_price ?? ""),
    procedure_id: template.procedure_id ?? "",
    total_sessions: String(template.total_sessions),
    validity_days: String(template.validity_days),
  };
}

function getTemplateStatus(template: ComboTemplate) {
  return template.is_active ? "Ativo" : "Inativo";
}

function getClientComboStatus(combo: ClientComboFull) {
  return comboStatusLabels[combo.effective_status] ?? combo.effective_status;
}

function matchesClientComboFilter(combo: ClientComboFull, filter: ComboFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return combo.effective_status === "active";
  }

  if (filter === "expired") {
    return combo.effective_status === "expired";
  }

  if (filter === "with_balance") {
    return combo.remaining_sessions > 0 && combo.effective_status === "active";
  }

  if (filter === "without_balance") {
    return combo.remaining_sessions <= 0;
  }

  return combo.effective_status === filter;
}

function matchesTemplateFilter(template: ComboTemplate, filter: ComboFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return template.is_active;
  }

  if (filter === "inactive") {
    return !template.is_active;
  }

  return true;
}

function normalizeTemplate(rawTemplate: ComboTemplate): ComboTemplate {
  return {
    ...rawTemplate,
    procedure_categories: getSingle(rawTemplate.procedure_categories),
    procedures: getSingle(rawTemplate.procedures),
  };
}

export function Combos({ user }: CombosProps) {
  const [activeTab, setActiveTab] = useState<ComboTab>("templates");
  const [templates, setTemplates] = useState<ComboTemplate[]>([]);
  const [clientCombos, setClientCombos] = useState<ClientComboFull[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [procedures, setProcedures] = useState<ServiceRecord[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ComboTemplate | null>(null);
  const [selectedClientCombo, setSelectedClientCombo] = useState<ClientComboFull | null>(null);
  const [comboUsages, setComboUsages] = useState<ComboUsageFull[]>([]);
  const [templateForm, setTemplateForm] = useState<ComboTemplateFormValues>(defaultTemplateForm);
  const [clientComboForm, setClientComboForm] = useState<ClientComboFormValues>(defaultClientComboForm);
  const [comboSalePaymentItems, setComboSalePaymentItems] = useState<ComboSalePaymentItem[]>([]);
  const [clientComboEditForm, setClientComboEditForm] =
    useState<ClientComboEditFormValues>(defaultClientComboEditForm);
  const [editingTemplate, setEditingTemplate] = useState<ComboTemplate | null>(null);
  const [editingClientCombo, setEditingClientCombo] = useState<ClientComboFull | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showClientComboForm, setShowClientComboForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<ComboFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManageComboTemplates = isAdmin(user);
  const canLinkComboToClient = isAdmin(user) || user.role === "Atendente";
  const canCancelClientCombo = isAdmin(user);
  const canEditClientCombo = isAdmin(user);

  useEffect(() => {
    loadCombos();
  }, []);

  useEffect(() => {
    if (!selectedClientCombo) {
      setComboUsages([]);
      return;
    }

    let isMounted = true;
    const comboId = selectedClientCombo.id;

    async function loadUsages() {
      const { data, error } = await supabase
        .from("v_combo_usages_full")
        .select("*")
        .eq("client_combo_id", comboId)
        .order("used_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("COMBO USAGES ERROR:", error);
        setComboUsages([]);
        return;
      }

      setComboUsages((data ?? []) as ComboUsageFull[]);
    }

    loadUsages();

    return () => {
      isMounted = false;
    };
  }, [selectedClientCombo]);

  async function loadCombos() {
    setIsLoading(true);
    setErrorMessage(null);

    const [templatesResult, clientCombosResult, clientsResult, proceduresResult, categoriesResult] = await Promise.all([
      supabase
        .from("combo_templates")
        .select("*, procedures ( id, name, price, duration_minutes, category_id ), procedure_categories ( id, name )")
        .order("created_at", { ascending: false }),
      supabase
        .from("v_client_combos_full")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, full_name, phone, birth_date, notes, is_active, created_at, updated_at")
        .neq("is_active", false)
        .order("full_name"),
      supabase
        .from("procedures")
        .select("id, category_id, name, description, price, duration_minutes, requires_return, return_after_days, is_active, created_at, updated_at, procedure_categories ( id, name )")
        .neq("is_active", false)
        .order("name"),
      supabase.from("procedure_categories").select("id, name, description, is_active").neq("is_active", false).order("name"),
    ]);

    if (templatesResult.error || clientCombosResult.error || clientsResult.error || proceduresResult.error || categoriesResult.error) {
      const error =
        templatesResult.error ??
        clientCombosResult.error ??
        clientsResult.error ??
        proceduresResult.error ??
        categoriesResult.error;
      console.error("COMBOS LOAD ERROR:", error);
      setErrorMessage(
        "Não foi possível carregar Combos. Verifique se a migration 20260526000000_create_combos.sql foi aplicada no Supabase.",
      );
      setIsLoading(false);
      return;
    }

    setTemplates(((templatesResult.data ?? []) as ComboTemplate[]).map(normalizeTemplate));
    setClientCombos((clientCombosResult.data ?? []) as ClientComboFull[]);
    setClients((clientsResult.data ?? []) as ClientRecord[]);
    setProcedures((proceduresResult.data ?? []) as ServiceRecord[]);
    setCategories((categoriesResult.data ?? []) as ServiceCategory[]);
    setIsLoading(false);
  }

  function openNewTemplateForm() {
    if (!canManageComboTemplates) {
      setErrorMessage("Você não tem permissão para criar modelos de combo.");
      return;
    }

    setEditingTemplate(null);
    setTemplateForm(defaultTemplateForm);
    setShowTemplateForm(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function openEditTemplateForm(template: ComboTemplate) {
    if (!canManageComboTemplates) {
      setErrorMessage("Você não tem permissão para editar modelos de combo.");
      return;
    }

    setEditingTemplate(template);
    setTemplateForm(templateToForm(template));
    setShowTemplateForm(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function openClientComboForm(templateId = "") {
    if (!canLinkComboToClient) {
      setErrorMessage("Você não tem permissão para vincular combos a clientes.");
      return;
    }

    setClientComboForm({
      ...defaultClientComboForm,
      combo_template_id: templateId,
      start_date: formatDateForQuery(new Date()),
    });
    setComboSalePaymentItems([]);
    setShowClientComboForm(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function updateComboSalePaymentItem(itemId: string, updates: Partial<ComboSalePaymentItem>) {
    setComboSalePaymentItems((items) =>
      items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  }

  function removeComboSalePaymentItem(itemId: string) {
    setComboSalePaymentItems((items) => {
      const nextItems = items.filter((item) => item.id !== itemId);
      return nextItems.length > 0 ? nextItems : [createComboSalePaymentItem()];
    });
  }

  function openEditClientCombo(combo: ClientComboFull) {
    if (!canEditClientCombo) {
      setErrorMessage("Você não tem permissão para editar combos de clientes.");
      return;
    }

    setEditingClientCombo(combo);
    setClientComboEditForm({
      expiration_date: combo.expiration_date,
      notes: combo.notes ?? "",
      total_sessions: String(combo.total_sessions),
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSaveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageComboTemplates) {
      setErrorMessage("Você não tem permissão para criar modelos de combo.");
      return;
    }

    if (!templateForm.name.trim()) {
      setErrorMessage("Informe o nome do combo.");
      return;
    }

    const totalSessions = Number(templateForm.total_sessions);
    const validityDays = Number(templateForm.validity_days);
    const packagePrice = parseMoneyValue(templateForm.package_price);

    if (!totalSessions || totalSessions <= 0 || !validityDays || validityDays <= 0) {
      setErrorMessage("Informe sessoes e validade maiores que zero.");
      return;
    }

    if (templateForm.linked_type === "procedure" && !templateForm.procedure_id) {
      setErrorMessage("Selecione o serviço vinculado ao combo.");
      return;
    }

    if (templateForm.linked_type === "category" && !templateForm.category_id) {
      setErrorMessage("Selecione a categoria vinculada ao combo.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const payload = {
      category_id: templateForm.linked_type === "category" ? templateForm.category_id : null,
      description: templateForm.description.trim() || null,
      is_active: templateForm.is_active,
      linked_type: templateForm.linked_type,
      name: templateForm.name.trim(),
      notes: templateForm.notes.trim() || null,
      package_price: packagePrice,
      procedure_id: templateForm.linked_type === "procedure" ? templateForm.procedure_id : null,
      total_sessions: totalSessions,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      validity_days: validityDays,
    };

    const result = editingTemplate
      ? await supabase.from("combo_templates").update(payload).eq("id", editingTemplate.id)
      : await supabase.from("combo_templates").insert({ ...payload, created_by: user.id });

    if (result.error) {
      console.error("SAVE COMBO TEMPLATE ERROR:", result.error);
      setErrorMessage(result.error.message);
      setIsSaving(false);
      return;
    }

    setShowTemplateForm(false);
    setEditingTemplate(null);
    setIsSaving(false);
    setSuccessMessage(editingTemplate ? "Modelo de combo atualizado com sucesso." : "Modelo de combo criado com sucesso.");
    await loadCombos();
  }

  async function handleToggleTemplate(template: ComboTemplate) {
    if (!canManageComboTemplates) {
      setErrorMessage("Você não tem permissão para alterar modelos de combo.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from("combo_templates")
      .update({
        is_active: !template.is_active,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", template.id);

    if (error) {
      console.error("TOGGLE COMBO TEMPLATE ERROR:", error);
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setSuccessMessage(template.is_active ? "Modelo desativado com sucesso." : "Modelo ativado com sucesso.");
    await loadCombos();
  }

  async function handleSaveClientCombo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canLinkComboToClient) {
      setErrorMessage("Você não tem permissão para vincular combos a clientes.");
      return;
    }

    const selectedTemplate = templates.find((template) => template.id === clientComboForm.combo_template_id);

    if (!clientComboForm.client_id) {
      setErrorMessage("Selecione um cliente.");
      return;
    }

    if (!selectedTemplate) {
      setErrorMessage("Selecione um combo.");
      return;
    }

    if (!selectedTemplate.is_active) {
      setErrorMessage("Selecione um combo ativo.");
      return;
    }

    if (!clientComboForm.purchase_payment_method) {
      setErrorMessage("Selecione a forma de pagamento.");
      return;
    }

    const installments = Number(clientComboForm.payment_installments);

    if (
      clientComboForm.purchase_payment_method === "cartao_credito" &&
      (!installments || installments < 1 || installments > 12)
    ) {
      setErrorMessage("Informe as parcelas do cartão de crédito.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const packagePrice = parseMoneyValue(selectedTemplate.package_price);
    const receivedAmount = clientComboForm.purchase_payment_method === "cortesia" ? 0 : packagePrice;
    const paymentDetails: Record<string, unknown> = {
      amount: receivedAmount,
      combo_value: packagePrice,
      type: clientComboForm.purchase_payment_method,
    };
    let normalizedMultipleItems: Array<{ amount: number; installments?: number; method: string }> = [];

    if (clientComboForm.purchase_payment_method === "multiplas") {
      normalizedMultipleItems = comboSalePaymentItems
        .map((item) => ({
          amount: parseMoneyValue(item.amount),
          installments: item.method === "cartao_credito" ? Number(item.installments) : undefined,
          method: item.method,
        }))
        .filter((item) => item.method && item.amount > 0);

      if (normalizedMultipleItems.length < 2) {
        setErrorMessage("Informe pelo menos duas formas de pagamento.");
        setIsSaving(false);
        return;
      }

      const hasInvalidCreditInstallments = normalizedMultipleItems.some(
        (item) =>
          item.method === "cartao_credito" &&
          (!item.installments || item.installments < 1 || item.installments > 12),
      );

      if (hasInvalidCreditInstallments) {
        setErrorMessage("Informe as parcelas do cartão de crédito.");
        setIsSaving(false);
        return;
      }

      const paymentTotal = normalizedMultipleItems.reduce((sum, item) => sum + item.amount, 0);
      const difference = Number((packagePrice - paymentTotal).toFixed(2));

      if (Math.abs(difference) > 0.009) {
        setErrorMessage("A soma dos pagamentos precisa ser igual ao valor do combo.");
        setIsSaving(false);
        return;
      }

      paymentDetails.items = normalizedMultipleItems;
    }

    if (clientComboForm.purchase_payment_method === "cartao_credito") {
      paymentDetails.installments = installments;
    }

    const { error } = await supabase.rpc("create_client_combo_from_template", {
      p_client_id: clientComboForm.client_id,
      p_combo_template_id: selectedTemplate.id,
      p_created_by: user.id,
      p_notes: clientComboForm.notes.trim() || null,
      p_purchase_payment_details: paymentDetails,
      p_purchase_payment_installments:
        clientComboForm.purchase_payment_method === "cartao_credito"
          ? installments
          : null,
      p_purchase_payment_method: clientComboForm.purchase_payment_method,
      p_start_date: clientComboForm.start_date,
    });

    if (error) {
      console.error("SAVE CLIENT COMBO ERROR:", error);
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setShowClientComboForm(false);
    setIsSaving(false);
    setSuccessMessage("Combo vinculado ao cliente com sucesso.");
    await loadCombos();
  }

  async function handleUpdateClientCombo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditClientCombo) {
      setErrorMessage("Você não tem permissão para editar combos de clientes.");
      return;
    }

    if (!editingClientCombo) {
      return;
    }

    const totalSessions = Number(clientComboEditForm.total_sessions);

    if (!totalSessions || totalSessions < editingClientCombo.used_sessions) {
      setErrorMessage("O total de sessões não pode ser menor que as sessões já usadas.");
      return;
    }

    const remainingSessions = totalSessions - editingClientCombo.used_sessions;

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from("client_combos")
      .update({
        expiration_date: clientComboEditForm.expiration_date,
        notes: clientComboEditForm.notes.trim() || null,
        remaining_sessions: remainingSessions,
        status: remainingSessions === 0 ? "completed" : "active",
        total_sessions: totalSessions,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", editingClientCombo.id);

    if (error) {
      console.error("UPDATE CLIENT COMBO ERROR:", error);
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setEditingClientCombo(null);
    setIsSaving(false);
    setSuccessMessage("Combo do cliente atualizado com sucesso.");
    await loadCombos();
  }

  async function verifyAdminPassword(password: string) {
    if (!password.trim()) {
      setErrorMessage("Informe a senha do administrador.");
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error) {
      setErrorMessage("Senha incorreta.");
      return false;
    }

    return true;
  }

  async function handleCancelClientCombo(combo: ClientComboFull) {
    if (!canCancelClientCombo) {
      setErrorMessage("Você não tem permissão para cancelar combos.");
      return;
    }

    const reason = window.prompt("Informe o motivo do cancelamento do combo.");
    if (!reason?.trim()) {
      return;
    }

    const password = window.prompt("Confirme sua senha de administrador.");
    if (!password) {
      return;
    }

    const passwordIsValid = await verifyAdminPassword(password);

    if (!passwordIsValid) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from("client_combos")
      .update({
        cancellation_reason: reason.trim(),
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        status: "cancelled",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", combo.id);

    if (error) {
      console.error("CANCEL CLIENT COMBO ERROR:", error);
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setSuccessMessage("Combo do cliente cancelado com sucesso.");
    await loadCombos();
  }

  const filteredTemplates = useMemo(() => {
    const searchValue = normalizeSearch(searchTerm);

    return templates.filter((template) => {
      if (!canManageComboTemplates && !template.is_active) {
        return false;
      }

      const matchesFilter = matchesTemplateFilter(template, filter);
      const matchesSearch =
        !searchValue ||
        normalizeSearch(
          [
            template.name,
            template.description,
            getComboLinkedLabel(template),
            comboLinkedTypeLabels[template.linked_type],
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(searchValue);

      return matchesFilter && matchesSearch;
    });
  }, [canManageComboTemplates, filter, searchTerm, templates]);

  const filteredClientCombos = useMemo(() => {
    const searchValue = normalizeSearch(searchTerm);

    return clientCombos.filter((combo) => {
      const matchesFilter = matchesClientComboFilter(combo, filter);
      const matchesSearch =
        !searchValue ||
        normalizeSearch(
          [
            combo.name,
            combo.client_name,
            combo.client_phone,
            getComboLinkedLabel(combo),
            combo.purchase_payment_method,
            combo.effective_status,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(searchValue);

      return matchesFilter && matchesSearch;
    });
  }, [clientCombos, filter, searchTerm]);

  const selectedClientComboTemplate = useMemo(
    () => templates.find((template) => template.id === clientComboForm.combo_template_id) ?? null,
    [clientComboForm.combo_template_id, templates],
  );
  const comboSalePackagePrice = selectedClientComboTemplate
    ? parseMoneyValue(selectedClientComboTemplate.package_price)
    : 0;
  const comboSaleMultipleTotal = comboSalePaymentItems.reduce(
    (sum, item) => sum + parseMoneyValue(item.amount),
    0,
  );
  const comboSaleMultipleDifference = Number((comboSalePackagePrice - comboSaleMultipleTotal).toFixed(2));

  return (
    <main className="combos-page">
      <header className="movement-header combos-header">
        <div>
          <h1>Combos</h1>
          <p>Gerencie modelos, vendas e uso de combos dos clientes</p>
        </div>

        <div className="combos-header__actions">
          {canLinkComboToClient ? (
            <button className="secondary-button" onClick={() => openClientComboForm()} type="button">
              Vincular combo ao cliente
            </button>
          ) : null}
          {canManageComboTemplates ? (
            <button className="add-button" onClick={openNewTemplateForm} type="button">
              + Novo combo
            </button>
          ) : null}
        </div>
      </header>

      <section className="clients-toolbar--operational combos-toolbar">
        <div className="clients-toolbar-top">
          <SearchInput
            className="client-search"
            onChange={setSearchTerm}
            placeholder="Buscar combo, cliente ou serviço"
            value={searchTerm}
          />
        </div>

        <div className="combo-tab-list" role="tablist" aria-label="Areas de combos">
          <button
            className={activeTab === "templates" ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setActiveTab("templates")}
            type="button"
          >
            Modelos de combos
          </button>
          <button
            className={activeTab === "client-combos" ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setActiveTab("client-combos")}
            type="button"
          >
            Combos de clientes
          </button>
        </div>

        <div className="clients-filter-chips">
          {comboFilters.map((item) => (
            <button
              className={filter === item.value ? "filter-chip filter-chip--active" : "filter-chip"}
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}
      {successMessage ? <p className="agenda-success">{successMessage}</p> : null}

      {isLoading ? (
        <section className="movement-skeleton">
          {Array.from({ length: 4 }).map((_, index) => (
            <span key={index} />
          ))}
        </section>
      ) : activeTab === "templates" ? (
        <section className="clients-table-panel service-list-panel combo-list-panel">
          {filteredTemplates.length === 0 ? (
            <div className="clients-empty-state">
              <strong>Nenhum modelo de combo encontrado</strong>
              <span>
                {canManageComboTemplates
                  ? "Crie modelos para vender combos aos clientes."
                  : "Nenhum modelo ativo está disponível para venda no momento."}
              </span>
            </div>
          ) : (
            <div className="combo-list">
              <div className="combo-list__header" aria-hidden="true">
                <span>Combo</span>
                <span>Vinculo</span>
                <span>Sessoes/valor</span>
                <span>Situação</span>
                <span>Ações</span>
              </div>

              {filteredTemplates.map((template) => (
                <article className="combo-list-row" key={template.id}>
                  <button className="combo-list-row__name" onClick={() => setSelectedTemplate(template)} type="button">
                    <strong>{template.name}</strong>
                    <span>{template.description || "Sem descrição"}</span>
                  </button>
                  <div className="combo-list-row__meta">
                    <strong>{comboLinkedTypeLabels[template.linked_type]}</strong>
                    <span>{getComboLinkedLabel(template)}</span>
                  </div>
                  <div className="combo-list-row__meta">
                    <strong>
                      {template.total_sessions} sessoes Â· {getComboPriceLabel(template)}
                    </strong>
                    <span>Validade: {template.validity_days} dias</span>
                  </div>
                  <div className="combo-list-row__status">
                    <span className={template.is_active ? "status-pill status-pill--active" : "status-pill"}>
                      {getTemplateStatus(template)}
                    </span>
                  </div>
                  <div className="client-row-actions combo-list-row__actions">
                    <button className="table-action-button" onClick={() => setSelectedTemplate(template)} type="button">
                      Ver detalhes
                    </button>
                    {canLinkComboToClient && !canManageComboTemplates && template.is_active ? (
                      <button className="table-action-button" onClick={() => openClientComboForm(template.id)} type="button">
                        Vincular cliente
                      </button>
                    ) : null}
                    {canManageComboTemplates ? (
                      <details className="client-actions-menu">
                        <summary>Ações</summary>
                        <div className="client-actions-menu__content">
                          <button onClick={() => openEditTemplateForm(template)} type="button">
                            Editar
                          </button>
                          {template.is_active ? (
                            <button onClick={() => openClientComboForm(template.id)} type="button">
                              Vender a cliente
                            </button>
                          ) : null}
                          <button className="client-actions-menu__danger" onClick={() => handleToggleTemplate(template)} type="button">
                            {template.is_active ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </details>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="clients-table-panel service-list-panel combo-list-panel">
          {filteredClientCombos.length === 0 ? (
            <div className="clients-empty-state">
              <strong>Nenhum combo de cliente encontrado</strong>
              <span>Vincule um combo a um cliente para acompanhar saldo e uso.</span>
            </div>
          ) : (
            <div className="combo-list">
              <div className="combo-list__header" aria-hidden="true">
                <span>Cliente/combo</span>
                <span>Vinculo</span>
                <span>Saldo/validade</span>
                <span>Situação</span>
                <span>Ações</span>
              </div>

              {filteredClientCombos.map((combo) => (
                <article className="combo-list-row" key={combo.id}>
                  <button className="combo-list-row__name" onClick={() => setSelectedClientCombo(combo)} type="button">
                    <strong>{combo.client_name ?? "Cliente não informado"}</strong>
                    <span>{combo.name}</span>
                  </button>
                  <div className="combo-list-row__meta">
                    <strong>{comboLinkedTypeLabels[combo.linked_type]}</strong>
                    <span>{getComboLinkedLabel(combo)}</span>
                  </div>
                  <div className="combo-list-row__meta">
                    <strong>{getComboBalanceLabel(combo)}</strong>
                    <span>Valido ate {formatDateValue(combo.expiration_date)}</span>
                  </div>
                  <div className="combo-list-row__status">
                    <span
                      className={
                        combo.effective_status === "active"
                          ? "status-pill status-pill--active"
                          : "status-pill"
                      }
                    >
                      {getClientComboStatus(combo)}
                    </span>
                    <span className="client-table-secondary">{getComboPaymentLabel(combo.purchase_payment_method)}</span>
                  </div>
                  <div className="client-row-actions combo-list-row__actions">
                    <button className="table-action-button" onClick={() => setSelectedClientCombo(combo)} type="button">
                      Ver combo
                    </button>
                    <details className="client-actions-menu">
                      <summary>Ações</summary>
                      <div className="client-actions-menu__content">
                        <button onClick={() => setSelectedClientCombo(combo)} type="button">
                          Histórico de uso
                        </button>
                        {canEditClientCombo && combo.effective_status !== "cancelled" ? (
                          <button onClick={() => openEditClientCombo(combo)} type="button">
                            Editar combo
                          </button>
                        ) : null}
                        {canCancelClientCombo && combo.effective_status !== "cancelled" ? (
                          <button className="client-actions-menu__danger" onClick={() => handleCancelClientCombo(combo)} type="button">
                            Cancelar combo
                          </button>
                        ) : null}
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {canManageComboTemplates && showTemplateForm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowTemplateForm(false)}>
          <section className="appointment-modal combo-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="appointment-modal__header">
              <div>
                <h2>{editingTemplate ? "Editar modelo de combo" : "Novo modelo de combo"}</h2>
                <p>Configure sessoes, validade, valor e vinculo do combo.</p>
              </div>
              <button className="icon-button" onClick={() => setShowTemplateForm(false)} type="button">
                x
              </button>
            </div>

            <form className="modal-form-grid" onSubmit={handleSaveTemplate}>
              <label className="field-label">
                Nome do combo
                <input
                  onChange={(event) => setTemplateForm((form) => ({ ...form, name: event.target.value }))}
                  value={templateForm.name}
                />
              </label>
              <label className="field-label">
                Tipo de vinculo
                <select
                  onChange={(event) =>
                    setTemplateForm((form) => ({
                      ...form,
                      category_id: "",
                      linked_type: event.target.value as "procedure" | "category",
                      procedure_id: "",
                    }))
                  }
                  value={templateForm.linked_type}
                >
                  <option value="procedure">Serviço específico</option>
                  <option value="category">Categoria/area</option>
                </select>
              </label>
              {templateForm.linked_type === "procedure" ? (
                <label className="field-label">
                  Serviço
                  <select
                    onChange={(event) => setTemplateForm((form) => ({ ...form, procedure_id: event.target.value }))}
                    value={templateForm.procedure_id}
                  >
                    <option value="">Selecione</option>
                    {procedures.map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>
                        {procedure.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field-label">
                  Categoria
                  <select
                    onChange={(event) => setTemplateForm((form) => ({ ...form, category_id: event.target.value }))}
                    value={templateForm.category_id}
                  >
                    <option value="">Selecione</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field-label">
                Quantidade de sessoes
                <input
                  min="1"
                  onChange={(event) => setTemplateForm((form) => ({ ...form, total_sessions: event.target.value }))}
                  type="number"
                  value={templateForm.total_sessions}
                />
              </label>
              <label className="field-label">
                Validade em dias
                <input
                  min="1"
                  onChange={(event) => setTemplateForm((form) => ({ ...form, validity_days: event.target.value }))}
                  type="number"
                  value={templateForm.validity_days}
                />
              </label>
              <label className="field-label">
                Valor do combo
                <input
                  inputMode="decimal"
                  onChange={(event) => setTemplateForm((form) => ({ ...form, package_price: event.target.value }))}
                  placeholder="0,00"
                  value={templateForm.package_price}
                />
              </label>
              <label className="field-label modal-field-wide">
                Descrição
                <textarea
                  onChange={(event) => setTemplateForm((form) => ({ ...form, description: event.target.value }))}
                  value={templateForm.description}
                />
              </label>
              <label className="field-label modal-field-wide">
                Observações
                <textarea
                  onChange={(event) => setTemplateForm((form) => ({ ...form, notes: event.target.value }))}
                  value={templateForm.notes}
                />
              </label>
              <label className="checkbox-field modal-field-wide">
                <input
                  checked={templateForm.is_active}
                  onChange={(event) => setTemplateForm((form) => ({ ...form, is_active: event.target.checked }))}
                  type="checkbox"
                />
                Modelo ativo
              </label>
              <div className="modal-actions modal-field-wide">
                <button className="cancel-button" disabled={isSaving} onClick={() => setShowTemplateForm(false)} type="button">
                  Cancelar
                </button>
                <button className="save-button" disabled={isSaving} type="submit">
                  {isSaving ? "Salvando..." : "Salvar combo"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {canLinkComboToClient && showClientComboForm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowClientComboForm(false)}>
          <section className="appointment-modal combo-modal combo-modal--client-link" onMouseDown={(event) => event.stopPropagation()}>
            <div className="appointment-modal__header">
              <div>
                <h2>Vincular combo ao cliente</h2>
                <p>Registre a compra do combo e o saldo inicial de sessoes.</p>
              </div>
              <button className="icon-button" onClick={() => setShowClientComboForm(false)} type="button">
                x
              </button>
            </div>

            <form className="modal-form-grid" onSubmit={handleSaveClientCombo}>
              <label className="field-label">
                Cliente
                <select
                  onChange={(event) => setClientComboForm((form) => ({ ...form, client_id: event.target.value }))}
                  value={clientComboForm.client_id}
                >
                  <option value="">Selecione</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Modelo de combo
                <select
                  onChange={(event) => setClientComboForm((form) => ({ ...form, combo_template_id: event.target.value }))}
                  value={clientComboForm.combo_template_id}
                >
                  <option value="">Selecione</option>
                  {templates
                    .filter((template) => template.is_active)
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {formatCurrency(template.package_price)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Data de inicio
                <input
                  onChange={(event) => setClientComboForm((form) => ({ ...form, start_date: event.target.value }))}
                  type="date"
                  value={clientComboForm.start_date}
                />
              </label>
              <label className="field-label">
                Forma de pagamento
                <select
                  onChange={(event) => {
                    const nextMethod = event.target.value;

                    setClientComboForm((form) => ({
                      ...form,
                      payment_installments: "",
                      purchase_payment_method: nextMethod,
                    }));

                    setComboSalePaymentItems(
                      nextMethod === "multiplas" ? [createComboSalePaymentItem(), createComboSalePaymentItem()] : [],
                    );
                  }}
                  value={clientComboForm.purchase_payment_method}
                >
                  <option value="">Selecione</option>
                  {comboSalePaymentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {clientComboForm.purchase_payment_method === "cartao_credito" ? (
                <label className="field-label">
                  Parcelas
                  <select
                    onChange={(event) => setClientComboForm((form) => ({ ...form, payment_installments: event.target.value }))}
                    value={clientComboForm.payment_installments}
                  >
                    <option value="">Selecione</option>
                    {installmentOptions.map((installment) => (
                      <option key={installment} value={installment}>
                        {installment}x
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {clientComboForm.purchase_payment_method === "multiplas" ? (
                <div className="payment-split modal-field-wide">
                  <div className="payment-split__header">
                    <strong>Formas de pagamento</strong>
                    <span>Valor do combo: {formatCurrency(comboSalePackagePrice)}</span>
                  </div>

                  {comboSalePaymentItems.map((item) => (
                    <div className="payment-split__item" key={item.id}>
                      <label className="field-label">
                        Forma
                        <select
                          onChange={(event) =>
                            updateComboSalePaymentItem(item.id, {
                              installments: "",
                              method: event.target.value,
                            })
                          }
                          value={item.method}
                        >
                          <option value="">Selecione</option>
                          {comboMultiplePaymentItemOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Valor
                        <input
                          inputMode="decimal"
                          onChange={(event) => updateComboSalePaymentItem(item.id, { amount: event.target.value })}
                          placeholder="0,00"
                          value={item.amount}
                        />
                      </label>
                      {item.method === "cartao_credito" ? (
                        <label className="field-label">
                          Parcelas
                          <select
                            onChange={(event) =>
                              updateComboSalePaymentItem(item.id, { installments: event.target.value })
                            }
                            value={item.installments}
                          >
                            <option value="">Selecione</option>
                            {installmentOptions.map((installment) => (
                              <option key={installment} value={installment}>
                                {installment}x
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <button
                        className="ghost-button"
                        onClick={() => removeComboSalePaymentItem(item.id)}
                        type="button"
                      >
                        Remover
                      </button>
                    </div>
                  ))}

                  <button
                    className="secondary-button"
                    onClick={() => setComboSalePaymentItems((items) => [...items, createComboSalePaymentItem()])}
                    type="button"
                  >
                    Adicionar forma
                  </button>
                  <p className={comboSaleMultipleDifference === 0 ? "payment-diff payment-diff--ok" : "payment-diff"}>
                    {comboSaleMultipleDifference > 0
                      ? `Faltam ${formatCurrency(comboSaleMultipleDifference)}`
                      : comboSaleMultipleDifference < 0
                        ? `Valor excede em ${formatCurrency(Math.abs(comboSaleMultipleDifference))}`
                        : "Pagamento fechado corretamente."}
                  </p>
                </div>
              ) : null}
              <label className="field-label modal-field-wide">
                Observações
                <textarea
                  onChange={(event) => setClientComboForm((form) => ({ ...form, notes: event.target.value }))}
                  value={clientComboForm.notes}
                />
              </label>
              <div className="modal-actions modal-field-wide">
                <button className="cancel-button" disabled={isSaving} onClick={() => setShowClientComboForm(false)} type="button">
                  Cancelar
                </button>
                <button className="save-button" disabled={isSaving} type="submit">
                  {isSaving ? "Salvando..." : "Vincular combo"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {canEditClientCombo && editingClientCombo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingClientCombo(null)}>
          <section className="appointment-modal combo-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="appointment-modal__header">
              <div>
                <h2>Editar combo do cliente</h2>
                <p>{editingClientCombo.client_name ?? "Cliente não informado"} - {editingClientCombo.name}</p>
              </div>
              <button className="icon-button" onClick={() => setEditingClientCombo(null)} type="button">
                x
              </button>
            </div>

            <form className="modal-form-grid" onSubmit={handleUpdateClientCombo}>
              <label className="field-label">
                Total de sessoes
                <input
                  min={editingClientCombo.used_sessions}
                  onChange={(event) =>
                    setClientComboEditForm((form) => ({ ...form, total_sessions: event.target.value }))
                  }
                  type="number"
                  value={clientComboEditForm.total_sessions}
                />
              </label>
              <label className="field-label">
                Validade
                <input
                  onChange={(event) =>
                    setClientComboEditForm((form) => ({ ...form, expiration_date: event.target.value }))
                  }
                  type="date"
                  value={clientComboEditForm.expiration_date}
                />
              </label>
              <label className="field-label modal-field-wide">
                Observações
                <textarea
                  onChange={(event) => setClientComboEditForm((form) => ({ ...form, notes: event.target.value }))}
                  value={clientComboEditForm.notes}
                />
              </label>
              <div className="modal-actions modal-field-wide">
                <button className="cancel-button" disabled={isSaving} onClick={() => setEditingClientCombo(null)} type="button">
                  Cancelar
                </button>
                <button className="save-button" disabled={isSaving} type="submit">
                  {isSaving ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTemplate ? (
        <div className="client-drawer-backdrop" role="presentation" onMouseDown={() => setSelectedTemplate(null)}>
          <aside className="client-side-panel combo-side-panel" onMouseDown={(event) => event.stopPropagation()}>
            <header className="client-side-panel__header">
              <div>
                <span className={selectedTemplate.is_active ? "status-pill status-pill--active" : "status-pill"}>
                  {getTemplateStatus(selectedTemplate)}
                </span>
                <h2>{selectedTemplate.name}</h2>
                <p>{getComboLinkedLabel(selectedTemplate)}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedTemplate(null)} type="button">
                x
              </button>
            </header>
            {(canLinkComboToClient && selectedTemplate.is_active) || canManageComboTemplates ? (
              <div className="client-side-panel__actions">
                {canLinkComboToClient && selectedTemplate.is_active ? (
                  <button className="primary-button" onClick={() => openClientComboForm(selectedTemplate.id)} type="button">
                    Vincular cliente
                  </button>
                ) : null}
                {canManageComboTemplates ? (
                  <button className="secondary-button" onClick={() => openEditTemplateForm(selectedTemplate)} type="button">
                    Editar
                  </button>
                ) : null}
              </div>
            ) : null}
            <section className="client-drawer-section">
              <h3>Dados do modelo</h3>
              <dl className="client-detail-grid">
                <div>
                  <dt>Tipo</dt>
                  <dd>{comboLinkedTypeLabels[selectedTemplate.linked_type]}</dd>
                </div>
                <div>
                  <dt>Sessoes</dt>
                  <dd>{selectedTemplate.total_sessions}</dd>
                </div>
                <div>
                  <dt>Validade</dt>
                  <dd>{selectedTemplate.validity_days} dias</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>{getComboPriceLabel(selectedTemplate)}</dd>
                </div>
              </dl>
              <div className="client-notes-box">
                <span>Descrição</span>
                <p>{selectedTemplate.description || "Sem descrição cadastrada."}</p>
              </div>
              <div className="client-notes-box">
                <span>Observações</span>
                <p>{selectedTemplate.notes || "Sem observações cadastradas."}</p>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {selectedClientCombo ? (
        <div className="client-drawer-backdrop" role="presentation" onMouseDown={() => setSelectedClientCombo(null)}>
          <aside className="client-side-panel combo-side-panel" onMouseDown={(event) => event.stopPropagation()}>
            <header className="client-side-panel__header">
              <div>
                <span
                  className={
                    selectedClientCombo.effective_status === "active"
                      ? "status-pill status-pill--active"
                      : "status-pill"
                  }
                >
                  {getClientComboStatus(selectedClientCombo)}
                </span>
                <h2>{selectedClientCombo.name}</h2>
                <p>{selectedClientCombo.client_name ?? "Cliente não informado"}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedClientCombo(null)} type="button">
                x
              </button>
            </header>
            <section className="client-drawer-section">
              <h3>Resumo do combo</h3>
              <div className="client-summary-grid">
                <div>
                  <span>Sessoes restantes</span>
                  <strong>{selectedClientCombo.remaining_sessions}</strong>
                </div>
                <div>
                  <span>Sessoes usadas</span>
                  <strong>{selectedClientCombo.used_sessions}</strong>
                </div>
                <div>
                  <span>Validade</span>
                  <strong>{formatDateValue(selectedClientCombo.expiration_date)}</strong>
                </div>
                <div>
                  <span>Valor pago</span>
                  <strong>{getComboPriceLabel(selectedClientCombo)}</strong>
                </div>
              </div>
            </section>
            <section className="client-drawer-section">
              <h3>Dados da compra</h3>
              <dl className="client-detail-grid">
                <div>
                  <dt>Vinculo</dt>
                  <dd>{getComboLinkedLabel(selectedClientCombo)}</dd>
                </div>
                <div>
                  <dt>Forma de pagamento</dt>
                  <dd>{getComboPaymentLabel(selectedClientCombo.purchase_payment_method)}</dd>
                </div>
                <div>
                  <dt>Inicio</dt>
                  <dd>{formatDateValue(selectedClientCombo.start_date)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{getClientComboStatus(selectedClientCombo)}</dd>
                </div>
              </dl>
              <div className="client-notes-box">
                <span>Observações</span>
                <p>{selectedClientCombo.notes || "Sem observações cadastradas."}</p>
              </div>
            </section>
            <section className="client-drawer-section">
              <h3>Histórico de uso</h3>
              {comboUsages.length === 0 ? (
                <div className="client-panel-empty">Nenhuma sessão usada neste combo.</div>
              ) : (
                <ul className="client-history-list">
                  {comboUsages.map((usage) => (
                    <li className="client-history-item" key={usage.id}>
                      <div>
                        <strong>{usage.procedure_name ?? "Serviço não informado"}</strong>
                        <span>{usage.professional_name ?? "Profissional não informado"}</span>
                      </div>
                      <div>
                        <span>
                          {usage.used_at
                            ? new Intl.DateTimeFormat("pt-BR", {
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              }).format(new Date(usage.used_at))
                            : "Data não informada"}
                        </span>
                        <span>
                          {usage.sessions_used} sessão · Produção {formatCurrency(usage.production_value)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
