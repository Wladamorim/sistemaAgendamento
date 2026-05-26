interface AttendantSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function AttendantSearch({ searchTerm, onSearchTermChange }: AttendantSearchProps) {
  return (
    <label className="client-search">
      <span>Busca</span>
      <input
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Buscar por nome, e-mail, telefone ou perfil"
        type="search"
        value={searchTerm}
      />
    </label>
  );
}
