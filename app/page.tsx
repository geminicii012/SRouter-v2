"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Cloud,
  Command,
  Edit3,
  Languages,
  Loader2,
  Menu,
  Moon,
  Network,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

type Locale = "id" | "en";
type Tab = "overview" | "providers" | "models" | "routes" | "logs" | "relay" | "settings";
type Key = { id: string; label: string; value: string; enabled: boolean };
type Relay = { id: string; name: string; url: string; secret: string; enabled: boolean; region?: string };
type OAuth = { authorizeUrl: string; tokenUrl: string; clientId: string; clientSecret: string; scopes: string; accessToken?: string; refreshToken?: string; expiresAt?: number };
type ModelSync = { lastSync?: string; status?: "idle" | "success" | "error"; error?: string; modelsCount?: number; nextSyncAt?: string };
type PricingMode = "auto" | "free" | "fixed" | "custom" | "unknown";
type ModelPricing = { mode: PricingMode; inputPerMillion?: number; outputPerMillion?: number };
type ProviderPricing = { default: ModelPricing; models?: Record<string, ModelPricing> };
type Provider = { id: string; name: string; baseUrl: string; format: "openai" | "anthropic" | "gemini"; keys: Key[]; models: string[]; capabilities: string[]; enabled: boolean; headers?: Record<string, string>; relays?: Relay[]; relayMode?: "direct" | "prefer" | "only"; timeoutMs?: number; oauth?: OAuth; modelSync?: ModelSync; pricing?: ProviderPricing };
type Target = { providerId: string; model: string; priority?: number; retry?: number; timeoutMs?: number };
type CatalogModel = { id: string; providerId: string; providerName: string; model: string; displayName: string; favorite: boolean; source: "provider" | "route" };
type Vault = { version: number; locale: Locale; providers: Provider[]; routes: Record<string, Target[]>; logging: boolean; logLimit: number; updatedAt: string; modelFavorites?: string[] };
type UsageBucket = { requests: number; inputTokens: number; outputTokens: number; totalTokens: number; billableUsd: number; unknownCostRequests: number; estimatedUsageRequests: number };
type UsageSummary = { today: UsageBucket; month: UsageBucket; byProvider: ({ name: string } & UsageBucket)[]; byModel: ({ name: string } & UsageBucket)[] };
type Log = { at: string; provider: string; model: string; status: number; latency: number; usage?: { inputTokens: number; outputTokens: number; totalTokens: number; source: "provider" | "estimated" }; cost?: { mode: PricingMode; usd: number | null }; error?: string };
type Busy = "" | "unlock" | "save-provider" | "detect" | "sync" | "save-route" | "catalog";
type Toast = { type: "success" | "error"; text: string };
type ProviderDraft = { id: string; name: string; baseUrl: string; format: Provider["format"]; keys: string; models: string; capabilities: string; enabled: boolean; headers: string; relays: string; relayMode: NonNullable<Provider["relayMode"]>; timeoutMs: number; oauthEnabled: boolean; authorizeUrl: string; tokenUrl: string; clientId: string; clientSecret: string; scopes: string; pricingMode: PricingMode; inputPerMillion: number; outputPerMillion: number };
type RouteDraft = { originalAlias: string; alias: string; targets: Target[] };
type Copy = typeof text.en;

const emptyDraft: ProviderDraft = { id: "", name: "", baseUrl: "", format: "openai", keys: "Primary:", models: "", capabilities: "chat,responses,embeddings,images,speech,transcription", enabled: true, headers: "", relays: "", relayMode: "direct", timeoutMs: 120000, oauthEnabled: false, authorizeUrl: "", tokenUrl: "", clientId: "", clientSecret: "", scopes: "", pricingMode: "auto", inputPerMillion: 0, outputPerMillion: 0 };
const emptyTarget = (): Target => ({ providerId: "", model: "", priority: 1, retry: 0, timeoutMs: 120000 });
const emptyRouteDraft = (): RouteDraft => ({ originalAlias: "", alias: "", targets: [emptyTarget()] });
const text = {
  id: { control: "Pusat kendali", sub: "Monitor dan operasikan provider, model, route, dan relay dari satu command surface.", overview: "Ringkasan", providers: "Provider", models: "Models", routes: "Rute", logs: "Log", relay: "Relay", settings: "Pengaturan", addProvider: "Tambah provider", active: "Provider aktif", modelCount: "Model katalog", routeCount: "Rute fallback", requests: "Request terbaru", emptyProvider: "Belum ada provider.", emptyRoute: "Belum ada alias rute.", save: "Simpan", cancel: "Batal", test: "Tes", edit: "Edit", remove: "Hapus", addRoute: "Tambah rute", clear: "Hapus log", sync: "Sinkronkan", setup: "Siapkan SRouter", unlock: "Buka SRouter", continue: "Lanjutkan", secretHelp: "Router Secret minimal 16 karakter dan tidak dapat dipulihkan.", connect: "Hubungkan OAuth", disconnect: "Putuskan OAuth", healthy: "Aktif", disabled: "Nonaktif" },
  en: { control: "Aurora Command", sub: "Monitor and operate providers, models, routes, and relay fabric from one command surface.", overview: "Overview", providers: "Providers", models: "Models", routes: "Routes", logs: "Logs", relay: "Relay", settings: "Settings", addProvider: "Add provider", active: "Active providers", modelCount: "Catalog models", routeCount: "Fallback routes", requests: "Recent requests", emptyProvider: "No providers yet.", emptyRoute: "No route aliases yet.", save: "Save", cancel: "Cancel", test: "Test", edit: "Edit", remove: "Delete", addRoute: "Add route", clear: "Clear logs", sync: "Sync", setup: "Set up SRouter", unlock: "Unlock SRouter", continue: "Continue", secretHelp: "Router Secret must be at least 16 characters and cannot be recovered.", connect: "Connect OAuth", disconnect: "Disconnect OAuth", healthy: "Active", disabled: "Disabled" },
};

