import { useEffect, useMemo, useState } from "react";
import { ErrorScreen, Loading, NoInstance, SignIn } from "./Gate";
import type { CockpitData, StampKind, UiCurve, UiIntent } from "./lib/data";
import { useCockpit } from "./lib/useCockpit";

const STAMP_LABEL: Record<StampKind, string> = {
  pass: "Conforme",
  fail: "Anomalie",
  hold: "Hors périmètre",
  idle: "En file",
};

export function App() {
  const cockpit = useCockpit();

  if (cockpit.phase === "loading") return <Loading />;
  if (cockpit.phase === "signin") return <SignIn />;
  if (cockpit.phase === "no-instance")
    return (
      <NoInstance
        onCreate={cockpit.bootstrap}
        onSignOut={() => void cockpit.signOut()}
        userEmail={cockpit.userEmail}
      />
    );
  if (cockpit.phase === "error" || !cockpit.data)
    return (
      <ErrorScreen
        message={cockpit.error ?? "Données indisponibles."}
        onRetry={() => void cockpit.reload()}
      />
    );

  return <Cockpit data={cockpit.data} cockpit={cockpit} />;
}

function Cockpit({
  data,
  cockpit,
}: {
  data: CockpitData;
  cockpit: ReturnType<typeof useCockpit>;
}) {
  const [selectedId, setSelectedId] = useState<string>(data.intents[0]?.id ?? "");
  const [applying, setApplying] = useState(false);

  // Si la liste change (rechargement live), garder une sélection valide.
  useEffect(() => {
    if (!data.intents.some((i) => i.id === selectedId)) {
      setSelectedId(data.intents[0]?.id ?? "");
    }
  }, [data.intents, selectedId]);

  const selected = data.intents.find((i) => i.id === selectedId) ?? null;
  const tally = useMemo(
    () => ({
      pass: data.intents.filter((i) => i.stamp === "pass").length,
      fail: data.intents.filter((i) => i.stamp === "fail").length,
      hold: data.intents.filter((i) => i.stamp === "hold").length,
    }),
    [data.intents],
  );
  const passReady = data.intents.filter((i) => i.stamp === "pass" && !i.applied);

  const applyBatch = async () => {
    setApplying(true);
    try {
      await cockpit.applyBatch(passReady.map((i) => i.id));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          CHASSIS<span className="tick">_</span>
        </div>
        <div className="instance">
          <b>{data.instance.name}</b> · {data.instance.domain} ·{" "}
          {data.mode === "demo" ? "démo" : "réel"}
        </div>
        <div className="topbar-right">
          <div className="gauge" title="Fiabilité du harness, mesurée sur l'historique">
            <span>harness</span>
            <div className="gauge-track">
              <div
                className="gauge-fill"
                style={{ width: `${(data.instance.harnessReliability ?? 0) * 100}%` }}
              />
            </div>
            <span className="gauge-val">
              {data.instance.harnessReliability !== null
                ? `${(data.instance.harnessReliability * 100).toFixed(0)}%`
                : "à mesurer"}
            </span>
          </div>
          <div className="live">
            <span className="live-dot" />{" "}
            {data.mode === "demo" ? "mode démo" : "boucle active"}
          </div>
          {data.mode === "live" && (
            <button
              className="signout"
              title={cockpit.userEmail ?? undefined}
              onClick={() => void cockpit.signOut()}
            >
              Déconnexion
            </button>
          )}
        </div>
      </header>

      <main className="bento">
        <IntentQueue
          intents={data.intents}
          tally={tally}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onApplyBatch={() => void applyBatch()}
          batchCount={passReady.length}
          applying={applying}
        />
        <CurveCard curve={data.curve} kpis={data.kpis} />
        <VerdictCard intent={selected} />
        <MemoryCard tokens={data.tokens} />
        <AutonomyCard categories={data.categories} />
      </main>
    </div>
  );
}

function IntentQueue(props: {
  intents: UiIntent[];
  tally: { pass: number; fail: number; hold: number };
  selectedId: string;
  onSelect: (id: string) => void;
  onApplyBatch: () => void;
  batchCount: number;
  applying: boolean;
}) {
  return (
    <section className="card card-queue">
      <div className="card-head">
        <span className="card-title">File d'intentions</span>
        <span className="card-meta">{props.intents.length} dossiers</span>
      </div>
      <div className="queue-tally">
        <div className="tally pass">
          <div className="tally-n">{props.tally.pass}</div>
          <div className="tally-l">conformes</div>
        </div>
        <div className="tally fail">
          <div className="tally-n">{props.tally.fail}</div>
          <div className="tally-l">anomalies</div>
        </div>
        <div className="tally hold">
          <div className="tally-n">{props.tally.hold}</div>
          <div className="tally-l">hors périm.</div>
        </div>
      </div>
      <div className="queue-list">
        {props.intents.length === 0 && (
          <div className="empty">
            File vide — les intentions arrivent
            <br />
            par le daemon ou l'API.
          </div>
        )}
        {props.intents.map((i) => (
          <button
            key={i.id}
            className={`intent${i.id === props.selectedId ? " sel" : ""}`}
            onClick={() => props.onSelect(i.id)}
          >
            <span className="intent-id">{i.ref}</span>
            <span className="intent-body">
              <span className="intent-title">{i.title}</span>
              <span className="intent-cat">{i.category}</span>
            </span>
            <span className={`stamp ${i.stamp}`}>
              {i.applied ? "Envoyé" : STAMP_LABEL[i.stamp]}
            </span>
          </button>
        ))}
      </div>
      <button
        className="batch-btn"
        disabled={props.batchCount === 0 || props.applying}
        onClick={props.onApplyBatch}
      >
        {props.applying
          ? "Application…"
          : props.batchCount === 0
            ? "Aucun dossier en attente"
            : `Valider le lot conforme (${props.batchCount})`}
      </button>
    </section>
  );
}

function CurveCard({ curve, kpis }: { curve: UiCurve | null; kpis: CockpitData["kpis"] }) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">La courbe — succès au premier envoi</span>
        <span className="curve-legend">
          <span>
            <i style={{ background: "var(--pass)" }} /> avec mémoire
          </span>
          <span>
            <i style={{ background: "var(--faint)" }} /> sans mémoire
          </span>
        </span>
      </div>
      <div className="curve-wrap">
        {curve && curve.weeks.length > 1 ? (
          <CurveSvg curve={curve} />
        ) : (
          <div className="empty">
            à mesurer — la courbe apparaît
            <br />
            avec les premiers verdicts réels (≥ 2 semaines).
          </div>
        )}
      </div>
      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="kpi-v">{k.em ? <em>{k.v}</em> : k.v}</div>
            <div className="kpi-l">{k.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CurveSvg({ curve }: { curve: UiCurve }) {
  const W = 600;
  const H = 210;
  const PAD = { l: 36, r: 10, t: 14, b: 22 };
  const min = 0.5;
  const max = 1.0;
  const x = (i: number) => PAD.l + (i / (curve.weeks.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const path = (vals: number[]) =>
    vals
      .map((v, i) =>
        Number.isNaN(v) ? "" : `${i === 0 || Number.isNaN(vals[i - 1]) ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .filter(Boolean)
      .join(" ");
  const lastIdx = curve.withMemory.length - 1;
  const last = curve.withMemory[lastIdx];

  return (
    <svg className="curve-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="rgba(231,236,234,0.06)" />
          <text x={4} y={y(g) + 3} fontSize="9" fill="var(--faint)" fontFamily="var(--font-m)">
            {(g * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      <path
        d={path(curve.withoutMemory)}
        fill="none"
        stroke="var(--faint)"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      <path d={path(curve.withMemory)} fill="none" stroke="var(--pass)" strokeWidth="2" />
      {!Number.isNaN(last) && (
        <circle cx={x(lastIdx)} cy={y(last)} r="3.5" fill="var(--pass)" />
      )}
      {curve.weeks.map((w, i) =>
        i % 2 === 0 ? (
          <text
            key={w}
            x={x(i)}
            y={H - 6}
            fontSize="9"
            fill="var(--faint)"
            textAnchor="middle"
            fontFamily="var(--font-m)"
          >
            {w}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function VerdictCard({ intent }: { intent: UiIntent | null }) {
  if (!intent || intent.findings.length === 0) {
    return (
      <section className="card">
        <div className="card-head">
          <span className="card-title">Verdict du harness</span>
        </div>
        <div className="empty">
          {intent
            ? "En file — pas encore évalué.\nLe harness ne préjuge jamais."
            : "Sélectionnez un dossier."}
        </div>
      </section>
    );
  }
  const stampClass = intent.stamp === "idle" ? "hold" : intent.stamp;
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Verdict du harness</span>
        <span className="card-meta">{intent.findings.length} règles évaluées</span>
      </div>
      <div className="verdict-head">
        <div>
          <div className="verdict-title">{intent.title}</div>
          <div className="verdict-sub">
            {intent.ref} · {intent.category}
            {intent.applied ? " · envoyé" : ""}
          </div>
        </div>
        <span className={`big-stamp ${stampClass}`}>{STAMP_LABEL[intent.stamp]}</span>
      </div>
      <div className="findings">
        {intent.findings.map((f) => (
          <div className="finding" key={f.ruleId}>
            <span className={`finding-ok ${f.ok ? "y" : "n"}`}>{f.ok ? "✓" : "✕"}</span>
            <span className="finding-rule">{f.ruleId}</span>
            <span className="finding-detail">{f.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const TOKEN_LABEL = {
  fix: "Correctif validé",
  rej: "Rejet appris",
  conv: "Convention",
} as const;

function MemoryCard({ tokens }: { tokens: CockpitData["tokens"] }) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Mémoire validée</span>
        <span className="card-meta">entrée : verdicts uniquement</span>
      </div>
      <div className="mem-list">
        {tokens.length === 0 && (
          <div className="empty">
            Vide — la mémoire ne se remplit
            <br />
            que par verdicts et règlements réels.
          </div>
        )}
        {tokens.map((t) => (
          <div className="token" key={`${t.date}-${t.summary}`}>
            <div className="token-top">
              <span className={`token-kind ${t.kind}`}>{TOKEN_LABEL[t.kind]}</span>
              <span className="token-date">{t.date}</span>
            </div>
            <div className="token-sum">{t.summary}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AutonomyCard({ categories }: { categories: CockpitData["categories"] }) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Autonomie par catégorie</span>
        <span className="card-meta">le harness reste la porte</span>
      </div>
      <div className="cats">
        {categories.length === 0 && (
          <div className="empty">Aucune catégorie — créez-les à l'instanciation.</div>
        )}
        {categories.map((c) => {
          const eligible =
            c.mode === "copilot" && c.rate !== null && c.rate >= c.threshold;
          return (
            <div className="cat" key={c.name}>
              <div className="cat-top">
                <span className="cat-name">{c.name}</span>
                <span
                  className={`cat-mode ${c.mode === "auto" ? "auto" : eligible ? "eligible" : ""}`}
                >
                  {c.mode === "auto" ? "Auto" : c.mode === "copilot" ? "Copilote" : "Ombre"}
                </span>
              </div>
              <div className="cat-track">
                <div className="cat-fill" style={{ width: `${(c.rate ?? 0) * 100}%` }} />
              </div>
              <div className="cat-stats">
                <span>
                  {c.rate === null
                    ? "à mesurer"
                    : `${(c.rate * 100).toFixed(1)}% vérifié · ${c.weeks} sem.`}
                </span>
                <span>seuil {(c.threshold * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
