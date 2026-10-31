"use client";
import { useEffect, useId, useState } from "react";
import { DateTime } from "luxon";
import {
  Button,
  Modal,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  RadioButtonGroup,
  RadioButton,
  InlineNotification,
  InlineLoading,
} from "@carbon/react";
import { DeliveryTruck, ArrowRight } from "@carbon/icons-react";
import { useI18n } from "@/components/I18nProvider";
import { authHeaders } from "@/lib/authHeaders";
import { supabase } from "@/lib/supabaseClient";
import { deliveryAddress, deliveryError } from "@/lib/localDeliveryInput";
import styles from "./Delivery.module.css";
const empty = {
  recipient: "",
  phone: "",
  street: "",
  exterior: "",
  interior: "",
  neighborhood: "",
  postal_code: "",
  municipality: "",
  state: "Nuevo León",
  country: "MX",
  notes: "",
};
let draftOwner = null;
let openOwner = null;
export default function PaymentDelivery({
  items,
  onOnline,
  onlineLabel,
  disabled = false,
  className,
  compact = false,
  icon = ArrowRight,
}) {
  const uid = useId().replace(/:/g, ""),
    { t, locale } = useI18n(),
    [config, setConfig] = useState(null),
    [open, setOpen] = useState(false),
    [method, setMethod] = useState("stripe"),
    [address, setAddress] = useState(empty),
    [date, setDate] = useState(""),
    [quote, setQuote] = useState(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [user, setUser] = useState(null),
    [key, setKey] = useState(""),
    [review, setReview] = useState(false);
  useEffect(() => {
    fetch("/api/local-delivery")
      .then((r) => r.json())
      .then((d) => setConfig(d.config))
      .catch(() => setConfig(null));
  }, []);
  const enabled = config?.enabled && config?.paymentOnDeliveryEnabled;
  useEffect(() => {
    if (!enabled) return;
    try {
      const draft = JSON.parse(
        sessionStorage.getItem("jbu_local_delivery") || "null",
      );
      const ids = items
        .map((i) => i.id)
        .sort()
        .join(",");
      if (draftOwner && draftOwner !== uid) return;
      if (
        draft &&
        draft.ids === ids &&
        Date.now() - draft.ts < 30 * 60 * 1000
      ) {
        setAddress(draft.address || empty);
        setMethod(draft.method || "stripe");
        setKey(draft.key || crypto.randomUUID());
        setDate(
          draft.date ||
            DateTime.now().setZone(config.timezone).toISODate() ||
            "",
        );
        draftOwner = uid;
        openOwner = uid;
        setOpen(true);
        supabase.auth
          .getSession()
          .then((s) => setUser(s.data.session?.user || null));
      }
    } catch {}
  }, [enabled, JSON.stringify(items.map((i) => i.id))]);
  async function begin() {
    if (!enabled) {
      onOnline();
      return;
    }
    const session = await supabase.auth.getSession();
    setUser(session.data.session?.user || null);
    setDate(DateTime.now().setZone(config.timezone).toISODate() || "");
    setKey(crypto.randomUUID());
    try {
      const draft = JSON.parse(
        sessionStorage.getItem("jbu_local_delivery") || "null",
      );
      if (draft && Date.now() - draft.ts < 30 * 60 * 1000) {
        setAddress(draft.address || empty);
        setMethod(draft.method || "stripe");
        setKey(draft.key || crypto.randomUUID());
      }
    } catch {}
    openOwner = uid;
    setOpen(true);
  }
  useEffect(() => () => {
    if (draftOwner === uid) draftOwner = null;
    if (openOwner === uid) openOwner = null;
  }, [uid]);
  useEffect(() => {
    if (!open || method !== "payment_on_delivery" || !date) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/local-delivery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "QUOTE", items, address, date }),
        });
        const d = await r.json();
        if (active) {
          setQuote(r.ok ? d : null);
          setError(r.ok ? "" : d.error);
          let draft = null;
          try {
            draft = JSON.parse(
              sessionStorage.getItem("jbu_local_delivery") || "null",
            );
          } catch {}
          setSelected(
            r.ok && d.slots?.some((s) => s.start === draft?.start)
              ? draft.start
              : "",
          );
          setReview(false);
          if (r.ok && d.eligible && d.slots?.length === 0) {
            const next = DateTime.fromISO(date, { zone: config.timezone })
              .plus({ days: 1 })
              .toISODate();
            if (
              next &&
              DateTime.fromISO(next).diff(
                DateTime.now().setZone(config.timezone),
                "days",
              ).days < 31
            )
              setDate(next);
          }
        }
      } catch {
        if (active) setError("network_error");
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, method, address, date, JSON.stringify(items.map((i) => i.id))]);
  function login() {
    try {
      sessionStorage.setItem(
        "jbu_local_delivery",
        JSON.stringify({
          address,
          method,
          key,
          date,
          start: selected,
          ids: items
            .map((i) => i.id)
            .sort()
            .join(","),
          ts: Date.now(),
        }),
      );
    } catch {}
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?redirect=${encodeURIComponent(next)}`;
  }
  async function submit() {
    if (method === "stripe") {
      openOwner = null;
      setOpen(false);
      onOnline();
      return;
    }
    if (!user) {
      login();
      return;
    }
    try {
      deliveryAddress(address);
    } catch (e) {
      setError(e.message);
      return;
    }
    const slot = quote?.slots?.find((s) => s.start === selected);
    if (!slot) {
      setError("slot_unavailable");
      return;
    }
    if (!review) {
      setReview(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/local-delivery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          action: "CREATE",
          items,
          address,
          date,
          key,
          start: slot.start,
          end: slot.end,
          locale,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      sessionStorage.removeItem("jbu_local_delivery");
      window.location.href = `/orders/${d.id}`;
    } catch (e) {
      setError(e.message);
      setReview(false);
    } finally {
      setBusy(false);
    }
  }
  const field = (name, es, en, optional = false) => (
    <TextInput
      key={name}
      id={`delivery-${name}-${uid}`}
      labelText={t(es, en)}
      value={address[name]}
      maxLength={300}
      required={!optional}
      onChange={(e) => setAddress((a) => ({ ...a, [name]: e.target.value }))}
    />
  );
  return (
    <>
      <Button
        className={className}
        size={compact ? "sm" : "md"}
        renderIcon={icon}
        disabled={disabled}
        onClick={begin}
      >
        {onlineLabel || t("Proceder al pago", "Proceed to payment")}
      </Button>
      {enabled && (
        <p className={styles.note}>
          {t(
            "¿Estás en Monterrey? Regístrate gratis y paga al recibir tu obra.",
            "In Monterrey? Create your free account and pay when your artwork is delivered.",
          )}
        </p>
      )}
      <Modal
        open={open && (!openOwner || openOwner === uid)}
        modalHeading={t("Método de pago", "Payment method")}
        primaryButtonText={
          method === "stripe"
            ? t("Continuar a Stripe", "Continue to Stripe")
            : !user
              ? t("Iniciar sesión / Crear cuenta", "Sign in / Create account")
              : review
                ? t("Confirmar pedido", "Confirm order")
                : t("Revisar pedido", "Review order")
        }
        secondaryButtonText={t("Volver", "Back")}
        primaryButtonDisabled={
          busy ||
          (method === "payment_on_delivery" &&
            !!user &&
            (!quote?.eligible || !selected))
        }
        onRequestClose={() => { openOwner = null; setOpen(false); }}
        onRequestSubmit={submit}
        onSecondarySubmit={() => { if (review) { setReview(false); return; } openOwner = null; setOpen(false); }}
      >
        <div className={styles.stack}>
          <RadioButtonGroup
            legendText={t("Pago", "Payment")}
            name={`delivery-payment-${uid}`}
            valueSelected={method}
            onChange={(v) => {
              setMethod(v);
              setReview(false);
            }}
          >
            <RadioButton
              id={`online-payment-${uid}`}
              value="stripe"
              labelText={t("Pagar en línea · Stripe", "Pay online · Stripe")}
            />
            <RadioButton
              id={`offline-payment-${uid}`}
              value="payment_on_delivery"
              disabled={quote?.eligible === false}
              labelText={t("Pago contra entrega", "Pay on delivery")}
            />
          </RadioButtonGroup>
          {method === "payment_on_delivery" && (
            <>
              <p className={styles.note}>
                {t(
                  "Pago contra entrega disponible únicamente en el Área Metropolitana de Monterrey.",
                  "Payment on delivery is currently available only within the Monterrey Metropolitan Area.",
                )}
              </p>
              {!user && (
                <InlineNotification
                  lowContrast
                  kind="info"
                  hideCloseButton
                  title={t(
                    "Crea tu cuenta gratis para continuar.",
                    "Create your free account to continue.",
                  )}
                  subtitle={t(
                    "Tu cuenta te permitirá consultar tu pedido, recibir actualizaciones de entrega y acceder a tu certificado digital.",
                    "Your account lets you track your order, receive delivery updates and access your digital certificate.",
                  )}
                />
              )}
              <div className={styles.grid}>
                {field("recipient", "Destinatario", "Recipient")}
                {field("phone", "Teléfono", "Phone")}
                {field("street", "Calle", "Street")}
                {field("exterior", "Número exterior", "Exterior number")}
                {field(
                  "interior",
                  "Número interior (opcional)",
                  "Interior number (optional)",
                  true,
                )}
                {field("neighborhood", "Colonia", "Neighborhood")}
                {field("postal_code", "Código postal", "Postal code")}
                {field("municipality", "Municipio", "Municipality")}
                {field("state", "Estado", "State")}
              </div>
              <TextArea
                id={`delivery-notes-${uid}`}
                labelText={t(
                  "Referencias (opcional)",
                  "Delivery references (optional)",
                )}
                maxLength={1000}
                value={address.notes}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, notes: e.target.value }))
                }
              />
              {quote && !quote.eligible && (
                <p className={styles.note}>{deliveryError(quote.reason, t)}</p>
              )}
              {quote?.eligible && (
                <>
                  <h3 className={styles.heading}>
                    {t("Elige tu entrega", "Select your delivery")}
                  </h3>
                  <p className={styles.note}>
                    {quote.category === "large"
                      ? t(
                          "Esta obra requiere entrega especial. Puedes programarla a partir del día siguiente.",
                          "This artwork requires special delivery. You can schedule it starting the following day.",
                        )
                      : t(
                          `Anticipación mínima: ${config.standardLeadHours} horas.`,
                          `Minimum notice: ${config.standardLeadHours} hours.`,
                        )}
                  </p>
                </>
              )}
              <TextInput
                id={`delivery-date-${uid}`}
                type="date"
                labelText={t("Fecha de entrega", "Delivery date")}
                min={
                  DateTime.now()
                    .setZone(config?.timezone || "America/Monterrey")
                    .toISODate() || ""
                }
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              {quote?.eligible && (
                <Select
                  id={`delivery-slot-${uid}`}
                  labelText={t("Horario · Monterrey", "Time · Monterrey")}
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setReview(false);
                  }}
                >
                  <SelectItem
                    value=""
                    text={
                      quote.slots?.length
                        ? t("Selecciona horario", "Select a time")
                        : t(
                            "Sin horarios; elige otro día",
                            "No times available; choose another day",
                          )
                    }
                  />
                  {quote.slots?.map((s) => (
                    <SelectItem
                      key={s.start}
                      value={s.start}
                      text={`${s.startTime}–${s.endTime}`}
                    />
                  ))}
                </Select>
              )}
              {review && (
                <div className={styles.summary}>
                  {quote.artworks?.map((a) => (
                    <p key={a.id}>
                      {a.title} · {a.sku}
                    </p>
                  ))}
                  <p>
                    {address.recipient} · {address.street} {address.exterior} ·{" "}
                    {address.neighborhood} · {address.municipality}
                  </p>
                  <p>
                    {date} ·{" "}
                    {quote.slots.find((s) => s.start === selected)?.startTime}–
                    {quote.slots.find((s) => s.start === selected)?.endTime} ·{" "}
                    {config.timezone}
                  </p>
                  <strong>MXN ${quote.total.toLocaleString(locale)}</strong>
                  <p>
                    {t(
                      "Pagarás al recibir tu obra.",
                      "You’ll pay when your artwork is delivered.",
                    )}
                  </p>
                </div>
              )}
            </>
          )}
          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t("Revisa tu pedido", "Check your order")}
              subtitle={`${deliveryError(error, t)} (${error})`}
            />
          )}{" "}
          {busy && (
            <InlineLoading
              description={t("Confirmando pedido…", "Confirming order…")}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
