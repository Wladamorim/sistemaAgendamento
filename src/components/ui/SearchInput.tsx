import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface SearchInputProps {
  ariaLabel?: string;
  className?: string;
  mobilePlaceholder?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

function getIsMobile() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
}

export function SearchInput({
  ariaLabel = "Busca",
  className = "",
  mobilePlaceholder,
  onChange,
  placeholder,
  value,
}: SearchInputProps) {
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    if (!mobilePlaceholder || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const handleChange = () => setIsMobile(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mobilePlaceholder]);

  return (
    <label className={["search-input", className].filter(Boolean).join(" ")}>
      <span className="search-input__label">{ariaLabel}</span>
      <Search aria-hidden="true" className="search-input__icon" />
      <input
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        placeholder={isMobile && mobilePlaceholder ? mobilePlaceholder : placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}
