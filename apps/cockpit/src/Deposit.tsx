/**
 * Dépôt d'un dossier depuis le cockpit — LA porte d'entrée visible du produit.
 * Démo : jugé instantanément dans le navigateur. Réel : mis en file,
 * le daemon le juge en quelques secondes.
 */

import { useState, type FormEvent } from "react";
import type { UiCategory } from "./lib/data";
import type { DepositInput } from "./lib/demoLoop";
import { useI18n } from "./lib/i18n";

export function DepositOverlay({
  categories,
  mode,
  onSubmit,
  onClose,
}: {
  categories: UiCategory[];
  mode: "demo" | "live";
  onSubmit: (input: DepositInput, categoryId: string, categoryLabel: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<DepositInput["kind"]>("dsn");
  const [client, setClient] = useState("");
  const [salaireBase, setSalaireBase] = useState("");
  const [primes, setPrimes] = useState("0");
  const [maintienFin, setMaintienFin] = useState("");
  const [subrogationFin, setSubrogationFin] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "busy" | "queued" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      const category = categories.find((c) => c.id === categoryId) ?? categories[0];
      await onSubmit(
        {
          kind,
          client: client.trim(),
          salaireBase: Number(salaireBase),
          primes: Number(primes || 0),
          ...(kind === "ij" ? { maintienFin, subrogationFin } : {}),
        },
        category?.id ?? "",
        category?.name ?? "",
      );
      if (mode === "live") {
        setState("queued"); // le daemon va juger — message explicite
      } else {
        onClose(); // démo : le verdict est déjà dans la file, sélectionné
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <span className="card-title">{t("deposit.heading")}</span>
          <button className="overlay-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {state === "queued" ? (
          <div className="deposit-queued">
            <p className="gate-ok">{t("deposit.liveQueued")}</p>
            <button className="batch-btn gate-btn" onClick={onClose}>
              {t("deposit.done")}
            </button>
          </div>
        ) : (
          <form className="gate-form" onSubmit={submit}>
            <div className="deposit-kinds">
              <button
                type="button"
                className={`deposit-kind${kind === "dsn" ? " on" : ""}`}
                onClick={() => setKind("dsn")}
              >
                {t("deposit.kindDsn")}
              </button>
              <button
                type="button"
                className={`deposit-kind${kind === "ij" ? " on" : ""}`}
                onClick={() => setKind("ij")}
              >
                {t("deposit.kindIj")}
              </button>
            </div>

            <input
              className="gate-input"
              required
              autoFocus
              placeholder={t("deposit.client")}
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
            <div className="deposit-row">
              <input
                className="gate-input"
                required
                type="number"
                min="0"
                placeholder={t("deposit.salary")}
                value={salaireBase}
                onChange={(e) => setSalaireBase(e.target.value)}
              />
              <input
                className="gate-input"
                type="number"
                min="0"
                placeholder={t("deposit.bonus")}
                value={primes}
                onChange={(e) => setPrimes(e.target.value)}
              />
            </div>
            {kind === "ij" && (
              <div className="deposit-row">
                <label className="deposit-date">
                  <span>{t("deposit.maintien")}</span>
                  <input
                    className="gate-input"
                    required
                    type="date"
                    value={maintienFin}
                    onChange={(e) => setMaintienFin(e.target.value)}
                  />
                </label>
                <label className="deposit-date">
                  <span>{t("deposit.subro")}</span>
                  <input
                    className="gate-input"
                    required
                    type="date"
                    value={subrogationFin}
                    onChange={(e) => setSubrogationFin(e.target.value)}
                  />
                </label>
              </div>
            )}
            {categories.length > 1 && (
              <select
                className="gate-input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button className="batch-btn gate-btn" disabled={state === "busy"}>
              {state === "busy" ? t("deposit.submitting") : t("deposit.submit")}
            </button>
            {state === "error" && <p className="gate-err">{error}</p>}
            <p className="deposit-note">
              {mode === "demo" ? t("deposit.noteDemo") : t("deposit.noteLive")}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
