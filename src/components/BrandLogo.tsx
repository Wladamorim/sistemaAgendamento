const brandIconSrc = "/brand/agendeaqui_logo_icone_w.png";
const brandNameSrc = "/brand/agendeaqui_nome.png";

interface BrandLogoProps {
  className?: string;
  subtitle?: string;
  variant?: "login" | "mobile" | "sidebar";
}

export function BrandLogo({ className = "", subtitle, variant = "sidebar" }: BrandLogoProps) {
  const classNames = ["brand-logo", `brand-logo--${variant}`, className].filter(Boolean).join(" ");

  if (variant === "login") {
    return (
      <div className={classNames}>
        <img alt="" aria-hidden="true" className="brand-logo__icon" draggable={false} src={brandIconSrc} />
        <img alt="AgendeAqui" className="brand-logo__wordmark" draggable={false} src={brandNameSrc} />
      </div>
    );
  }

  return (
    <div className={classNames}>
      <img alt="AgendeAqui" className="brand-logo__icon" draggable={false} src={brandIconSrc} />
      <span className="brand-logo__name">AgendeAqui</span>
      {subtitle ? <span className="brand-logo__subtitle">{subtitle}</span> : null}
    </div>
  );
}
