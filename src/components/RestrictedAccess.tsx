import { PageContainer } from "./layout/PageContainer";

export function RestrictedAccess() {
  return (
    <PageContainer className="restricted-page">
      <section className="restricted-card">
        <h1>Acesso restrito ao administrador.</h1>
      </section>
    </PageContainer>
  );
}
