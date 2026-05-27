import { SearchInput } from "../ui/SearchInput";

interface ServiceSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function ServiceSearch({ searchTerm, onSearchTermChange }: ServiceSearchProps) {
  return (
    <SearchInput
      className="client-search"
      onChange={onSearchTermChange}
      placeholder="Buscar serviço ou categoria"
      value={searchTerm}
    />
  );
}
