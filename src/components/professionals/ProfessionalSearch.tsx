interface ProfessionalSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function ProfessionalSearch({ searchTerm, onSearchTermChange }: ProfessionalSearchProps) {
  return (
    <label className="client-search">
      <span>Busca</span>
      <input
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Buscar profissional por nome, area, telefone ou e-mail"
        type="search"
        value={searchTerm}
      />
    </label>
  );
}
