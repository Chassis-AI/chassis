import { useEffect, useMemo, useState } from "react";
import { ErrorScreen, Loading, NoInstance, SignIn } from "./Gate";
import type { CockpitData, StampKind, UiCurve, UiIntent } from "./lib/data";
import { LangSwitcher, useI18n, type Translate } from "./lib/i18n";
import { useCockpit } from "./lib/useCockpit";

const stampLabel = (t: Translate, stamp: StampKind) => t(`stamp.${stamp}`);

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
        message={cockpit.error ?? "—"}
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
  const { t } = useI18n();
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
          {data.mode === "demo" ? t("mode.demo") : t("mode.live")}
        </div>
        <div className="topbar-right">
          <div className="gauge" title={t("curve.title")}>
            <span>{t("topbar.harness")}</span>
            <div className="gauge-track">
              <div
                className="gauge-fill"
                style={{ width: `${(data.instance.harnessReliability ?? 0) * 100}%` }}
              />
            </div>
            <span className="gauge-val">
              {data.instance.harnessReliability !== null
                ? `${(data.instance.harnessReliability * 100).toFixed(0)}%`
                : t("common.toMeasure")}
            </span>
          </div>
          <div className="live">
            <span className="live-dot" />{" "}
            {data.mode === "demo" ? t("topbar.demoLive") : t("topbar.loopActive")}
          </div>
          <LangSwitcher />
          {data.mode === "live" && (
            <button
              className="signout"
              title={cockpit.userEmail ?? undefined}
              onClick={() => void cockpit.signOut()}
            >
              {t("topbar.signout")}
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
  const { t } = useI18n();
  return (
    <section className="card card-queue">
      <div className="card-head">
        <span className="card-title">{t("queue.title")}</span>
        <span className="card-meta">{t("queue.count", { n: props.intents.length })}</span>
      </div>
      <div className="queue-tally">
        <div className="tally pass">
          <div className="tally-n">{props.tally.pass}</div>
          <div className="tally-l">{t("queue.pass")}</div>
        </div>
        <div className="tally fail">
          <div className="tally-n">{props.tally.fail}</div>
          <div className="tally-l">{t("queue.fail")}</div>
        </div>
        <div className="tally hold">
          <div className="tally-n">{props.tally.hold}</div>
          <div className="tally-l">{t("queue.hold")}</div>
        </div>
      </div>
      <div className="queue-list">
        {props.intents.length === 0 && <div className="empty">{t("queue.empty")}</div>}
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
              {i.applied ? t("stamp.sent") : stampLabel(t, i.stamp)}
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
          ? t("batch.applying")
          : props.batchCount === 0
            ? t("batch.none")
            : t("batch.apply", { n: props.batchCount })}
      </button>
    </section>
  );
}

function CurveCard({ curve, kpis }: { curve: UiCurve | null; kpis: CockpitData["kpis"] }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">{t("curve.title")}</span>
        <span className="curve-legend">
          <span>
            <i style={{ background: "var(--pass)" }} /> {t("curve.withMemory")}
          </span>
          <span>
            <i style={{ background: "var(--faint)" }} /> {t("curve.withoutMemory")}
          </span>
        </span>
      </div>
      <div className="curve-wrap">
        {curve && curve.weeks.length > 1 ? (
          <CurveSvg curve={curve} />
        ) : (
          <div className="empty">{t("curve.empty")}</div>
        )}
      </div>
      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="kpi-v">
              {k.v === null ? t("common.toMeasure") : k.em ? <em>{k.v}</em> : k.v}
            </div>
            <div className="kpi-l">{t(k.l)}</div>
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
        Number.isNaN(v)
          ? ""
          : `${i === 0 || Number.isNaN(vals[i - 1]) ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
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
      {!Number.isNaN(last) && <circle cx={x(lastIdx)} cy={y(last)} r="3.5" fill="var(--pass)" />}
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
  const { t } = useI18n();
  if (!intent || intent.findings.length === 0) {
    return (
      <section className="card">
        <div className="card-head">
          <span className="card-title">{t("verdict.title")}</span>
        </div>
        <div className="empty">{intent ? t("verdict.pending") : t("verdict.select")}</div>
      </section>
    );
  }
  const stampClass = intent.stamp === "idle" ? "hold" : intent.stamp;
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">{t("verdict.title")}</span>
        <span className="card-meta">{t("verdict.rules", { n: intent.findings.length })}</span>
      </div>
      <div className="verdict-head">
        <div>
          <div className="verdict-title">{intent.title}</div>
          <div className="verdict-sub">
            {intent.ref} · {intent.category}
            {intent.applied ? ` · ${t("verdict.sent")}` : ""}
          </div>
        </div>
        <span className={`big-stamp ${stampClass}`}>{stampLabel(t, intent.stamp)}</span>
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

function MemoryCard({ tokens }: { tokens: CockpitData["tokens"] }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">{t("memory.title")}</span>
        <span className="card-meta">{t("memory.meta")}</span>
      </div>
      <div className="mem-list">
        {tokens.length === 0 && <div className="empty">{t("memory.empty")}</div>}
        {tokens.map((tok) => (
          <div className="token" key={`${tok.date}-${tok.summary}`}>
            <div className="token-top">
              <span className={`token-kind ${tok.kind}`}>{t(`token.${tok.kind}`)}</span>
              <span className="token-date">{tok.date}</span>
            </div>
            <div className="token-sum">{tok.summary}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AutonomyCard({ categories }: { categories: CockpitData["categories"] }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">{t("autonomy.title")}</span>
        <span className="card-meta">{t("autonomy.meta")}</span>
      </div>
      <div className="cats">
        {categories.length === 0 && <div className="empty">{t("autonomy.empty")}</div>}
        {categories.map((c) => {
          const eligible = c.mode === "copilot" && c.rate !== null && c.rate >= c.threshold;
          return (
            <div className="cat" key={c.name}>
              <div className="cat-top">
                <span className="cat-name">{c.name}</span>
                <span
                  className={`cat-mode ${c.mode === "auto" ? "auto" : eligible ? "eligible" : ""}`}
                >
                  {t(`autonomy.${c.mode}`)}
                </span>
              </div>
              <div className="cat-track">
                <div className="cat-fill" style={{ width: `${(c.rate ?? 0) * 100}%` }} />
              </div>
              <div className="cat-stats">
                <span>
                  {c.rate === null
                    ? t("common.toMeasure")
                    : t("autonomy.stats", {
                        rate: (c.rate * 100).toFixed(1),
                        weeks: c.weeks,
                      })}
                </span>
                <span>{t("autonomy.threshold", { t: (c.threshold * 100).toFixed(0) })}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
