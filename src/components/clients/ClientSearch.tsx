interface ClientSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function ClientSearch({ searchTerm, onSearchTermChange }: ClientSearchProps) {
  return (
    <label className="client-search">
      <span>Busca</span>
      <input
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Buscar cliente por nome ou telefone"
        type="search"
        value={searchTerm}
      />
    </label>
  );
}
