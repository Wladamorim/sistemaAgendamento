import { PageContainer } from "./layout/PageContainer";

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <PageContainer className="placeholder-page">
      <section className="placeholder-card">
        <h1>{title}</h1>
        <p>Esta área será implementada em uma próxima etapa.</p>
      </section>
    </PageContainer>
  );
}
