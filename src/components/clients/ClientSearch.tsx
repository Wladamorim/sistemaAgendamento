import { SearchInput } from "../ui/SearchInput";

interface ClientSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function ClientSearch({ searchTerm, onSearchTermChange }: ClientSearchProps) {
  return (
    <SearchInput
      className="client-search"
      onChange={onSearchTermChange}
      placeholder="Buscar cliente por nome ou telefone"
      value={searchTerm}
    />
  );
}
