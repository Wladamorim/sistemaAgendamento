import { NEW_CATEGORY_ID } from "../../lib/services";
import type { ServiceCategory } from "../../types/service";

interface CategorySelectProps {
  categories: ServiceCategory[];
  newCategoryDescription: string;
  newCategoryName: string;
  selectedCategoryId: string;
  onNewCategoryDescriptionChange: (value: string) => void;
  onNewCategoryNameChange: (value: string) => void;
  onSelectedCategoryChange: (value: string) => void;
}

export function CategorySelect({
  categories,
  newCategoryDescription,
  newCategoryName,
  selectedCategoryId,
  onNewCategoryDescriptionChange,
  onNewCategoryNameChange,
  onSelectedCategoryChange,
}: CategorySelectProps) {
  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_ID;

  return (
    <section className="modal-section">
      <h3>Categoria</h3>

      <label className="field-label">
        Categoria do serviço
        <select onChange={(event) => onSelectedCategoryChange(event.target.value)} value={selectedCategoryId}>
          <option value="">Selecione uma categoria</option>
          <option value={NEW_CATEGORY_ID}>+ Criar nova categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      {isCreatingCategory ? (
        <div className="modal-form-grid modal-form-grid--two">
          <label className="field-label">
            Nome da nova categoria
            <input
              onChange={(event) => onNewCategoryNameChange(event.target.value)}
              type="text"
              value={newCategoryName}
            />
          </label>

          <label className="field-label">
            Descrição da categoria
            <input
              onChange={(event) => onNewCategoryDescriptionChange(event.target.value)}
              type="text"
              value={newCategoryDescription}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
