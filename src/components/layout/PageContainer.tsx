import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface PageContainerProps extends ComponentPropsWithoutRef<"main"> {
  children: ReactNode;
}

export function PageContainer({ children, className = "", ...props }: PageContainerProps) {
  return (
    <main className={["page-container", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </main>
  );
}
