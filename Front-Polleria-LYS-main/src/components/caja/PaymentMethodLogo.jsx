import { Banknote, CreditCard } from "lucide-react";

function CashLogo({ size }) {
  return (
    <span className="caja-payment-logo caja-payment-logo--cash" aria-hidden="true">
      <Banknote size={size} strokeWidth={2.25} />
    </span>
  );
}

function VisaLogo() {
  return (
    <span className="caja-payment-logo caja-payment-logo--visa" aria-hidden="true">
      <CreditCard size={19} strokeWidth={2.2} />
      <span className="caja-visa-mark">VISA</span>
    </span>
  );
}

function DigitalLogo({ brand }) {
  const name = brand.toLowerCase();
  return (
    <span className={`caja-payment-logo caja-payment-logo--${name}`} aria-hidden="true">
      {brand === "Yape" ? <span className="caja-yape-mark">y</span> : <span className="caja-plin-mark">plin</span>}
    </span>
  );
}

export default function PaymentMethodLogo({ method, size = 19 }) {
  if (method === "Efectivo") return <CashLogo size={size} />;
  if (method === "Tarjeta") return <VisaLogo />;
  return <DigitalLogo brand={method} />;
}
