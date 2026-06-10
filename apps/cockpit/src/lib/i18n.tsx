/**
 * i18n du cockpit — fr / en / es / zh.
 *
 * L'interface est traduite ; les DONNÉES (intitulés de dossiers, catégories,
 * résumés mémoire) restent dans la langue de l'instance — ce sont des données
 * métier, pas de la chrome. Détection : ?lang → localStorage → navigateur.
 * Ajouter une langue = ajouter un dictionnaire ici.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Lang = "fr" | "en" | "es" | "zh";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "zh", label: "中文" },
];

const STORAGE_KEY = "chassis.lang";

type Dict = Record<string, string>;

const fr: Dict = {
  "stamp.pass": "Conforme",
  "stamp.fail": "Anomalie",
  "stamp.hold": "Hors périmètre",
  "stamp.idle": "En file",
  "stamp.sent": "Envoyé",
  "mode.demo": "démo",
  "mode.live": "réel",
  "topbar.harness": "harness",
  "topbar.demoLive": "mode démo",
  "topbar.loopActive": "boucle active",
  "topbar.signout": "Déconnexion",
  "common.toMeasure": "à mesurer",
  "queue.title": "File d'intentions",
  "queue.count": "{n} dossiers",
  "queue.pass": "conformes",
  "queue.fail": "anomalies",
  "queue.hold": "hors périm.",
  "queue.empty": "File vide — les intentions arrivent\npar le daemon ou l'API.",
  "batch.applying": "Application…",
  "batch.none": "Aucun dossier en attente",
  "batch.apply": "Valider le lot conforme ({n})",
  "curve.title": "La courbe — succès au premier envoi",
  "curve.withMemory": "avec mémoire",
  "curve.withoutMemory": "sans mémoire",
  "curve.empty": "à mesurer — la courbe apparaît\navec les premiers verdicts réels (≥ 2 semaines).",
  "kpi.firstPassLast": "succès 1er envoi (dernière sem.)",
  "kpi.unitsMonth": "unités validées ce mois",
  "kpi.rejAvoided": "rejets évités (mémoire)",
  "kpi.tokens": "jetons actifs",
  "kpi.passed30d": "verdicts conformes (30 j)",
  "kpi.queued": "dossiers en file",
  "verdict.title": "Verdict du harness",
  "verdict.rules": "{n} règles évaluées",
  "verdict.pending": "En file — pas encore évalué.\nLe harness ne préjuge jamais.",
  "verdict.select": "Sélectionnez un dossier.",
  "verdict.sent": "envoyé",
  "memory.title": "Mémoire validée",
  "memory.meta": "entrée : verdicts uniquement",
  "memory.empty": "Vide — la mémoire ne se remplit\nque par verdicts et règlements réels.",
  "token.fix": "Correctif validé",
  "token.rej": "Rejet appris",
  "token.conv": "Convention",
  "autonomy.title": "Autonomie par catégorie",
  "autonomy.meta": "le harness reste la porte",
  "autonomy.empty": "Aucune catégorie — créez-les à l'instanciation.",
  "autonomy.auto": "Auto",
  "autonomy.copilot": "Copilote",
  "autonomy.shadow": "Ombre",
  "autonomy.stats": "{rate}% vérifié · {weeks} sem.",
  "autonomy.threshold": "seuil {t}%",
  "gate.loading": "Chargement…",
  "gate.errorTitle": "Erreur de chargement",
  "gate.retry": "Réessayer",
  "gate.signinSub": "Connexion par lien magique — saisissez votre email, ouvrez le lien reçu.",
  "gate.sent": "Lien envoyé à {email}. Ouvrez-le sur cet appareil.",
  "gate.emailPlaceholder": "vous@cabinet.fr",
  "gate.sending": "Envoi…",
  "gate.receiveLink": "Recevoir le lien",
  "gate.connected": "Connecté",
  "gate.noInstance": "aucune instance. Instanciez votre vertical : nom + domaine métier.",
  "gate.namePlaceholder": "Nom de l'instance (ex. Cabinet Méridien)",
  "gate.domainPlaceholder": "Domaine (ex. Pôle social — Paie & déclaratif)",
  "gate.creating": "Création…",
  "gate.createInstance": "Créer l'instance",
  "gate.signoutLink": "Se déconnecter",
};

const en: Dict = {
  "stamp.pass": "Compliant",
  "stamp.fail": "Anomaly",
  "stamp.hold": "Out of scope",
  "stamp.idle": "Queued",
  "stamp.sent": "Sent",
  "mode.demo": "demo",
  "mode.live": "live",
  "topbar.harness": "harness",
  "topbar.demoLive": "demo mode",
  "topbar.loopActive": "loop active",
  "topbar.signout": "Sign out",
  "common.toMeasure": "to measure",
  "queue.title": "Intent queue",
  "queue.count": "{n} cases",
  "queue.pass": "compliant",
  "queue.fail": "anomalies",
  "queue.hold": "out of scope",
  "queue.empty": "Queue empty — intentions arrive\nvia the daemon or the API.",
  "batch.applying": "Applying…",
  "batch.none": "No cases waiting",
  "batch.apply": "Approve compliant batch ({n})",
  "curve.title": "The curve — first-pass success",
  "curve.withMemory": "with memory",
  "curve.withoutMemory": "without memory",
  "curve.empty": "to measure — the curve appears\nwith the first real verdicts (≥ 2 weeks).",
  "kpi.firstPassLast": "first-pass success (last week)",
  "kpi.unitsMonth": "units validated this month",
  "kpi.rejAvoided": "rejections avoided (memory)",
  "kpi.tokens": "active tokens",
  "kpi.passed30d": "compliant verdicts (30 d)",
  "kpi.queued": "cases in queue",
  "verdict.title": "Harness verdict",
  "verdict.rules": "{n} rules evaluated",
  "verdict.pending": "Queued — not yet evaluated.\nThe harness never prejudges.",
  "verdict.select": "Select a case.",
  "verdict.sent": "sent",
  "memory.title": "Validated memory",
  "memory.meta": "entry: verdicts only",
  "memory.empty": "Empty — memory only fills\nthrough real verdicts and settlements.",
  "token.fix": "Validated fix",
  "token.rej": "Learned rejection",
  "token.conv": "Convention",
  "autonomy.title": "Autonomy by category",
  "autonomy.meta": "the harness remains the gate",
  "autonomy.empty": "No categories — create them at instantiation.",
  "autonomy.auto": "Auto",
  "autonomy.copilot": "Copilot",
  "autonomy.shadow": "Shadow",
  "autonomy.stats": "{rate}% verified · {weeks} wk",
  "autonomy.threshold": "threshold {t}%",
  "gate.loading": "Loading…",
  "gate.errorTitle": "Loading error",
  "gate.retry": "Retry",
  "gate.signinSub": "Magic-link sign-in — enter your email, open the link you receive.",
  "gate.sent": "Link sent to {email}. Open it on this device.",
  "gate.emailPlaceholder": "you@firm.com",
  "gate.sending": "Sending…",
  "gate.receiveLink": "Send me the link",
  "gate.connected": "Signed in",
  "gate.noInstance": "no instance yet. Instantiate your vertical: name + business domain.",
  "gate.namePlaceholder": "Instance name (e.g. Meridian Firm)",
  "gate.domainPlaceholder": "Domain (e.g. Payroll & filings)",
  "gate.creating": "Creating…",
  "gate.createInstance": "Create the instance",
  "gate.signoutLink": "Sign out",
};

const es: Dict = {
  "stamp.pass": "Conforme",
  "stamp.fail": "Anomalía",
  "stamp.hold": "Fuera de alcance",
  "stamp.idle": "En cola",
  "stamp.sent": "Enviado",
  "mode.demo": "demo",
  "mode.live": "real",
  "topbar.harness": "harness",
  "topbar.demoLive": "modo demo",
  "topbar.loopActive": "ciclo activo",
  "topbar.signout": "Cerrar sesión",
  "common.toMeasure": "por medir",
  "queue.title": "Cola de intenciones",
  "queue.count": "{n} expedientes",
  "queue.pass": "conformes",
  "queue.fail": "anomalías",
  "queue.hold": "fuera de alc.",
  "queue.empty": "Cola vacía — las intenciones llegan\npor el daemon o la API.",
  "batch.applying": "Aplicando…",
  "batch.none": "Ningún expediente en espera",
  "batch.apply": "Validar el lote conforme ({n})",
  "curve.title": "La curva — éxito al primer envío",
  "curve.withMemory": "con memoria",
  "curve.withoutMemory": "sin memoria",
  "curve.empty": "por medir — la curva aparece\ncon los primeros veredictos reales (≥ 2 semanas).",
  "kpi.firstPassLast": "éxito 1er envío (última sem.)",
  "kpi.unitsMonth": "unidades validadas este mes",
  "kpi.rejAvoided": "rechazos evitados (memoria)",
  "kpi.tokens": "tokens activos",
  "kpi.passed30d": "veredictos conformes (30 d)",
  "kpi.queued": "expedientes en cola",
  "verdict.title": "Veredicto del harness",
  "verdict.rules": "{n} reglas evaluadas",
  "verdict.pending": "En cola — aún sin evaluar.\nEl harness nunca prejuzga.",
  "verdict.select": "Seleccione un expediente.",
  "verdict.sent": "enviado",
  "memory.title": "Memoria validada",
  "memory.meta": "entrada: solo veredictos",
  "memory.empty": "Vacía — la memoria solo se llena\ncon veredictos y resoluciones reales.",
  "token.fix": "Corrección validada",
  "token.rej": "Rechazo aprendido",
  "token.conv": "Convención",
  "autonomy.title": "Autonomía por categoría",
  "autonomy.meta": "el harness sigue siendo la puerta",
  "autonomy.empty": "Sin categorías — créelas en la instanciación.",
  "autonomy.auto": "Auto",
  "autonomy.copilot": "Copiloto",
  "autonomy.shadow": "Sombra",
  "autonomy.stats": "{rate}% verificado · {weeks} sem.",
  "autonomy.threshold": "umbral {t}%",
  "gate.loading": "Cargando…",
  "gate.errorTitle": "Error de carga",
  "gate.retry": "Reintentar",
  "gate.signinSub": "Acceso por enlace mágico — escriba su email y abra el enlace recibido.",
  "gate.sent": "Enlace enviado a {email}. Ábralo en este dispositivo.",
  "gate.emailPlaceholder": "usted@despacho.es",
  "gate.sending": "Enviando…",
  "gate.receiveLink": "Recibir el enlace",
  "gate.connected": "Conectado",
  "gate.noInstance": "sin instancia. Instancie su vertical: nombre + dominio profesional.",
  "gate.namePlaceholder": "Nombre de la instancia (ej. Despacho Meridiano)",
  "gate.domainPlaceholder": "Dominio (ej. Nóminas y declaraciones)",
  "gate.creating": "Creando…",
  "gate.createInstance": "Crear la instancia",
  "gate.signoutLink": "Cerrar sesión",
};

const zh: Dict = {
  "stamp.pass": "合规",
  "stamp.fail": "异常",
  "stamp.hold": "超出范围",
  "stamp.idle": "排队中",
  "stamp.sent": "已发送",
  "mode.demo": "演示",
  "mode.live": "真实",
  "topbar.harness": "校验闸门",
  "topbar.demoLive": "演示模式",
  "topbar.loopActive": "闭环运行中",
  "topbar.signout": "退出登录",
  "common.toMeasure": "待测量",
  "queue.title": "意图队列",
  "queue.count": "{n} 份案卷",
  "queue.pass": "合规",
  "queue.fail": "异常",
  "queue.hold": "超出范围",
  "queue.empty": "队列为空 — 意图由\ndaemon 或 API 送入。",
  "batch.applying": "应用中…",
  "batch.none": "没有待处理的案卷",
  "batch.apply": "批量确认合规案卷（{n}）",
  "curve.title": "曲线 — 首次提交成功率",
  "curve.withMemory": "有记忆",
  "curve.withoutMemory": "无记忆",
  "curve.empty": "待测量 — 曲线将随首批\n真实裁定出现（≥ 2 周）。",
  "kpi.firstPassLast": "首次提交成功率（上周）",
  "kpi.unitsMonth": "本月验证通过的单元",
  "kpi.rejAvoided": "避免的驳回（记忆）",
  "kpi.tokens": "活跃记忆令牌",
  "kpi.passed30d": "合规裁定（30 天）",
  "kpi.queued": "排队中的案卷",
  "verdict.title": "校验闸门裁定",
  "verdict.rules": "已评估 {n} 条规则",
  "verdict.pending": "排队中 — 尚未评估。\n校验闸门绝不预判。",
  "verdict.select": "请选择一份案卷。",
  "verdict.sent": "已发送",
  "memory.title": "已验证记忆",
  "memory.meta": "入口：仅限裁定",
  "memory.empty": "空 — 记忆只通过真实的\n裁定与结算来填充。",
  "token.fix": "已验证的修正",
  "token.rej": "已学习的驳回",
  "token.conv": "约定",
  "autonomy.title": "按类别的自主权",
  "autonomy.meta": "校验闸门始终是唯一入口",
  "autonomy.empty": "暂无类别 — 请在实例化时创建。",
  "autonomy.auto": "自动",
  "autonomy.copilot": "副驾驶",
  "autonomy.shadow": "影子",
  "autonomy.stats": "{rate}% 已验证 · {weeks} 周",
  "autonomy.threshold": "阈值 {t}%",
  "gate.loading": "加载中…",
  "gate.errorTitle": "加载错误",
  "gate.retry": "重试",
  "gate.signinSub": "魔法链接登录 — 输入您的邮箱，打开收到的链接。",
  "gate.sent": "链接已发送至 {email}。请在本设备上打开。",
  "gate.emailPlaceholder": "you@firm.com",
  "gate.sending": "发送中…",
  "gate.receiveLink": "发送链接",
  "gate.connected": "已登录",
  "gate.noInstance": "尚无实例。请实例化您的垂直领域：名称 + 业务域。",
  "gate.namePlaceholder": "实例名称（例：子午事务所）",
  "gate.domainPlaceholder": "业务域（例：薪酬与申报）",
  "gate.creating": "创建中…",
  "gate.createInstance": "创建实例",
  "gate.signoutLink": "退出登录",
};

export const DICTS: Record<Lang, Dict> = { fr, en, es, zh };

/** Traduction pure (testable hors React) : fallback en → clé brute. */
export function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

function detectLang(): Lang {
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl && fromUrl in DICTS) return fromUrl as Lang;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in DICTS) return stored as Lang;
  const nav = navigator.language.slice(0, 2).toLowerCase();
  return (nav in DICTS ? nav : "en") as Lang;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);

  const t = useCallback<Translate>((key, vars) => translate(lang, key, vars), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n hors du I18nProvider");
  return ctx;
}

export function LangSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch">
      {LANGS.map((l) => (
        <button
          key={l.code}
          className={l.code === lang ? "on" : ""}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
