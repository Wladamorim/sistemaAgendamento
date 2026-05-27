import { SearchInput } from "../ui/SearchInput";

interface AttendantSearchProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function AttendantSearch({ searchTerm, onSearchTermChange }: AttendantSearchProps) {
  return (
    <SearchInput
      className="client-search"
      onChange={onSearchTermChange}
      placeholder="Buscar atendente por nome ou e-mail"
      value={searchTerm}
    />
  );
}
