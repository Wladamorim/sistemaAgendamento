import { SearchInput } from "../ui/SearchInput";

interface ProfessionalSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function ProfessionalSearch({ searchTerm, onSearchTermChange }: ProfessionalSearchProps) {
  return (
    <SearchInput
      className="client-search"
      onChange={onSearchTermChange}
      placeholder="Buscar profissional por nome, área, telefone ou e-mail"
      value={searchTerm}
    />
  );
}
