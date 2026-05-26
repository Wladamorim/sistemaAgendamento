import { useState } from "react";

interface AddMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const options = [
  {
    label: "Cliente",
    message: "Cadastro de cliente será implementado na próxima etapa",
  },
  {
    label: "Profissional",
    message: "Cadastro de profissional será implementado na próxima etapa",
  },
  {
    label: "Serviço",
    message: "Cadastro de serviço será implementado na próxima etapa",
  },
];

export function AddMenu({ isOpen, onClose }: AddMenuProps) {
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="add-menu-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="add-menu-title"
        className="add-menu"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="add-menu__header">
          <h2 id="add-menu-title">Adicionar</h2>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="add-menu__options">
          {options.map((option) => (
            <button key={option.label} onClick={() => setMessage(option.message)} type="button">
              {option.label}
            </button>
          ))}
        </div>

        {message ? <p className="add-menu__message">{message}</p> : null}
      </section>
    </div>
  );
}
