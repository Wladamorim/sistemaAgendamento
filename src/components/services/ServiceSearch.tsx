interface ServiceSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function ServiceSearch({ searchTerm, onSearchTermChange }: ServiceSearchProps) {
  return (
    <label className="client-search">
      <span>Busca</span>
      <input
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Buscar servico por nome, categoria ou profissional"
        type="search"
        value={searchTerm}
      />
    </label>
  );
}