export default function Home() {
  const [locale, setLocale] = useState<Locale>("id");
  const [theme, setTheme] = useState("dark");
  const [tab, setTab] = useState<Tab>("overview");
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [secret, setSecret] = useState("");
  const [setup, setSetup] = useState<boolean | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [providerModal, setProviderModal] = useState(false);
  const [routeModal, setRouteModal] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [routeDraft, setRouteDraft] = useState<RouteDraft>(emptyRouteDraft);
  const [logs, setLogs] = useState<Log[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [sync, setSync] = useState<Record<string, unknown> | null>(null);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [busy, setBusy] = useState<Busy>("");
  const [detectStatus, setDetectStatus] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [inspectedProviderId, setInspectedProviderId] = useState<string>("");
  const autoSyncing = useRef(false);
  const tabTimer = useRef<number | null>(null);
  const t = text[locale];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    fetch("/api/setup").then((x) => x.json() as Promise<{ setup: boolean }>).then((x) => setSetup(x.setup));
  }, [theme]);

  useEffect(() => {
    function handleCommandShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") { setCommandOpen(false); setProviderModal(false); setRouteModal(false); setMobileNavOpen(false); }
    }
    window.addEventListener("keydown", handleCommandShortcut);
    return () => window.removeEventListener("keydown", handleCommandShortcut);
  }, []);

  useEffect(() => {
    if (!commandOpen && !providerModal && !routeModal) return;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.top = `-${scrollY}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.width = previousWidth;
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [commandOpen, providerModal, routeModal]);

  useEffect(() => { if (vault && tab === "logs") void loadLogs(); }, [tab, vault]);
  useEffect(() => { if (vault && tab === "overview") void loadUsage(); }, [tab, vault?.version]);
  useEffect(() => { if (vault) void loadCatalog(true); }, [vault?.version, modelQuery, providerFilter]);
  useEffect(() => {
    if (!vault?.providers.length) setInspectedProviderId("");
    else if (!inspectedProviderId || !vault.providers.some((provider) => provider.id === inspectedProviderId)) setInspectedProviderId(vault.providers[0].id);
  }, [vault, inspectedProviderId]);

  function notify(message: string, type: Toast["type"] = "success") {
    setToast({ text: message, type });
    window.setTimeout(() => setToast(null), 2600);
  }
  function lines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
  function providerName(id: string) { return vault?.providers.find((provider) => provider.id === id)?.name || "Missing provider"; }
  function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : "Never"; }
  function navigateTo(nextTab: Tab, after?: () => void) {
    if (nextTab === tab || tabTransitioning) return;
    setMobileNavOpen(false);
    setCommandOpen(false);
    setTabTransitioning(true);
    if (tabTimer.current) window.clearTimeout(tabTimer.current);
    tabTimer.current = window.setTimeout(() => {
      setTab(nextTab);
      setTabTransitioning(false);
      tabTimer.current = null;
      after?.();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 240);
  }

  async function unlock(create = false) {
    setBusy("unlock");
    setError("");
    const response = await fetch(create ? "/api/setup" : "/api/vault", { method: create ? "POST" : "GET", headers: { "content-type": "application/json", "x-router-secret": secret }, body: create ? JSON.stringify({ secret }) : undefined });
    const payload = await response.json() as { vault?: Vault; error?: string };
    setBusy("");
    if (!response.ok || !payload.vault) return setError(payload.error || "Unlock failed");
    setVault(payload.vault);
    setSetup(true);
    setLocale(payload.vault.locale || locale);
  }

  async function persist(next: Vault) {
    const response = await fetch("/api/vault", { method: "PUT", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ vault: next, expectedVersion: vault?.version }) });
    const payload = await response.json() as { vault?: Vault; error?: string };
    if (!response.ok || !payload.vault) {
      setError(payload.error || "Save failed");
      notify(payload.error || "Save failed", "error");
      return false;
    }
    setVault(payload.vault);
    return true;
  }

  async function loadCatalog(background = false) {
    if (!vault) return;
    if (!background) setBusy("catalog");
    const query = new URLSearchParams({ q: modelQuery, provider: providerFilter });
    const response = await fetch(`/api/catalog?${query}`, { headers: { "x-router-secret": secret } });
    const payload = await response.json() as { models?: CatalogModel[]; expiredProviders?: string[] };
    if (response.ok) {
      setCatalog(payload.models || []);
      if (background && payload.expiredProviders?.length && !autoSyncing.current) {
        autoSyncing.current = true;
        await refreshModels(undefined, false, true);
        autoSyncing.current = false;
      }
    }
    if (!background) setBusy("");
  }

  function providerFromDraft(): Provider {
    const old = vault?.providers.find((provider) => provider.id === draft.id);
    const keys = lines(draft.keys).map((line, index) => {
      const separator = line.indexOf(":");
      return { id: old?.keys[index]?.id || crypto.randomUUID(), label: separator > 0 ? line.slice(0, separator) : `Key ${index + 1}`, value: separator > 0 ? line.slice(separator + 1) : line, enabled: true };
    });
    const relays = lines(draft.relays).map((line, index) => {
      const [name, url, relaySecret, region] = line.split("|");
      return { id: old?.relays?.[index]?.id || crypto.randomUUID(), name: name || `Relay ${index + 1}`, url: url || "", secret: relaySecret || "", region: region || "global", enabled: true };
    }).filter((relay) => relay.url);
    const headers: Record<string, string> = {};
    for (const line of lines(draft.headers)) {
      const separator = line.indexOf(":");
      if (separator > 0) headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    const oauth = draft.oauthEnabled ? { authorizeUrl: draft.authorizeUrl, tokenUrl: draft.tokenUrl, clientId: draft.clientId, clientSecret: draft.clientSecret, scopes: draft.scopes, accessToken: old?.oauth?.accessToken, refreshToken: old?.oauth?.refreshToken, expiresAt: old?.oauth?.expiresAt } : undefined;
    const pricing: ProviderPricing = { default: { mode: draft.pricingMode, ...(draft.pricingMode === "fixed" || draft.pricingMode === "custom" ? { inputPerMillion: Number(draft.inputPerMillion) || 0, outputPerMillion: Number(draft.outputPerMillion) || 0 } : {}) }, models: old?.pricing?.models };
    return { id: draft.id || crypto.randomUUID(), name: draft.name, baseUrl: draft.baseUrl.replace(/\/$/, ""), format: draft.format, keys, models: draft.models.split(",").map((item) => item.trim()).filter(Boolean), capabilities: draft.capabilities.split(",").map((item) => item.trim()).filter(Boolean), enabled: draft.enabled, headers, relays, relayMode: draft.relayMode, timeoutMs: Number(draft.timeoutMs) || 120000, oauth, modelSync: old?.modelSync, pricing };
  }

  function openProvider(provider?: Provider) {
    setDetectStatus("");
    setError("");
    if (!provider) setDraft(emptyDraft);
    else {
      setInspectedProviderId(provider.id);
      setDraft({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, format: provider.format, keys: provider.keys.map((key) => `${key.label}:${key.value}`).join("\n"), models: provider.models.join(","), capabilities: (provider.capabilities || ["chat"]).join(","), enabled: provider.enabled, headers: Object.entries(provider.headers || {}).map(([key, value]) => `${key}:${value}`).join("\n"), relays: (provider.relays || []).map((relay) => `${relay.name}|${relay.url}|${relay.secret}|${relay.region || "global"}`).join("\n"), relayMode: provider.relayMode || "direct", timeoutMs: provider.timeoutMs || 120000, oauthEnabled: Boolean(provider.oauth), authorizeUrl: provider.oauth?.authorizeUrl || "", tokenUrl: provider.oauth?.tokenUrl || "", clientId: provider.oauth?.clientId || "", clientSecret: provider.oauth?.clientSecret || "", scopes: provider.oauth?.scopes || "", pricingMode: provider.pricing?.default.mode || "auto", inputPerMillion: provider.pricing?.default.inputPerMillion || 0, outputPerMillion: provider.pricing?.default.outputPerMillion || 0 });
    }
    setProviderModal(true);
  }

  async function detectModels() {
    const provider = providerFromDraft();
    if (!provider.name || !provider.baseUrl) return setDetectStatus("Nama dan Base URL wajib diisi");
    setBusy("detect");
    setDetectStatus("");
    const token = provider.keys.find((item) => item.enabled)?.value;
    const response = await fetch("/api/providers/detect", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ provider, token }) });
    const payload = await response.json() as { ok?: boolean; models?: string[]; count?: number; error?: string };
    setBusy("");
    if (!response.ok || !payload.ok || !payload.models) {
      setDetectStatus(payload.error || "Detect models gagal. Gunakan input manual.");
      return notify(payload.error || "Detect models gagal", "error");
    }
    setDraft({ ...draft, models: payload.models.join(",") });
    setDetectStatus(`${payload.count || payload.models.length} models detected`);
    notify(`${payload.count || payload.models.length} models detected`);
  }

  async function saveProvider() {
    if (!vault || !draft.name || !draft.baseUrl) return setError("Nama dan Base URL wajib diisi");
    setBusy("save-provider");
    const provider = providerFromDraft();
    const providers = draft.id ? vault.providers.map((item) => item.id === draft.id ? provider : item) : [...vault.providers, provider];
    if (await persist({ ...vault, providers })) {
      setProviderModal(false);
      setInspectedProviderId(provider.id);
      notify(locale === "id" ? "Provider disimpan" : "Provider saved");
    }
    setBusy("");
  }

  async function refreshModels(providerId?: string, force = true, quiet = false) {
    setBusy("sync");
    const response = await fetch("/api/providers/sync", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ providerId, force }) });
    const payload = await response.json() as { vault?: Vault; results?: { status?: string; error?: string }[]; error?: string };
    setBusy("");
    if (!response.ok || !payload.vault) {
      if (!quiet) notify(payload.error || "Sync failed", "error");
      return;
    }
    setVault(payload.vault);
    const errors = (payload.results || []).filter((result) => result.status === "error");
    if (!quiet) notify(errors.length ? errors[0].error || "Sync failed" : "Models synced", errors.length ? "error" : "success");
  }

  async function removeProvider(id: string) {
    if (!vault || !window.confirm(locale === "id" ? "Hapus provider dan rute terkait?" : "Delete provider and related routes?")) return;
    const routes = Object.fromEntries(Object.entries(vault.routes).map(([alias, targets]) => [alias, targets.filter((target) => target.providerId !== id)]).filter(([, targets]) => targets.length));
    await persist({ ...vault, providers: vault.providers.filter((provider) => provider.id !== id), routes });
  }

  async function testProvider(id: string) {
    const response = await fetch("/api/test-provider", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ providerId: id }) });
    const payload = await response.json() as { ok?: boolean; latency?: number; status?: number; error?: string };
    notify(payload.ok ? `OK - ${payload.latency} ms` : payload.error || `HTTP ${payload.status}`, payload.ok ? "success" : "error");
  }

  async function oauth(id: string, disconnect = false) {
    const response = await fetch(disconnect ? "/api/oauth/disconnect" : "/api/oauth/start", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ providerId: id }) });
    const payload = await response.json() as { vault?: Vault; url?: string; error?: string };
    if (!response.ok) return notify(payload.error || "OAuth failed", "error");
    if (disconnect && payload.vault) setVault(payload.vault);
    else if (payload.url) window.location.href = payload.url;
  }

  function openRoute(alias?: string) {
    setError("");
    if (!vault || !alias) setRouteDraft(emptyRouteDraft());
    else setRouteDraft({ originalAlias: alias, alias, targets: vault.routes[alias].map((target, index) => ({ priority: index + 1, retry: 0, timeoutMs: 120000, ...target })) });
    setRouteModal(true);
  }

  function patchTarget(index: number, patch: Partial<Target>) {
    const targets = [...routeDraft.targets];
    targets[index] = { ...targets[index], ...patch };
    if (patch.providerId) targets[index].model = "";
    setRouteDraft({ ...routeDraft, targets });
  }

  function moveTarget(from: number, to: number) {
    if (to < 0 || to >= routeDraft.targets.length) return;
    const targets = [...routeDraft.targets];
    const [item] = targets.splice(from, 1);
    targets.splice(to, 0, item);
    setRouteDraft({ ...routeDraft, targets: targets.map((target, index) => ({ ...target, priority: index + 1 })) });
  }

  async function saveRoute() {
    if (!vault || !routeDraft.alias) return;
    const targets = routeDraft.targets.filter((target) => target.providerId && target.model).map((target, index) => ({ ...target, priority: Number(target.priority) || index + 1, retry: Math.max(0, Number(target.retry) || 0), timeoutMs: Number(target.timeoutMs) || undefined }));
    if (!targets.length) return setError("Minimal satu target");
    setBusy("save-route");
    const routes = { ...vault.routes };
    if (routeDraft.originalAlias && routeDraft.originalAlias !== routeDraft.alias) delete routes[routeDraft.originalAlias];
    routes[routeDraft.alias] = targets;
    if (await persist({ ...vault, routes })) {
      setRouteModal(false);
      notify("Route saved");
    }
    setBusy("");
  }

  async function deleteRoute(alias: string) {
    if (!vault) return;
    const routes = { ...vault.routes };
    delete routes[alias];
    await persist({ ...vault, routes });
  }

  async function toggleFavorite(item: CatalogModel) {
    const response = await fetch("/api/catalog/favorite", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ modelId: item.id, favorite: !item.favorite }) });
    const payload = await response.json() as { vault?: Vault; error?: string };
    if (!response.ok || !payload.vault) return notify(payload.error || "Favorite failed", "error");
    setVault(payload.vault);
    notify(item.favorite ? "Removed from favorites" : "Added to favorites");
  }

  async function loadLogs() {
    const response = await fetch("/api/logs", { headers: { "x-router-secret": secret } });
    const payload = await response.json() as { logs?: Log[] };
    if (response.ok) setLogs(payload.logs || []);
  }

  async function loadUsage() {
    const response = await fetch("/api/usage", { headers: { "x-router-secret": secret } });
    const payload = await response.json() as UsageSummary;
    if (response.ok) setUsageSummary(payload);
  }

  async function clearLogs() {
    await fetch("/api/logs", { method: "DELETE", headers: { "x-router-secret": secret } });
    setLogs([]);
  }

  async function checkSync() {
    const response = await fetch("/api/sync", { headers: { "x-router-secret": secret } });
    const payload = await response.json() as Record<string, unknown>;
    setSync(payload);
  }

  async function testRelay(url: string) {
    const response = await fetch("/api/relay-health", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ url }) });
    const payload = await response.json() as { ok?: boolean; latency?: number; status?: number; error?: string };
    notify(payload.ok ? `Relay OK - ${payload.latency} ms` : payload.error || `HTTP ${payload.status}`, payload.ok ? "success" : "error");
  }

  const metrics = useMemo(() => ({ providers: vault?.providers.filter((provider) => provider.enabled).length || 0, models: catalog.length || vault?.providers.reduce((count, provider) => count + provider.models.length, 0) || 0, routes: Object.keys(vault?.routes || {}).length, relays: vault?.providers.reduce((count, provider) => count + (provider.relays?.length || 0), 0) || 0 }), [vault, catalog]);
  const nav = useMemo<{ id: Tab; Icon: LucideIcon; label: string }[]>(() => [
    { id: "overview", Icon: Activity, label: t.overview },
    { id: "providers", Icon: Boxes, label: t.providers },
    { id: "models", Icon: Search, label: t.models },
    { id: "routes", Icon: RouteIcon, label: t.routes },
    { id: "logs", Icon: ScrollText, label: t.logs },
    { id: "relay", Icon: Cloud, label: t.relay },
    { id: "settings", Icon: Settings, label: t.settings },
  ], [t]);
  const inspectedProvider = vault?.providers.find((provider) => provider.id === inspectedProviderId) || vault?.providers[0];
  const filteredProviders = vault?.providers || [];
  const relayItems = vault?.providers.flatMap((provider) => (provider.relays || []).map((relay) => ({ provider, relay }))) || [];
  const commandActions = useMemo(() => [
    { id: "overview", label: "Open overview", hint: "Monitor control plane", Icon: Activity, run: () => navigateTo("overview") },
    { id: "providers", label: "Navigate providers", hint: "Provider health and credentials", Icon: Boxes, run: () => navigateTo("providers") },
    { id: "add-provider", label: t.addProvider, hint: "Create a provider", Icon: Plus, run: () => navigateTo("providers", () => openProvider()) },
    { id: "models", label: "Open model catalog", hint: "Search and favorite models", Icon: Search, run: () => navigateTo("models") },
    { id: "routes", label: "Navigate routes", hint: "Fallback chains", Icon: RouteIcon, run: () => navigateTo("routes") },
    { id: "add-route", label: t.addRoute, hint: "Create a route alias", Icon: Network, run: () => navigateTo("routes", () => openRoute()) },
    { id: "logs", label: "Open logs", hint: "Request metadata", Icon: ScrollText, run: () => navigateTo("logs") },
    { id: "sync", label: "Sync provider models", hint: "Refresh OpenAI-compatible catalogs", Icon: RefreshCw, run: () => void refreshModels(undefined, true) },
  ], [t, vault, routeDraft]);
  const visibleCommands = commandActions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(commandQuery.toLowerCase()));

  if (setup === null) return <main className="setup aurora-shell"><div className="skeleton setup-card" /></main>;
  if (!vault) return <main className="setup aurora-shell"><section className="setup-card"><BrandMark /><h1>{setup ? t.unlock : t.setup}</h1><p className="muted">{t.secretHelp}</p><div className="form"><Field label="Router Secret"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void unlock(!setup)} /></Field>{error && <div className="error">{error}</div>}<button className="btn primary" onClick={() => void unlock(!setup)} disabled={busy === "unlock"}>{busy === "unlock" && <Loader2 size={16} className="spin" />}{t.continue}</button></div></section>{toast && <ToastView toast={toast} />}</main>;

  return <div className="shell aurora-shell">
    <button className={`nav-backdrop ${mobileNavOpen ? "show" : ""}`} onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" tabIndex={mobileNavOpen ? 0 : -1} />
    <aside className={`sidebar ${mobileNavOpen ? "open" : ""}`}>
      <div className="brand"><BrandMark /><div><strong>SRouter</strong><span>Aurora Command</span></div></div>
      <nav className="nav" aria-label="Primary navigation">{nav.map(({ id, Icon, label }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTo(id)} disabled={tabTransitioning}><Icon size={18} />{label}</button>)}</nav>
      <div className="sidebar-foot"><span className="pulse-dot" /> API online <span className="mono">v{vault.version}</span></div>
    </aside>

    <main className="main">
      {tabTransitioning && <div className="page-transition" role="status" aria-live="polite"><span /><strong>Switching view</strong><small>Preparing command surface</small></div>}
      <div key={tab} className={tabTransitioning ? "page-content leaving" : "page-content entered"}>
      <header className="top">
        <div className="title-stack">
          <h1>{tab === "overview" ? t.control : nav.find((item) => item.id === tab)?.label}</h1>
          <div className="muted">{tab === "overview" ? t.sub : `SRouter vault v${vault.version} - ${formatDate(vault.updatedAt)}`}</div>
        </div>
        <div className="actions">
          <button className="btn command-trigger" onClick={() => setCommandOpen(true)}><Command size={16} /><kbd>{typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"} K</kbd></button>
          <span className="toggle-group">
            <button className="btn icon-btn" onClick={() => setLocale(locale === "id" ? "en" : "id")} title="Language" aria-label="Language"><Languages size={17} /></button>
            <button className="btn icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Theme" aria-label="Theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          </span>
          {tab === "providers" && <button className="btn primary context-action" onClick={() => openProvider()}><Plus size={16} /><span>{t.addProvider}</span></button>}
          {tab === "routes" && <button className="btn primary context-action" onClick={() => openRoute()}><Plus size={16} /><span>{t.addRoute}</span></button>}
          {tab === "models" && <button className="btn context-action" onClick={() => void refreshModels(undefined, true)} disabled={busy === "sync"}>{busy === "sync" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}<span>Refresh Now</span></button>}
        </div>
      </header>

      {tab === "overview" && <>
        <section className="grid four"><Metric label={t.active} value={metrics.providers} icon={Server} /><Metric label={t.modelCount} value={metrics.models} icon={Boxes} /><Metric label={t.routeCount} value={metrics.routes} icon={RouteIcon} /><Metric label="Relays" value={metrics.relays} icon={Cloud} /></section>
        <UsageOverview summary={usageSummary} />
        <section className="dashboard-columns">
          <article className="card panel-strong"><div className="section-head"><h2>Provider health network</h2><button className="link" onClick={() => navigateTo("providers")}>Manage<ArrowRight size={15} /></button></div><HealthNetwork providers={vault.providers} /></article>
          <article className="card panel-strong"><div className="section-head"><h2>Favorites</h2><button className="link" onClick={() => navigateTo("models")}>Browse<ArrowRight size={15} /></button></div><ModelList items={catalog.filter((model) => model.favorite).slice(0, 6)} onFavorite={toggleFavorite} compact />{!catalog.some((model) => model.favorite) && <EmptyState title="No favorites" text="Star models to keep them at the top." />}</article>
        </section>
        <section className="dashboard-columns">
          <article className="card"><div className="section-head"><h2>{t.providers}</h2><button className="link" onClick={() => navigateTo("providers")}>Open<ArrowRight size={15} /></button></div><ProviderList providers={vault.providers.slice(0, 5)} t={t} inspectedProviderId={inspectedProviderId} onInspect={setInspectedProviderId} onEdit={openProvider} onDelete={removeProvider} onTest={testProvider} onOAuth={oauth} onSync={(id) => void refreshModels(id, true)} busy={busy} /></article>
          <article className="card"><div className="section-head"><h2>Route chains</h2><button className="link" onClick={() => navigateTo("routes")}>Operate<ArrowRight size={15} /></button></div>{Object.entries(vault.routes).slice(0, 2).map(([alias, targets]) => <RouteCard key={alias} alias={alias} targets={targets} providerName={providerName} onOpen={openRoute} onDelete={deleteRoute} compact />)}{!Object.keys(vault.routes).length && <EmptyState title={t.emptyRoute} text="Create an alias that points to one or more provider targets." />}</article>
        </section>
      </>}

      {tab === "providers" && <section className="provider-console">
        <article className="card provider-table"><div className="section-head"><h2>Provider Status</h2><button className="btn" onClick={() => void refreshModels(undefined, true)} disabled={busy === "sync"}>{busy === "sync" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}Sync all</button></div><HealthNetwork providers={vault.providers} compact /><ProviderList providers={vault.providers} t={t} inspectedProviderId={inspectedProviderId} onInspect={setInspectedProviderId} onEdit={openProvider} onDelete={removeProvider} onTest={testProvider} onOAuth={oauth} onSync={(id) => void refreshModels(id, true)} busy={busy} />{vault.providers.length === 0 && <EmptyState title={t.emptyProvider} text="Add an OpenAI-compatible provider, then detect models automatically." />}</article>
        <ProviderInspector provider={inspectedProvider} t={t} onEdit={openProvider} onTest={testProvider} onOAuth={oauth} onSync={(id) => void refreshModels(id, true)} busy={busy} />
      </section>}

      {tab === "models" && <section className="card"><div className="catalog-toolbar"><div className="searchbox"><Search size={16} /><input placeholder="Search models..." value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} /></div><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="all">All providers</option>{filteredProviders.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></div>{busy === "catalog" ? <SkeletonRows /> : <ModelList items={catalog} onFavorite={toggleFavorite} />}{!catalog.length && busy !== "catalog" && <EmptyState title="No models found" text="Try another search or sync provider models." />}</section>}

      {tab === "routes" && <section className="route-grid">{Object.entries(vault.routes).map(([alias, targets]) => <RouteCard key={alias} alias={alias} targets={targets} providerName={providerName} onOpen={openRoute} onDelete={deleteRoute} />)}{!Object.keys(vault.routes).length && <div className="card"><EmptyState title={t.emptyRoute} text="Create an alias that points to one or more provider targets." /></div>}</section>}

      {tab === "logs" && <section className="card"><div className="section-head"><h2>{t.requests}</h2><div className="actions"><button className="btn icon-btn" onClick={() => void loadLogs()} aria-label="Refresh logs"><RefreshCw size={15} /></button><button className="btn danger" onClick={() => void clearLogs()}>{t.clear}</button></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Status</th><th>Input</th><th>Output</th><th>Cost</th><th>Latency</th></tr></thead><tbody>{logs.map((entry, index) => <tr key={`${entry.at}-${index}`}><td className="mono">{new Date(entry.at).toLocaleString()}</td><td>{entry.provider}</td><td className="mono">{entry.model}</td><td><span className={`status-code ${entry.status >= 200 && entry.status < 300 ? "ok" : "fail"}`}>{entry.status || "ERR"}</span></td><td>{entry.usage ? formatTokens(entry.usage.inputTokens) : "—"}</td><td>{entry.usage ? formatTokens(entry.usage.outputTokens) : "—"}</td><td className="mono">{entry.cost?.usd === null ? "N/A" : entry.cost ? `$${entry.cost.usd.toFixed(6)}` : "—"}</td><td>{entry.latency} ms</td></tr>)}</tbody></table></div>{!logs.length && <EmptyState title="No logs" text="Request metadata will appear here." />}</section>}

      {tab === "relay" && <section className="route-grid">{relayItems.map(({ provider, relay }) => <article className="card relay-card" key={relay.id}><div className="section-head"><div><h2>{relay.name}</h2><div className="muted">{provider.name} - {relay.region}</div></div><span className="status"><span className="pulse-dot" />Enabled</span></div><div className="mono relay-url">{relay.url}</div><button className="btn full" onClick={() => void testRelay(relay.url)}>{t.test}</button></article>)}{metrics.relays === 0 && <div className="card"><EmptyState title="No relays" text="Relays are added from the provider editor." /></div>}</section>}

      {tab === "settings" && <section className="settings-grid"><article className="card"><h2>Logging</h2><p className="muted">Prompt dan respons tidak pernah disimpan.</p><label className="switch-row"><span>Metadata logs</span><input type="checkbox" checked={vault.logging} onChange={(event) => void persist({ ...vault, logging: event.target.checked })} /></label></article><article className="card"><h2>Deployment sync</h2><p className="muted">Semua deployment dengan Vault ID yang sama memakai konfigurasi ini.</p><button className="btn" onClick={() => void checkSync()}>{t.sync}</button>{sync && <pre className="sync-box">{JSON.stringify(sync, null, 2)}</pre>}</article><article className="card"><h2>API endpoint</h2><code className="endpoint">{typeof window !== "undefined" ? window.location.origin : ""}/v1</code><p className="muted">Gunakan Router Secret sebagai API key.</p></article></section>}

      {providerModal && <ProviderDialog draft={draft} setDraft={setDraft} error={error} detectStatus={detectStatus} busy={busy} t={t} onDetect={detectModels} onClose={() => setProviderModal(false)} onSave={saveProvider} />}
      {routeModal && <RouteDialog routeDraft={routeDraft} setRouteDraft={setRouteDraft} providers={vault.providers} error={error} busy={busy} dragIndex={dragIndex} setDragIndex={setDragIndex} patchTarget={patchTarget} moveTarget={moveTarget} onClose={() => setRouteModal(false)} onSave={saveRoute} t={t} />}
      {commandOpen && <CommandPalette query={commandQuery} setQuery={setCommandQuery} commands={visibleCommands} onClose={() => setCommandOpen(false)} />}
      {toast && <ToastView toast={toast} />}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="Mobile navigation">
      <button className="mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Menu" aria-expanded={mobileNavOpen}><Menu size={18} /></button>
      {nav.slice(0, 4).map(({ id, Icon, label }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTo(id)} disabled={tabTransitioning}><Icon size={18} /><span>{label}</span></button>)}
    </nav>
  </div>;
}

function BrandMark() {
  return <span className="brand-mark" aria-label="SRouter routing network"><span className="brand-node source" /><span className="brand-path upper" /><span className="brand-path lower" /><span className="brand-node target upper" /><span className="brand-node target lower" /></span>;
}


function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return <div className="card metric-card"><div className="metric-icon"><Icon size={18} /></div><div className="muted">{label}</div><div className="metric">{value}</div></div>;
}

function formatTokens(value: number) { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value); }
function UsageOverview({ summary }: { summary: UsageSummary | null }) {
  if (!summary) return <section className="usage-grid"><div className="card usage-card skeleton" /><div className="card usage-card skeleton" /><div className="card usage-card skeleton" /></section>;
  const month = summary.month;
  return <section className="usage-panel card"><div className="section-head"><div><h2>Token & cost observability</h2><div className="muted small">Metadata only — prompt dan respons tidak disimpan.</div></div><span className="tag">This month</span></div><div className="usage-grid"><div className="usage-card"><span className="muted">Input tokens</span><strong>{formatTokens(month.inputTokens)}</strong><small>{month.estimatedUsageRequests ? `${month.estimatedUsageRequests} estimated` : "Provider reported"}</small></div><div className="usage-card"><span className="muted">Output tokens</span><strong>{formatTokens(month.outputTokens)}</strong><small>{formatTokens(month.totalTokens)} total</small></div><div className="usage-card"><span className="muted">Estimated cost</span><strong>${month.billableUsd.toFixed(4)}</strong><small>{month.unknownCostRequests ? `${month.unknownCostRequests} unknown pricing` : "Market-equivalent estimate"}</small></div></div>{month.requests === 0 && <div className="usage-empty muted">Belum ada usage. Request berikutnya akan tercatat jika metadata logs aktif.</div>}{summary.byProvider.length > 0 && <div className="usage-breakdown">{summary.byProvider.slice(0, 4).map((item) => <div key={item.name}><span>{item.name}</span><span className="mono">{formatTokens(item.totalTokens)} · ${item.billableUsd.toFixed(4)}</span></div>)}</div>}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field aurora-field"><label>{label}</label>{children}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty"><div className="empty-illustration"><ShieldCheck size={22} /><span /></div><strong>{title}</strong><span>{text}</span></div>;
}

function SkeletonRows() {
  return <div className="skeleton-list">{Array.from({ length: 7 }).map((_, index) => <div className="skeleton-row skeleton" key={index} />)}</div>;
}

function ToastView({ toast }: { toast: Toast }) {
  return <div className={`toast ${toast.type}`} role="status">{toast.text}</div>;
}

function ModelList({ items, onFavorite, compact = false }: { items: CatalogModel[]; onFavorite: (item: CatalogModel) => void; compact?: boolean }) {
  return <div className={compact ? "model-list compact" : "model-list"}>{items.map((item) => <div className="model-row" key={item.id}><button className={`star ${item.favorite ? "on" : ""}`} onClick={() => onFavorite(item)} title="Favorite" aria-label="Favorite"><Star size={16} fill={item.favorite ? "currentColor" : "none"} /></button><div className="min-0"><strong>{item.displayName}</strong><div className="mono muted truncate">{item.model}</div></div><span className="tag provider-badge">{item.providerName}</span></div>)}</div>;
}

function ProviderList({ providers, t, inspectedProviderId, onInspect, onEdit, onDelete, onTest, onOAuth, onSync, busy }: { providers: Provider[]; t: Copy; inspectedProviderId: string; onInspect: (id: string) => void; onEdit: (provider: Provider) => void; onDelete: (id: string) => void; onTest: (id: string) => void; onOAuth: (id: string, disconnect?: boolean) => void; onSync: (id: string) => void; busy: Busy }) {
  return <div className="provider-list">{providers.map((provider) => <div className={`provider ${inspectedProviderId === provider.id ? "selected" : ""}`} key={provider.id}><div className="min-0"><div className="provider-title"><strong>{provider.name}</strong><span className="tag">{provider.format}</span>{provider.relays?.length ? <span className="tag relay-tag">Relay</span> : null}</div><div className="mono muted clamp">{provider.baseUrl}</div>{provider.modelSync?.error && <div className="error clamp">{provider.modelSync.error}</div>}</div><div className="status-cell"><span className="status">{provider.enabled ? <CheckCircle2 size={15} color="var(--good)" /> : <XCircle size={15} color="var(--muted)" />}{provider.enabled ? t.healthy : t.disabled}</span><span className={`sync-pill ${provider.modelSync?.status || "idle"}`}>{provider.modelSync?.status || "idle"}</span></div><div><strong>{provider.models.length}</strong><div className="muted small">models</div></div><div><div className="muted small">Last Sync</div><div className="mono">{provider.modelSync?.lastSync ? new Date(provider.modelSync.lastSync).toLocaleString() : "Never"}</div></div><div className="provider-actions"><button className="btn" onClick={() => onInspect(provider.id)} aria-expanded={inspectedProviderId === provider.id}><PanelRightOpen size={15} />Inspector</button><button className="btn" onClick={() => onSync(provider.id)} disabled={busy === "sync" || provider.format !== "openai"}>{busy === "sync" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}</button><button className="btn" onClick={() => onTest(provider.id)}>{t.test}</button>{provider.oauth && <button className="btn" onClick={() => onOAuth(provider.id, Boolean(provider.oauth?.accessToken))}>{provider.oauth.accessToken ? t.disconnect : t.connect}</button>}<button className="btn icon-btn" onClick={() => onEdit(provider)} aria-label={t.edit}><Edit3 size={15} /></button><button className="btn icon-btn danger" onClick={() => onDelete(provider.id)} aria-label={t.remove}><Trash2 size={15} /></button></div></div>)}</div>;
}

function ProviderInspector({ provider, t, onEdit, onTest, onOAuth, onSync, busy }: { provider?: Provider; t: Copy; onEdit: (provider: Provider) => void; onTest: (id: string) => void; onOAuth: (id: string, disconnect?: boolean) => void; onSync: (id: string) => void; busy: Busy }) {
  if (!provider) return <aside className="card provider-inspector"><h2>Inspector</h2><EmptyState title="No provider selected" text="Choose a provider to inspect routing health and credentials." /></aside>;
  return <aside className="card provider-inspector"><div className="section-head"><div><span className="eyebrow"><PanelRightOpen size={14} /> Inspector</span><h2>{provider.name}</h2></div><span className={`sync-pill ${provider.modelSync?.status || "idle"}`}>{provider.modelSync?.status || "idle"}</span></div><div className="inspector-grid"><div><span>Format</span><strong>{provider.format}</strong></div><div><span>Keys</span><strong>{provider.keys.length}</strong></div><div><span>Models</span><strong>{provider.models.length}</strong></div><div><span>Timeout</span><strong>{provider.timeoutMs || 120000} ms</strong></div></div><div className="inspector-section"><span className="muted small">Base URL</span><code>{provider.baseUrl}</code></div><div className="chip-row">{provider.capabilities.map((capability) => <span className="tag" key={capability}>{capability}</span>)}</div><div className="inspector-section"><span className="muted small">Relays</span>{provider.relays?.length ? provider.relays.map((relay) => <div className="relay-mini" key={relay.id}><span className="pulse-dot" /><div><strong>{relay.name}</strong><div className="mono muted truncate">{relay.url}</div></div></div>) : <p className="muted">Direct routing only.</p>}</div><div className="inspector-actions"><button className="btn primary" onClick={() => onTest(provider.id)}>{t.test}</button><button className="btn" onClick={() => onSync(provider.id)} disabled={busy === "sync" || provider.format !== "openai"}><RefreshCw size={15} />{t.sync}</button>{provider.oauth && <button className="btn" onClick={() => onOAuth(provider.id, Boolean(provider.oauth?.accessToken))}>{provider.oauth.accessToken ? t.disconnect : t.connect}</button>}<button className="btn" onClick={() => onEdit(provider)}><Edit3 size={15} />{t.edit}</button></div></aside>;
}

function HealthNetwork({ providers, compact = false }: { providers: Provider[]; compact?: boolean }) {
  if (!providers.length) return <EmptyState title="No health signals" text="Providers will appear as connected nodes after setup." />;
  return <div className={`health-network ${compact ? "compact" : ""}`}>{providers.map((provider, index) => <div className="health-segment" key={provider.id}><div className={`health-node ${provider.enabled ? "online" : "offline"}`}><Server size={16} /><strong>{provider.name}</strong><span>{provider.models.length} models</span></div>{index < providers.length - 1 && <span className="health-connector" />}</div>)}</div>;
}

function RouteCard({ alias, targets, providerName, onOpen, onDelete, compact = false }: { alias: string; targets: Target[]; providerName: (id: string) => string; onOpen: (alias: string) => void; onDelete: (alias: string) => void; compact?: boolean }) {
  return <article className={`card route-card clickable ${compact ? "compact" : ""}`} onClick={() => onOpen(alias)}><div className="section-head"><div className="min-0"><h2 className="mono truncate">{alias}</h2><span className="muted">{targets.length} targets</span></div><button className="btn icon-btn danger" onClick={(event) => { event.stopPropagation(); void onDelete(alias); }} aria-label="Delete route"><Trash2 size={15} /></button></div><div className="route-chain">{targets.map((target, index) => <div className="route-step" key={`${target.providerId}-${target.model}-${index}`}><div className="route-node"><span>{target.priority || index + 1}</span><div className="min-0"><strong>{providerName(target.providerId)}</strong><div className="mono muted truncate">{target.model}</div><div className="muted small">retry {target.retry || 0} - timeout {target.timeoutMs || "provider"} ms</div></div></div>{index < targets.length - 1 && <span className="route-connector" />}</div>)}</div></article>;
}

function CommandPalette({ query, setQuery, commands, onClose }: { query: string; setQuery: (value: string) => void; commands: { id: string; label: string; hint: string; Icon: LucideIcon; run: () => void }[]; onClose: () => void }) {
  return <div className="modal command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-title"><div className="command-search"><Command size={18} /><input autoFocus placeholder="Command palette" aria-label="Command palette" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="btn icon-btn" onClick={onClose} aria-label="Close command palette"><X size={16} /></button></div><h2 id="command-title">Command palette</h2><div className="command-list">{commands.map(({ id, label, hint, Icon, run }) => <button key={id} onClick={() => { run(); onClose(); }}><Icon size={17} /><span><strong>{label}</strong><small>{hint}</small></span><Zap size={14} /></button>)}{commands.length === 0 && <EmptyState title="No command" text="Try providers, routes, logs, or sync." />}</div></section></div>;
}

function ProviderDialog({ draft, setDraft, error, detectStatus, busy, t, onDetect, onClose, onSave }: { draft: ProviderDraft; setDraft: (draft: ProviderDraft) => void; error: string; detectStatus: string; busy: Busy; t: Copy; onDetect: () => void; onClose: () => void; onSave: () => void }) {
  return <div className="modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title"><div className="section-head"><h2 id="provider-dialog-title">{draft.id ? t.edit : t.addProvider}</h2><button className="btn icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div><div className="form"><div className="row"><Field label="Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="API format"><select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as Provider["format"] })}><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic native</option><option value="gemini">Gemini native</option></select></Field></div><Field label="Base URL"><input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://integrate.api.nvidia.com/v1" /></Field><label className="switch-row"><span>Provider aktif</span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /></label><Field label="API keys - satu per baris: Label:key"><textarea value={draft.keys} onChange={(event) => setDraft({ ...draft, keys: event.target.value })} rows={3} /></Field><div className="detect-row"><button className="btn" onClick={onDetect} disabled={busy === "detect" || draft.format !== "openai"}>{busy === "detect" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}Detect Models</button><span className={detectStatus.includes("gagal") || detectStatus.includes("failed") ? "error" : "muted"}>{detectStatus || "OpenAI-compatible providers can populate models automatically."}</span></div><Field label="Models - fallback manual jika detect tidak didukung"><textarea value={draft.models} onChange={(event) => setDraft({ ...draft, models: event.target.value })} rows={4} placeholder="model-a,model-b" /></Field><Field label="Capabilities"><input value={draft.capabilities} onChange={(event) => setDraft({ ...draft, capabilities: event.target.value })} /></Field><details open><summary>Token cost & pricing</summary><div className="form inset"><Field label="Pricing mode"><select value={draft.pricingMode} onChange={(event) => setDraft({ ...draft, pricingMode: event.target.value as PricingMode })}><option value="auto">Auto — estimasi semua provider/model</option><option value="free">Free — cost selalu $0</option><option value="fixed">Fixed provider price</option><option value="custom">Custom/internal cost</option><option value="unknown">Unknown — tampilkan N/A</option></select></Field>{(draft.pricingMode === "fixed" || draft.pricingMode === "custom") && <div className="row"><Field label="Input $ / 1M tokens"><input type="number" min={0} step="0.000001" value={draft.inputPerMillion} onChange={(event) => setDraft({ ...draft, inputPerMillion: Number(event.target.value) })} /></Field><Field label="Output $ / 1M tokens"><input type="number" min={0} step="0.000001" value={draft.outputPerMillion} onChange={(event) => setDraft({ ...draft, outputPerMillion: Number(event.target.value) })} /></Field></div>}<div className="muted small">Auto selalu menghitung market-equivalent estimate, termasuk provider gratis/custom. Jika katalog tidak cocok, fallback $1 input / $3 output per 1M token digunakan.</div></div></details><details><summary>Advanced headers & relay</summary><div className="form inset"><Field label="Custom headers - Header:value"><textarea value={draft.headers} onChange={(event) => setDraft({ ...draft, headers: event.target.value })} rows={2} /></Field><Field label="Relays - Name|URL|Secret|Region"><textarea value={draft.relays} onChange={(event) => setDraft({ ...draft, relays: event.target.value })} rows={3} /></Field><Field label="Relay mode"><select value={draft.relayMode} onChange={(event) => setDraft({ ...draft, relayMode: event.target.value as NonNullable<Provider["relayMode"]> })}><option value="direct">Direct, lalu relay</option><option value="prefer">Relay, lalu direct</option><option value="only">Relay only</option></select></Field></div></details><details><summary>OAuth 2.0 resmi</summary><div className="form inset"><label className="switch-row"><span>Aktifkan OAuth</span><input type="checkbox" checked={draft.oauthEnabled} onChange={(event) => setDraft({ ...draft, oauthEnabled: event.target.checked })} /></label>{draft.oauthEnabled && <><div className="row"><Field label="Authorize URL"><input value={draft.authorizeUrl} onChange={(event) => setDraft({ ...draft, authorizeUrl: event.target.value })} /></Field><Field label="Token URL"><input value={draft.tokenUrl} onChange={(event) => setDraft({ ...draft, tokenUrl: event.target.value })} /></Field></div><div className="row"><Field label="Client ID"><input value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} /></Field><Field label="Client Secret"><input type="password" value={draft.clientSecret} onChange={(event) => setDraft({ ...draft, clientSecret: event.target.value })} /></Field></div><Field label="Scopes"><input value={draft.scopes} onChange={(event) => setDraft({ ...draft, scopes: event.target.value })} /></Field></>}</div></details>{error && <div className="error">{error}</div>}<div className="dialog-actions"><button className="btn" onClick={onClose}>{t.cancel}</button><button className="btn primary" onClick={onSave} disabled={busy === "save-provider"}>{busy === "save-provider" && <Loader2 size={15} className="spin" />}{t.save}</button></div></div></section></div>;
}

function RouteDialog({ routeDraft, setRouteDraft, providers, error, busy, dragIndex, setDragIndex, patchTarget, moveTarget, onClose, onSave, t }: { routeDraft: RouteDraft; setRouteDraft: (draft: RouteDraft) => void; providers: Provider[]; error: string; busy: Busy; dragIndex: number | null; setDragIndex: (index: number | null) => void; patchTarget: (index: number, patch: Partial<Target>) => void; moveTarget: (from: number, to: number) => void; onClose: () => void; onSave: () => void; t: Copy }) {
  return <div className="modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog route-dialog" role="dialog" aria-modal="true" aria-labelledby="route-dialog-title"><div className="section-head"><h2 id="route-dialog-title">{routeDraft.originalAlias ? "Edit route" : t.addRoute}</h2><button className="btn icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div><div className="form"><Field label="Alias"><input value={routeDraft.alias} onChange={(event) => setRouteDraft({ ...routeDraft, alias: event.target.value })} placeholder="smart" /></Field><div className="route-targets">{routeDraft.targets.map((target, index) => <div className="target-editor" key={index} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) moveTarget(dragIndex, index); setDragIndex(null); }}><div className="drag-handle"><ChevronsUpDown size={16} /></div><Field label="Provider"><select value={target.providerId} onChange={(event) => patchTarget(index, { providerId: event.target.value })}><option value="">Provider</option>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></Field><Field label="Model"><select value={target.model} onChange={(event) => patchTarget(index, { model: event.target.value })}><option value="">Model</option>{providers.find((provider) => provider.id === target.providerId)?.models.map((model) => <option value={model} key={model}>{model}</option>)}</select></Field><Field label="Priority"><input type="number" min={1} value={target.priority || index + 1} onChange={(event) => patchTarget(index, { priority: Number(event.target.value) })} /></Field><Field label="Retry"><input type="number" min={0} value={target.retry || 0} onChange={(event) => patchTarget(index, { retry: Number(event.target.value) })} /></Field><Field label="Timeout"><input type="number" min={1000} value={target.timeoutMs || ""} onChange={(event) => patchTarget(index, { timeoutMs: Number(event.target.value) })} /></Field><div className="target-actions"><button className="btn icon-btn" onClick={() => moveTarget(index, index - 1)} aria-label="Move up"><ChevronDown className="rotate" size={15} /></button><button className="btn icon-btn" onClick={() => moveTarget(index, index + 1)} aria-label="Move down"><ChevronDown size={15} /></button><button className="btn icon-btn danger" onClick={() => setRouteDraft({ ...routeDraft, targets: routeDraft.targets.filter((_, targetIndex) => targetIndex !== index) })} aria-label="Remove target"><Trash2 size={15} /></button></div></div>)}</div><button className="btn" onClick={() => setRouteDraft({ ...routeDraft, targets: [...routeDraft.targets, { ...emptyTarget(), priority: routeDraft.targets.length + 1 }] })}><Plus size={15} />Target fallback</button>{error && <div className="error">{error}</div>}<div className="dialog-actions"><button className="btn" onClick={onClose}>{t.cancel}</button><button className="btn primary" onClick={onSave} disabled={busy === "save-route"}>{busy === "save-route" && <Loader2 size={15} className="spin" />}{t.save}</button></div></div></section></div>;
}
