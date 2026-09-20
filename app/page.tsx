"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import BootTerminal from "@/components/BootTerminal";
import LoginTerminal from "@/components/LoginTerminal";
import ChatPanel from "@/components/ChatPanel";
import ApiKeyPanel from "@/components/ApiKeyPanel";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
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
  Trash2, CopyPlus,
  X,
  XCircle,
  Zap,
  MessageSquare,
  type LucideIcon, KeyRound } from "lucide-react";

type Locale = "id" | "en";
type Tab = "overview" | "providers" | "models" | "routes" | "logs" | "relay" | "settings" | "chat" | "apikey";
type Accent = "blue" | "orange";
const ACCENTS: Accent[] = ["blue", "orange"];
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
/**
 * ID generator yang aman di NON-secure context.
 *
 * Masalah nyata: `crypto.randomUUID()` HANYA ada di secure context
 * (HTTPS atau localhost). Di http://bore.pub:38700 nilainya `undefined`,
 * sehingga memanggilnya melempar "crypto.randomUUID is not a function"
 * dan handler React MATI sebelum sempat mengirim request apa pun.
 */
function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Busy = "" | "unlock" | "save-provider" | "detect" | "sync" | "save-route" | "catalog";
type Toast = { type: "success" | "error"; text: string };
type ProviderDraft = { id: string; name: string; baseUrl: string; format: Provider["format"]; keys: string; models: string; capabilities: string; enabled: boolean; headers: string; relays: string; relayMode: NonNullable<Provider["relayMode"]>; timeoutMs: number; oauthEnabled: boolean; authorizeUrl: string; tokenUrl: string; clientId: string; clientSecret: string; scopes: string; pricingMode: PricingMode; inputPerMillion: number; outputPerMillion: number };
type RouteDraft = { originalAlias: string; alias: string; targets: Target[] };
type Copy = typeof text.en;

const emptyDraft: ProviderDraft = { id: "", name: "", baseUrl: "", format: "openai", keys: "Primary:", models: "", capabilities: "chat,responses,embeddings,images,speech,transcription", enabled: true, headers: "", relays: "", relayMode: "direct", timeoutMs: 120000, oauthEnabled: false, authorizeUrl: "", tokenUrl: "", clientId: "", clientSecret: "", scopes: "", pricingMode: "auto", inputPerMillion: 0, outputPerMillion: 0 };
const emptyTarget = (): Target => ({ providerId: "", model: "", priority: 1, retry: 0, timeoutMs: 120000 });
const emptyRouteDraft = (): RouteDraft => ({ originalAlias: "", alias: "", targets: [emptyTarget()] });
const text = {
  id: {
    control: "SRouter", overview: "Ringkasan", providers: "Provider", models: "Models", routes: "Rute", logs: "Log", relay: "Relay", settings: "Pengaturan", accent: "Warna aksen", accentHint: "Pilih warna sorotan untuk tombol, grafik, dan aksen antarmuka.", accentBlue: "Biru", accentOrange: "Oranye", chat: "Chat", apikey: "API Key",
    addProvider: "Tambah provider",
    fName: "Nama", fApiFormat: "Format API", fBaseUrl: "Base URL",
    fApiKeys: "API key - satu per baris: Label:key",
    fDetect: "Deteksi Model",
    fDetecting: "mendeteksi ...",
    fDetectHint: "Provider OpenAI-compatible bisa mengisi model otomatis.",
    fModels: "Model - fallback manual jika detect tidak didukung",
    fCapabilities: "Kapabilitas",
    fPricingSection: "Biaya token & harga",
    fPricingMode: "Mode harga", fInputPrice: "Input $ / 1jt token", fOutputPrice: "Output $ / 1jt token",
    fPricingNote: "Auto selalu menghitung estimasi setara pasar, termasuk provider gratis/custom. Jika katalog tidak cocok, fallback $1 input / $3 output per 1jt token.",
    fHeadersSection: "Header tambahan & relay",
    fHeaders: "Header custom - Header:value",
    fRelays: "Relay - Nama|URL|Secret|Region", fRelayMode: "Mode relay",
    fOauthSection: "OAuth 2.0 resmi", fOauthEnable: "Aktifkan OAuth",
    fAuthorizeUrl: "Authorize URL", fTokenUrl: "Token URL",
    fClientId: "Client ID", fClientSecret: "Client Secret", fScopes: "Scopes",
    fAlias: "Alias", fModel: "Model", fProvider: "Provider",
    fPriority: "Prioritas", fRetry: "Retry", fTimeout: "Timeout",
    fAddTarget: "Target fallback", fEditRoute: "Ubah rute",
    fRelaysMetric: "Relay", fClose: "Tutup",
    fMoveUp: "Naikkan", fMoveDown: "Turunkan", fRemoveTarget: "Hapus target", active: "Provider aktif", modelCount: "Model katalog", routeCount: "Rute fallback", requests: "Request terbaru",
    emptyProvider: "Belum ada provider.", emptyRoute: "Belum ada alias rute.",
    save: "Simpan", cancel: "Batal", test: "Tes", edit: "Edit", remove: "Hapus", duplicate: "Duplikat", syncOne: "Sinkron", addRoute: "Tambah rute", clear: "Hapus log", sync: "Sinkronkan",
    setup: "Siapkan SRouter", unlock: "Buka SRouter", continue: "Lanjutkan",
    secretHelp: "Router Secret minimal 16 karakter dan tidak dapat dipulihkan.",
    connect: "Hubungkan OAuth", disconnect: "Putuskan OAuth", healthy: "Aktif", disabled: "Nonaktif",
    usage: "Pemakaian", thisMonth: "Bulan ini", tokenIn: "Masuk", tokenOut: "Keluar", estimate: "Estimasi", noUsage: "Belum ada pemakaian.",
    healthNetwork: "Jaringan provider", favorites: "Favorit", routeChains: "Rantai rute", providerStatus: "Status provider",
    manage: "Kelola", browse: "Telusuri", open: "Buka", operate: "Operasikan", syncAll: "Sinkron semua", refreshNow: "Muat ulang",
    targets: "target", models_: "model", lastSync: "Sinkron terakhir", never: "Belum pernah",
    searchModels: "Cari model...", allProviders: "Semua provider", noModels: "Model tidak ditemukan", noModelsHint: "Coba kata kunci lain atau sinkronkan provider.",
    noProvidersHint: "Tambahkan provider kompatibel OpenAI, lalu deteksi model otomatis.",
    noRoutesHint: "Buat alias yang menunjuk ke satu atau beberapa target provider.",
    noFavorites: "Belum ada favorit", noFavoritesHint: "Tandai model untuk menaruhnya di atas.",
    noLogs: "Belum ada log", noLogsHint: "Metadata request akan muncul di sini.",
    noRelays: "Belum ada relay", noRelaysHint: "Relay ditambahkan dari editor provider.",
    noHealth: "Belum ada sinyal", noHealthHint: "Provider akan muncul sebagai node setelah disiapkan.",
    colTime: "Waktu", colProvider: "Provider", colModel: "Model", colStatus: "Status", colInput: "Masuk", colOutput: "Keluar", colCost: "Biaya", colLatency: "Latensi",
    inspector: "Inspeksi", noProviderSelected: "Belum ada provider dipilih", chooseProvider: "Pilih provider untuk melihat rute dan kredensialnya.",
    directRouting: "Rute langsung.", format: "Format", keys: "Key", modelsCount: "Model", timeout: "Timeout", baseUrl: "Base URL", relays: "Relay",
    logging: "Logging", loggingHint: "Prompt dan respons tidak pernah disimpan.", metadataLogs: "Log metadata",
    deploySync: "Sinkron deployment", deployHint: "Semua deployment dengan Vault ID sama memakai konfigurasi ini.",
    apiEndpoint: "Endpoint API", apiHint: "Gunakan Router Secret sebagai API key.",
    name: "Nama", apiFormat: "Format API", providerActive: "Provider aktif", apiKeys: "API key - satu per baris: Label:key",
    detectModels: "Deteksi model", detectHint: "Provider kompatibel OpenAI dapat mengisi model otomatis.",
    modelsManual: "Model - fallback manual jika deteksi tidak didukung", capabilities: "Kapabilitas",
    tokenCost: "Biaya token & harga", pricingMode: "Mode harga", inputPerM: "Input $ / 1jt token", outputPerM: "Output $ / 1jt token",
    advanced: "Header khusus & relay", customHeaders: "Header khusus - Header:value", relaysField: "Relay - Nama|URL|Secret|Region", relayMode: "Mode relay",
    oauthTitle: "OAuth 2.0 resmi", oauthEnable: "Aktifkan OAuth",
    alias: "Alias", priority: "Prioritas", retry: "Ulang", addTarget: "Target fallback",
    editRoute: "Edit rute", commandPalette: "Palet perintah", commandHint: "Cari perintah", noCommand: "Tidak ada perintah", noCommandHint: "Coba provider, rute, log, atau sinkron.",
    favorite: "Favorit", deleteRoute: "Hapus rute", close: "Tutup", refreshLogs: "Muat ulang log",
    switchingView: "Beralih tampilan", preparing: "Menyiapkan antarmuka",
  },
  en: {
    control: "SRouter", overview: "Overview", providers: "Providers", models: "Models", routes: "Routes", logs: "Logs", relay: "Relay", settings: "Settings", accent: "Accent color", accentHint: "Pick the highlight color for buttons, charts, and interface accents.", accentBlue: "Blue", accentOrange: "Orange", chat: "Chat", apikey: "API Key",
    addProvider: "Add provider",
    fName: "Name", fApiFormat: "API format", fBaseUrl: "Base URL",
    fApiKeys: "API keys - one per line: Label:key",
    fDetect: "Detect Models",
    fDetecting: "detecting ...",
    fDetectHint: "OpenAI-compatible providers can populate models automatically.",
    fModels: "Models - manual fallback when detect is unsupported",
    fCapabilities: "Capabilities",
    fPricingSection: "Token cost & pricing",
    fPricingMode: "Pricing mode", fInputPrice: "Input $ / 1M tokens", fOutputPrice: "Output $ / 1M tokens",
    fPricingNote: "Auto always computes a market-equivalent estimate, including free/custom providers. If the catalog has no match, $1 input / $3 output per 1M tokens is used as fallback.",
    fHeadersSection: "Advanced headers & relay",
    fHeaders: "Custom headers - Header:value",
    fRelays: "Relays - Name|URL|Secret|Region", fRelayMode: "Relay mode",
    fOauthSection: "Official OAuth 2.0", fOauthEnable: "Enable OAuth",
    fAuthorizeUrl: "Authorize URL", fTokenUrl: "Token URL",
    fClientId: "Client ID", fClientSecret: "Client Secret", fScopes: "Scopes",
    fAlias: "Alias", fModel: "Model", fProvider: "Provider",
    fPriority: "Priority", fRetry: "Retry", fTimeout: "Timeout",
    fAddTarget: "Fallback target", fEditRoute: "Edit route",
    fRelaysMetric: "Relays", fClose: "Close",
    fMoveUp: "Move up", fMoveDown: "Move down", fRemoveTarget: "Remove target", active: "Active providers", modelCount: "Catalog models", routeCount: "Fallback routes", requests: "Recent requests",
    emptyProvider: "No providers yet.", emptyRoute: "No route aliases yet.",
    save: "Save", cancel: "Cancel", test: "Test", edit: "Edit", remove: "Delete", duplicate: "Duplicate", syncOne: "Sync", addRoute: "Add route", clear: "Clear logs", sync: "Sync",
    setup: "Set up SRouter", unlock: "Unlock SRouter", continue: "Continue",
    secretHelp: "Router Secret must be at least 16 characters and cannot be recovered.",
    connect: "Connect OAuth", disconnect: "Disconnect OAuth", healthy: "Active", disabled: "Disabled",
    usage: "Usage", thisMonth: "This month", tokenIn: "In", tokenOut: "Out", estimate: "Estimate", noUsage: "No usage yet.",
    healthNetwork: "Provider health network", favorites: "Favorites", routeChains: "Route chains", providerStatus: "Provider status",
    manage: "Manage", browse: "Browse", open: "Open", operate: "Operate", syncAll: "Sync all", refreshNow: "Refresh now",
    targets: "targets", models_: "models", lastSync: "Last sync", never: "Never",
    searchModels: "Search models...", allProviders: "All providers", noModels: "No models found", noModelsHint: "Try another search or sync provider models.",
    noProvidersHint: "Add an OpenAI-compatible provider, then detect models automatically.",
    noRoutesHint: "Create an alias that points to one or more provider targets.",
    noFavorites: "No favorites", noFavoritesHint: "Star models to keep them at the top.",
    noLogs: "No logs", noLogsHint: "Request metadata will appear here.",
    noRelays: "No relays", noRelaysHint: "Relays are added from the provider editor.",
    noHealth: "No health signals", noHealthHint: "Providers will appear as connected nodes after setup.",
    colTime: "Time", colProvider: "Provider", colModel: "Model", colStatus: "Status", colInput: "Input", colOutput: "Output", colCost: "Cost", colLatency: "Latency",
    inspector: "Inspector", noProviderSelected: "No provider selected", chooseProvider: "Choose a provider to inspect routing health and credentials.",
    directRouting: "Direct routing only.", format: "Format", keys: "Keys", modelsCount: "Models", timeout: "Timeout", baseUrl: "Base URL", relays: "Relays",
    logging: "Logging", loggingHint: "Prompts and responses are never stored.", metadataLogs: "Metadata logs",
    deploySync: "Deployment sync", deployHint: "All deployments sharing this Vault ID use this configuration.",
    apiEndpoint: "API endpoint", apiHint: "Use the Router Secret as the API key.",
    name: "Name", apiFormat: "API format", providerActive: "Provider active", apiKeys: "API keys - one per line: Label:key",
    detectModels: "Detect models", detectHint: "OpenAI-compatible providers can populate models automatically.",
    modelsManual: "Models - manual fallback if detect is unsupported", capabilities: "Capabilities",
    tokenCost: "Token cost & pricing", pricingMode: "Pricing mode", inputPerM: "Input $ / 1M tokens", outputPerM: "Output $ / 1M tokens",
    advanced: "Advanced headers & relay", customHeaders: "Custom headers - Header:value", relaysField: "Relays - Name|URL|Secret|Region", relayMode: "Relay mode",
    oauthTitle: "Official OAuth 2.0", oauthEnable: "Enable OAuth",
    alias: "Alias", priority: "Priority", retry: "Retry", addTarget: "Fallback target",
    editRoute: "Edit route", commandPalette: "Command palette", commandHint: "Search commands", noCommand: "No command", noCommandHint: "Try providers, routes, logs, or sync.",
    favorite: "Favorite", deleteRoute: "Delete route", close: "Close", refreshLogs: "Refresh logs",
    switchingView: "Switching view", preparing: "Preparing command surface",
  },
};

export default function Home() {
  const [locale, setLocale] = useState<"id"|"en">(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("srouter-prefs") : null;
      if (raw) { const s = JSON.parse(raw) as { locale?: string }; if (s.locale === "en") return "en"; }
    } catch { /* abaikan */ }
    return "id";
  });
  const [theme, setTheme] = useState<"dark"|"light">(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("srouter-prefs") : null;
      if (raw) { const s = JSON.parse(raw) as { theme?: string }; if (s.theme === "light") return "light"; }
    } catch { /* abaikan */ }
    return "dark";
  });
  const [accent, setAccent] = useState<Accent>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("srouter-prefs") : null;
      if (raw) { const s = JSON.parse(raw) as { accent?: string }; if (s.accent === "orange") return "orange"; if (s.accent === "blue") return "blue"; }
    } catch { /* abaikan */ }
    return "blue";
  });
  const [tab, setTab] = useState<Tab>("overview");
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const [secret, setSecret] = useState(() => {
    try { return typeof window !== "undefined" ? (sessionStorage.getItem("srouter-secret") || "") : ""; }
    catch { return ""; }
  });
  const [setup, setSetup] = useState<boolean | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [bootVault, setBootVault] = useState<Vault | null>(null);
  const [bootPhase, setBootPhase] = useState(0);
  // true setelah boot log selesai mengetik baris terakhir. Dipakai untuk
  // menahan layar 1400ms sebelum dashboard muncul.
  // true HANYA setelah BootTerminal menyelesaikan seluruh sequence.
  // Dashboard tidak boleh dirender sebelum ini true.
  const [bootDone, setBootDone] = useState(false);
  // resolver yang menunggu sinyal "log boot tuntas" dari BootTerminal
  const doneResolvers = useRef<Array<() => void>>([]);
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
  const [detectError, setDetectError] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [inspectedProviderId, setInspectedProviderId] = useState<string>("");
  const autoSyncing = useRef(false);
  const tabTimer = useRef<number | null>(null);
  const t = text[locale];

  useEffect(() => {
    try {
      const raw = localStorage.getItem("srouter-prefs");
      if (!raw) return;
      const saved = JSON.parse(raw) as { theme?: string; locale?: string; accent?: string };
      if (saved.theme === "dark" || saved.theme === "light") setTheme(saved.theme);
      if (saved.locale === "id" || saved.locale === "en") setLocale(saved.locale);
      if (saved.accent === "blue" || saved.accent === "orange") setAccent(saved.accent);
    } catch { /* abaikan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.lang = locale;
    try { localStorage.setItem("srouter-prefs", JSON.stringify({ theme, locale, accent })); } catch { /* abaikan */ }
  }, [theme, locale, accent]);

  // Cek status setup SEKALI saat mount. Tanpa ini `setup` tetap null -> layar boot menggantung.
  useEffect(() => {
    let alive = true;
    fetch("/api/setup")
      .then((x) => x.json() as Promise<{ setup: boolean }>)
      .then((x) => { if (alive) setSetup(Boolean(x.setup)); })
      .catch(() => { if (alive) setSetup(false); });
    return () => { alive = false; };
  }, []);

  // Router Secret disimpan di sessionStorage supaya reload tidak memaksa unlock ulang.
  useEffect(() => {
    try {
      if (secret) sessionStorage.setItem("srouter-secret", secret);
      else sessionStorage.removeItem("srouter-secret");
    } catch { /* abaikan */ }
  }, [secret]);

  const autoUnlocked = useRef(false);
  useEffect(() => {
    if (autoUnlocked.current || !secret || vault || busy) return;
    autoUnlocked.current = true;
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

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

  useEffect(() => {
    if (!vault || typeof IntersectionObserver === "undefined") return;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    let idx = 0;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        const type = el.dataset.revealType || "up";
        el.dataset.revealType = type;
        el.style.transitionDelay = `${idx * 140}ms`;
        idx++;
        el.classList.add("revealed");
        observer.unobserve(el);
      }
    }, { rootMargin: "0px 0px -6%", threshold: 0.06 });
    for (const item of items) { item.classList.add("reveal-item"); observer.observe(item); }
    return () => observer.disconnect();
  }, [vault, tab]);

  function notify(message: string, type: Toast["type"] = "success") {
    setToast({ text: message, type });
    window.setTimeout(() => setToast(null), 2600);
  }
  function lines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
  function providerName(id: string) { return vault?.providers.find((provider) => provider.id === id)?.name || "Missing provider"; }
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
    setSetup(true);
    setLocale(payload.vault.locale || locale);
    // Serahkan seluruh timing boot ke BootTerminal. Parent HANYA menunggu
    // sinyal onDone, jadi dashboard tidak mungkin muncul lebih awal —
    // tidak ada timer manual di sini yang bisa salah urutan.
    setBootDone(false);
    setBootVault(payload.vault);
  }

  async function persist(next: Vault) {
    // Timeout keras: spinner TIDAK boleh muter selamanya kalau /api/vault menggantung.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    let response: Response;
    try {
      response = await fetch("/api/vault", { method: "PUT", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ vault: next, expectedVersion: vault?.version }), signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer);
      const msg = (e as Error).name === "AbortError"
        ? (locale === "en" ? "Save timed out after 30s. Server did not respond." : "Simpan timeout 30 detik. Server tidak merespons.")
        : (locale === "en" ? "Save failed: server unreachable." : "Simpan gagal: server tidak bisa dihubungi.");
      setError(msg); notify(msg, "error");
      return false;
    }
    clearTimeout(timer);
    const payload = await response.json() as { vault?: Vault; error?: string };
    if (!response.ok || !payload.vault) {
      const msg = payload.error === "VERSION_CONFLICT"
        ? (locale === "en" ? "Vault changed elsewhere. Reload and retry." : "Vault berubah di tempat lain. Muat ulang lalu coba lagi.")
        : (payload.error || "Save failed");
      setError(msg);
      notify(msg, "error");
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
      return { id: old?.keys[index]?.id || uid(), label: separator > 0 ? line.slice(0, separator) : `Key ${index + 1}`, value: separator > 0 ? line.slice(separator + 1) : line, enabled: true };
    });
    const relays = lines(draft.relays).map((line, index) => {
      const [name, url, relaySecret, region] = line.split("|");
      return { id: old?.relays?.[index]?.id || uid(), name: name || `Relay ${index + 1}`, url: url || "", secret: relaySecret || "", region: region || "global", enabled: true };
    }).filter((relay) => relay.url);
    const headers: Record<string, string> = {};
    for (const line of lines(draft.headers)) {
      const separator = line.indexOf(":");
      if (separator > 0) headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    const oauth = draft.oauthEnabled ? { authorizeUrl: draft.authorizeUrl, tokenUrl: draft.tokenUrl, clientId: draft.clientId, clientSecret: draft.clientSecret, scopes: draft.scopes, accessToken: old?.oauth?.accessToken, refreshToken: old?.oauth?.refreshToken, expiresAt: old?.oauth?.expiresAt } : undefined;
    const pricing: ProviderPricing = { default: { mode: draft.pricingMode, ...(draft.pricingMode === "fixed" || draft.pricingMode === "custom" ? { inputPerMillion: Number(draft.inputPerMillion) || 0, outputPerMillion: Number(draft.outputPerMillion) || 0 } : {}) }, models: old?.pricing?.models };
    return { id: draft.id || uid(), name: draft.name, baseUrl: draft.baseUrl.replace(/\/$/, ""), format: draft.format, keys, models: draft.models.split(",").map((item) => item.trim()).filter(Boolean), capabilities: draft.capabilities.split(",").map((item) => item.trim()).filter(Boolean), enabled: draft.enabled, headers, relays, relayMode: draft.relayMode, timeoutMs: Number(draft.timeoutMs) || 120000, oauth, modelSync: old?.modelSync, pricing };
  }

  function openProvider(provider?: Provider) {
    setDetectStatus("");
    setDetectError(false);
    setError("");
    if (!provider) setDraft(emptyDraft);
    else {
      setInspectedProviderId(provider.id);
      setDraft({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, format: provider.format, keys: provider.keys.map((key) => `${key.label}:${key.value}`).join("\n"), models: provider.models.join(","), capabilities: (provider.capabilities || ["chat"]).join(","), enabled: provider.enabled, headers: Object.entries(provider.headers || {}).map(([key, value]) => `${key}:${value}`).join("\n"), relays: (provider.relays || []).map((relay) => `${relay.name}|${relay.url}|${relay.secret}|${relay.region || "global"}`).join("\n"), relayMode: provider.relayMode || "direct", timeoutMs: provider.timeoutMs || 120000, oauthEnabled: Boolean(provider.oauth), authorizeUrl: provider.oauth?.authorizeUrl || "", tokenUrl: provider.oauth?.tokenUrl || "", clientId: provider.oauth?.clientId || "", clientSecret: provider.oauth?.clientSecret || "", scopes: provider.oauth?.scopes || "", pricingMode: provider.pricing?.default.mode || "auto", inputPerMillion: provider.pricing?.default.inputPerMillion || 0, outputPerMillion: provider.pricing?.default.outputPerMillion || 0 });
    }
    setProviderModal(true);
  }

  // Ringkas error mentah (JSON Cloudflare bisa 600+ karakter) jadi kalimat pendek.
  function humanizeError(raw: string): string {
    const s = raw || "";
    if (/workers_dev_script_not_found|Error 1042/i.test(s))
      return locale === "en"
        ? "Worker not deployed (Cloudflare 1042). Check the worker name in Base URL."
        : "Worker belum dideploy (Cloudflare 1042). Cek nama worker di Base URL.";
    if (/403|forbidden/i.test(s))
      return locale === "en" ? "Rejected by target (403). Wrong key, or origin blocks this IP." : "Ditolak target (403). Key salah atau origin menolak IP ini.";
    if (/401|unauthorized/i.test(s))
      return locale === "en" ? "Rejected by target (401). Check the API key." : "Ditolak target (401). Cek API key.";
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout|abort/i.test(s))
      return locale === "en" ? "Base URL unreachable. Check the host name and that it is online." : "Base URL tidak bisa dihubungi. Cek nama host dan pastikan hidup.";
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > 220 ? one.slice(0, 217) + "..." : one;
  }

  async function detectModels() {
    const provider = providerFromDraft();
    if (!provider.name || !provider.baseUrl) { setDetectError(true); return setDetectStatus(locale === "en" ? "Name and Base URL are required." : "Nama dan Base URL wajib diisi"); }
    setBusy("detect");
    setDetectError(false);
    setDetectStatus(locale === "en" ? "contacting provider ..." : "menghubungi provider ...");
    const startedAt = Date.now();
    const MIN_SPIN_MS = 650;
    const finish = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SPIN_MS) await new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS - elapsed));
      setBusy("");
    };
    try {
      const token = provider.keys.find((item) => item.enabled)?.value;
      let response: Response;
      try {
        response = await fetch("/api/providers/detect", { method: "POST", headers: { "content-type": "application/json", "x-router-secret": secret }, body: JSON.stringify({ provider, token }) });
      } catch {
        await finish();
        const msg = locale === "en" ? "Detect failed: SRouter server unreachable." : "Detect gagal: server SRouter tidak bisa dihubungi.";
        setDetectError(true); setDetectStatus(msg); return notify(msg, "error");
      }
      const payload = await response.json() as { ok?: boolean; models?: string[]; count?: number; error?: string };
      if (!response.ok || !payload.ok || !payload.models) {
        await finish();
        const msg = humanizeError(payload.error || (locale === "en" ? "Model detection failed. Enter models manually." : "Detect models gagal. Gunakan input manual."));
        setDetectError(true); setDetectStatus(msg);
        return notify(msg, "error");
      }
      setDraft({ ...draft, models: payload.models.join(",") });
      await finish();
      const okMsg = locale === "en"
        ? `${payload.count || payload.models.length} models detected`
        : `${payload.count || payload.models.length} model terdeteksi`;
      setDetectError(false);
      setDetectStatus(okMsg);
      notify(okMsg);
    } catch (unexpected) {
      await finish();
      const msg = humanizeError(String(unexpected));
      setDetectError(true); setDetectStatus(msg);
      notify(msg, "error");
    }
  }

  async function saveProvider() {
    if (!vault || !draft.name || !draft.baseUrl) return setError("Nama dan Base URL wajib diisi");
    setBusy("save-provider");
    const provider = providerFromDraft();
    const providers = draft.id ? vault.providers.map((item) => item.id === draft.id ? provider : item) : [...vault.providers, provider];
    try {
      if (await persist({ ...vault, providers })) {
        setProviderModal(false);
        setInspectedProviderId(provider.id);
        notify(locale === "id" ? "Provider disimpan" : "Provider saved");
      }
    } finally {
      setBusy("");
    }
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

  function duplicateProvider(provider: Provider) {
    if (!vault) return;
    const taken = new Set(vault.providers.map((item) => item.name));
    let name = locale === "id" ? `${provider.name} (salinan)` : `${provider.name} (copy)`;
    let counter = 2;
    while (taken.has(name)) {
      name = locale === "id" ? `${provider.name} (salinan ${counter})` : `${provider.name} (copy ${counter})`;
      counter += 1;
    }
    setError("");
    setDetectStatus("");
    setDetectError(false);
    setInspectedProviderId(provider.id);
    setDraft({
      id: "",
      name,
      baseUrl: provider.baseUrl,
      format: provider.format,
      keys: provider.keys.map((key) => `${key.label}:${key.value}`).join("\n"),
      models: provider.models.join(","),
      capabilities: (provider.capabilities || ["chat"]).join(","),
      enabled: provider.enabled,
      headers: Object.entries(provider.headers || {}).map(([key, value]) => `${key}:${value}`).join("\n"),
      relays: (provider.relays || []).map((relay) => `${relay.name}|${relay.url}|${relay.secret}|${relay.region || "global"}`).join("\n"),
      relayMode: provider.relayMode || "direct",
      timeoutMs: provider.timeoutMs || 120000,
      oauthEnabled: Boolean(provider.oauth),
      authorizeUrl: provider.oauth?.authorizeUrl || "",
      tokenUrl: provider.oauth?.tokenUrl || "",
      clientId: provider.oauth?.clientId || "",
      clientSecret: provider.oauth?.clientSecret || "",
      scopes: provider.oauth?.scopes || "",
      pricingMode: provider.pricing?.default.mode || "auto",
      inputPerMillion: provider.pricing?.default.inputPerMillion || 0,
      outputPerMillion: provider.pricing?.default.outputPerMillion || 0,
    });
    setProviderModal(true);
  }

  async function removeProvider(id: string) {
    const target = vault?.providers.find((provider) => provider.id === id);
    const label = target?.name || id;
    if (!vault || !window.confirm(locale === "id"
      ? `Hapus provider "${label}" dan rute terkait?`
      : `Delete provider "${label}" and related routes?`)) return;
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
    { id: "chat", Icon: MessageSquare, label: t.chat },
    { id: "apikey", Icon: KeyRound, label: t.apikey },
    { id: "settings", Icon: Settings, label: t.settings },
  ], [t]);
  const inspectedProvider = vault?.providers.find((provider) => provider.id === inspectedProviderId) || vault?.providers[0];
  const filteredProviders = vault?.providers || [];
  const relayItems = vault?.providers.flatMap((provider) => (provider.relays || []).map((relay) => ({ provider, relay }))) || [];
  const commandActions = useMemo(() => [
    { id: "overview", label: t.overview, hint: "", Icon: Activity, run: () => navigateTo("overview") },
    { id: "providers", label: t.providers, hint: "", Icon: Boxes, run: () => navigateTo("providers") },
    { id: "add-provider", label: t.addProvider, hint: "", Icon: Plus, run: () => navigateTo("providers", () => openProvider()) },
    { id: "models", label: t.models, hint: "", Icon: Search, run: () => navigateTo("models") },
    { id: "routes", label: t.routes, hint: "", Icon: RouteIcon, run: () => navigateTo("routes") },
    { id: "add-route", label: t.addRoute, hint: "", Icon: Network, run: () => navigateTo("routes", () => openRoute()) },
    { id: "logs", label: t.logs, hint: "", Icon: ScrollText, run: () => navigateTo("logs") },
    { id: "sync", label: t.syncAll, hint: "", Icon: RefreshCw, run: () => void refreshModels(undefined, true) },
  ], [t, vault, routeDraft]);
  const visibleCommands = commandActions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(commandQuery.toLowerCase()));

  if (setup === null) return <main className="term-shell term-shell-static"><div className="term-scanline" /><section className="term-box"><div className="term-log term-log-sm"><div className="term-line"><span className="term-ts">[srouter]</span><span className="term-msg">checking configuration ...</span></div></div><span className="term-caret">▊</span></section></main>;
  // Boot screen menahan layar sampai sequence selesai. onDone() adalah
  // SATU-SATUNYA jalan keluar, jadi dashboard pasti menunggu.
  if (bootVault) return (
    <BootTerminal
      onDone={() => {
        // PENTING: set vault DULU, baru lepas boot screen.
        // Kalau hanya setBootDone(true), render berikutnya akan menemukan
        // `!vault` masih true dan jatuh kembali ke layar login.
        setVault(bootVault);
        setBootDone(true);
        setBootVault(null);
      }}
    />
  );
  if (!vault) return <LoginTerminal
    mode={setup ? "unlock" : "setup"}
    secret={secret}
    setSecret={setSecret}
    onUnlock={(isNew) => void unlock(isNew)}
    busy={busy}
    error={error}
    title={setup ? "unlock srouter" : "set up srouter"}
    help="Router Secret must be at least 16 characters and cannot be recovered."
    continueLabel="continue"
  />;

  return <div className={"shell aurora-shell" + (bootDone ? " booted" : "")}>
    <button className={`nav-backdrop ${mobileNavOpen ? "show" : ""}`} onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" tabIndex={mobileNavOpen ? 0 : -1} />
    <aside className={`sidebar ${mobileNavOpen ? "open" : ""}`}>
      <div className="brand"><strong>SRouter</strong></div>
      <nav className="nav" aria-label="Primary navigation">{nav.map(({ id, Icon, label }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTo(id)} aria-busy={tabTransitioning || undefined}><Icon size={18} />{label}</button>)}</nav>
      <div className="sidebar-foot"><span className="pulse-dot" /> API online <span className="mono">v{vault.version}</span></div>
    </aside>

    <main className="main">
      {tabTransitioning && <div className="page-transition" role="status" aria-live="polite"><span /></div>}
      <div key={tab} className={tabTransitioning ? "page-content leaving" : "page-content entered"}>
      <header className="top" data-reveal>
        <div className="title-stack">
          <h1>{tab === "overview" ? t.control : nav.find((item) => item.id === tab)?.label}</h1>
        </div>
        <div className="actions">
          <button className="btn command-trigger" onClick={() => setCommandOpen(true)}><Command size={16} /><kbd>{typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"} K</kbd></button>
          <span className="toggle-group">
            <button className="btn icon-btn" onClick={() => setLocale(locale === "id" ? "en" : "id")} title="Language" aria-label="Language"><Languages size={17} /></button>
            <button className="btn icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Theme" aria-label="Theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          </span>
          {tab === "providers" && <button className="btn primary context-action" onClick={() => openProvider()}><Plus size={16} /><span>{t.addProvider}</span></button>}
          {tab === "routes" && <button className="btn primary context-action" onClick={() => openRoute()}><Plus size={16} /><span>{t.addRoute}</span></button>}
          {tab === "models" && <button className="btn context-action" onClick={() => void refreshModels(undefined, true)} disabled={busy === "sync"}>{busy === "sync" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}<span>{t.refreshNow}</span></button>}
        </div>
      </header>

      {tab === "overview" && <>
        <section className="grid four" data-reveal><Metric label={t.active} data-reveal value={metrics.providers} icon={Server} /><Metric label={t.modelCount} data-reveal value={metrics.models} icon={Boxes} /><Metric label={t.routeCount} data-reveal value={metrics.routes} icon={RouteIcon} /><Metric label={t.fRelaysMetric} data-reveal value={metrics.relays} icon={Cloud} /></section>
        <div data-reveal><UsageOverview summary={usageSummary} t={t} /></div>
        <section className="dashboard-columns">
          <article className="card panel-strong" data-reveal data-reveal-type="slide-left"><div className="section-head"><h2>{t.healthNetwork}</h2><button className="link" onClick={() => navigateTo("providers")}>{t.manage}<ArrowRight size={15} /></button></div><HealthNetwork providers={vault.providers} t={t} /></article>
          <article className="card panel-strong" data-reveal data-reveal-type="slide-right"><div className="section-head"><h2>{t.favorites}</h2><button className="link" onClick={() => navigateTo("models")}>{t.browse}<ArrowRight size={15} /></button></div><ModelList items={catalog.filter((model) => model.favorite).slice(0, 6)} onFavorite={toggleFavorite} compact t={t} />{!catalog.some((model) => model.favorite) && <EmptyState title={t.noFavorites} text={t.noFavoritesHint} />}</article>
        </section>
        <section className="dashboard-columns">
          <article className="card" data-reveal data-reveal-type="scale"><div className="section-head"><h2>{t.providers}</h2><button className="link" onClick={() => navigateTo("providers")}>{t.open}<ArrowRight size={15} /></button></div><ProviderList providers={vault.providers.slice(0, 5)} t={t} inspectedProviderId={inspectedProviderId} onInspect={setInspectedProviderId} onEdit={openProvider} onDelete={removeProvider} onDuplicate={duplicateProvider} onTest={testProvider} onOAuth={oauth} onSync={(id) => void refreshModels(id, true)} busy={busy} /></article>
          <article className="card" data-reveal data-reveal-type="scale"><div className="section-head"><h2>{t.routeChains}</h2><button className="link" onClick={() => navigateTo("routes")}>{t.operate}<ArrowRight size={15} /></button></div>{Object.entries(vault.routes).slice(0, 2).map(([alias, targets]) => <RouteCard key={alias} alias={alias} targets={targets} providerName={providerName} onOpen={openRoute} onDelete={deleteRoute} compact t={t} />)}{!Object.keys(vault.routes).length && <EmptyState title={t.emptyRoute} text={t.noRoutesHint} />}</article>
        </section>
      </>}

      {tab === "providers" && <section className="provider-console">
        <article className="card provider-table"><div className="section-head"><h2>{t.providerStatus}</h2><button className="btn" onClick={() => void refreshModels(undefined, true)} disabled={busy === "sync"}>{busy === "sync" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}{t.syncAll}</button></div><HealthNetwork providers={vault.providers} compact t={t} /><ProviderList providers={vault.providers} t={t} inspectedProviderId={inspectedProviderId} onInspect={setInspectedProviderId} onEdit={openProvider} onDelete={removeProvider} onDuplicate={duplicateProvider} onTest={testProvider} onOAuth={oauth} onSync={(id) => void refreshModels(id, true)} busy={busy} />{vault.providers.length === 0 && <EmptyState title={t.emptyProvider} text={t.noProvidersHint} />}</article>
        <ProviderInspector provider={inspectedProvider} t={t} onEdit={openProvider} onTest={testProvider} onOAuth={oauth} onSync={(id) => void refreshModels(id, true)} busy={busy} />
      </section>}

      {tab === "models" && <section className="card"><div className="catalog-toolbar"><div className="searchbox"><Search size={16} /><input placeholder={t.searchModels} value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} /></div><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="all">{t.allProviders}</option>{filteredProviders.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></div>{busy === "catalog" ? <SkeletonRows /> : <ModelList items={catalog} onFavorite={toggleFavorite} t={t} />}{!catalog.length && busy !== "catalog" && <EmptyState title={t.noModels} text={t.noModelsHint} />}</section>}

      {tab === "routes" && <section className="route-grid">{Object.entries(vault.routes).map(([alias, targets]) => <RouteCard key={alias} alias={alias} targets={targets} providerName={providerName} onOpen={openRoute} onDelete={deleteRoute} t={t} />)}{!Object.keys(vault.routes).length && <div className="card"><EmptyState title={t.emptyRoute} text={t.noRoutesHint} /></div>}</section>}

      {tab === "apikey" && <ApiKeyPanel vault={vault} secret={secret} locale={locale} />}
      {tab === "chat" && <ChatPanel vault={vault} secret={secret} locale={locale} />}
      {tab === "logs" && <section className="card"><div className="section-head"><h2>{t.requests}</h2><div className="actions"><button className="btn icon-btn" onClick={() => void loadLogs()} aria-label={t.refreshLogs}><RefreshCw size={15} /></button><button className="btn danger" onClick={() => void clearLogs()}>{t.clear}</button></div></div><div className="table-wrap"><table><thead><tr><th>{t.colTime}</th><th>{t.colProvider}</th><th>{t.colModel}</th><th>{t.colStatus}</th><th>{t.colInput}</th><th>{t.colOutput}</th><th>{t.colCost}</th><th>{t.colLatency}</th></tr></thead><tbody>{logs.map((entry, index) => <tr key={`${entry.at}-${index}`}><td className="mono">{new Date(entry.at).toLocaleString()}</td><td>{entry.provider}</td><td className="mono">{entry.model}</td><td><span className={`status-code ${entry.status >= 200 && entry.status < 300 ? "ok" : "fail"}`}>{entry.status || "ERR"}</span></td><td>{entry.usage ? formatTokens(entry.usage.inputTokens) : "—"}</td><td>{entry.usage ? formatTokens(entry.usage.outputTokens) : "—"}</td><td className="mono">{entry.cost?.usd === null ? "N/A" : entry.cost ? `$${entry.cost.usd.toFixed(6)}` : "—"}</td><td>{entry.latency} ms</td></tr>)}</tbody></table></div>{!logs.length && <EmptyState title={t.noLogs} text={t.noLogsHint} />}</section>}

      {tab === "relay" && <section className="route-grid">{relayItems.map(({ provider, relay }) => <article className="card relay-card" key={relay.id}><div className="section-head"><div><h2>{relay.name}</h2><div className="muted">{provider.name} - {relay.region}</div></div><span className="status"><span className="pulse-dot" />{t.healthy}</span></div><div className="mono relay-url">{relay.url}</div><button className="btn full" onClick={() => void testRelay(relay.url)}>{t.test}</button></article>)}{metrics.relays === 0 && <div className="card"><EmptyState title={t.noRelays} text={t.noRelaysHint} /></div>}</section>}

      {tab === "settings" && <section className="settings-grid"><article className="card"><h2>{t.logging}</h2><p className="muted">{t.loggingHint}</p><label className="switch-row"><span>{t.metadataLogs}</span><input type="checkbox" checked={vault.logging} onChange={(event) => void persist({ ...vault, logging: event.target.checked })} /></label></article><article className="card"><h2>{t.deploySync}</h2><p className="muted">{t.deployHint}</p><button className="btn" onClick={() => void checkSync()}>{t.sync}</button>{sync && <pre className="sync-box">{JSON.stringify(sync, null, 2)}</pre>}</article><article className="card"><h2>{t.accent}</h2><p className="muted">{t.accentHint}</p><div className="accent-row">{ACCENTS.map((option) => <button key={option} type="button" className="accent-option" aria-pressed={accent === option} onClick={() => setAccent(option)}><span className={`accent-swatch ${option}`} aria-hidden="true" />{option === "blue" ? t.accentBlue : t.accentOrange}</button>)}</div></article><article className="card"><h2>{t.apiEndpoint}</h2><code className="endpoint">{typeof window !== "undefined" ? window.location.origin : ""}/v1</code><p className="muted">{t.apiHint}</p></article></section>}

      {providerModal && <ProviderDialog draft={draft} setDraft={setDraft} error={error} detectStatus={detectStatus} detectError={detectError} busy={busy} t={t} locale={locale} onDetect={detectModels} onClose={() => setProviderModal(false)} onSave={saveProvider} />}
      {routeModal && <RouteDialog routeDraft={routeDraft} setRouteDraft={setRouteDraft} providers={vault.providers} error={error} busy={busy} dragIndex={dragIndex} setDragIndex={setDragIndex} patchTarget={patchTarget} moveTarget={moveTarget} onClose={() => setRouteModal(false)} onSave={saveRoute} t={t} locale={locale} />}
      {commandOpen && <CommandPalette query={commandQuery} setQuery={setCommandQuery} commands={visibleCommands} onClose={() => setCommandOpen(false)} t={t} />}
      {toast && <ToastView toast={toast} />}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="Mobile navigation">
      <button className="mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Menu" aria-expanded={mobileNavOpen}><Menu size={18} /></button>
      {nav.slice(0, 4).map(({ id, Icon, label }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTo(id)} aria-busy={tabTransitioning || undefined}><Icon size={18} /><span>{label}</span></button>)}
    </nav>
  </div>;
}



function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return <div className="card metric-card"><div className="metric-icon"><Icon size={18} /></div><div className="muted">{label}</div><div className="metric">{value}</div></div>;
}

function formatTokens(value: number) { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value); }
function UsageOverview({ summary, t }: { summary: UsageSummary | null; t: Copy }) {
  if (!summary) return <section className="usage-grid"><div className="card usage-card skeleton" /><div className="card usage-card skeleton" /><div className="card usage-card skeleton" /></section>;
  const month = summary.month;
  return <section className="usage-panel card"><div className="section-head usage-head"><h2>{t.usage}</h2><span className="tag">{t.thisMonth}</span></div><div className="usage-grid"><div className="usage-card"><span className="usage-label"><ArrowDownToLine size={14} />{t.tokenIn}</span><strong>{formatTokens(month.inputTokens)}</strong><small>{month.estimatedUsageRequests ? "~ token" : "token"}</small></div><div className="usage-card"><span className="usage-label"><ArrowUpFromLine size={14} />{t.tokenOut}</span><strong>{formatTokens(month.outputTokens)}</strong><small>{formatTokens(month.totalTokens)} total</small></div><div className="usage-card"><span className="usage-label"><CircleDollarSign size={14} />{t.estimate}</span><strong>${month.billableUsd.toFixed(4)}</strong><small>{month.unknownCostRequests ? `${month.unknownCostRequests} tanpa harga` : ""}</small></div></div>{month.requests === 0 && <div className="usage-empty muted">{t.noUsage}</div>}{summary.byProvider.length > 0 && <div className="usage-breakdown">{summary.byProvider.slice(0, 4).map((item) => <div key={item.name}><span>{item.name}</span><span className="mono">{formatTokens(item.totalTokens)} · ${item.billableUsd.toFixed(4)}</span></div>)}</div>}</section>;
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

function ModelList({ items, onFavorite, compact = false, t }: { items: CatalogModel[]; onFavorite: (item: CatalogModel) => void; compact?: boolean; t: Copy }) {
  return <div className={compact ? "model-list compact" : "model-list"}>{items.map((item) => <div className="model-row" key={item.id}><button className={`star ${item.favorite ? "on" : ""}`} onClick={() => onFavorite(item)} title={t.favorite} aria-label={t.favorite}><Star size={16} fill={item.favorite ? "currentColor" : "none"} /></button><div className="min-0"><strong>{item.displayName}</strong><div className="mono muted truncate">{item.model}</div></div><span className="tag provider-badge">{item.providerName}</span></div>)}</div>;
}

function ProviderList({ providers, t, inspectedProviderId, onInspect, onEdit, onDelete, onDuplicate, onTest, onOAuth, onSync, busy }: { providers: Provider[]; t: Copy; inspectedProviderId: string; onInspect: (id: string) => void; onEdit: (provider: Provider) => void; onDelete: (id: string) => void; onDuplicate: (provider: Provider) => void; onTest: (id: string) => void; onOAuth: (id: string, disconnect?: boolean) => void; onSync: (id: string) => void; busy: Busy }) {
  return <div className="provider-list">{providers.map((provider) => <div className={`provider ${inspectedProviderId === provider.id ? "selected" : ""}`} key={provider.id}><div className="min-0"><div className="provider-title"><strong>{provider.name}</strong><span className="tag">{provider.format}</span>{provider.relays?.length ? <span className="tag relay-tag">Relay</span> : null}</div><div className="mono muted clamp">{provider.baseUrl}</div>{provider.modelSync?.error && <div className="error clamp">{provider.modelSync.error}</div>}</div><div className="status-cell"><span className="status">{provider.enabled ? <CheckCircle2 size={15} color="var(--good)" /> : <XCircle size={15} color="var(--muted)" />}{provider.enabled ? t.healthy : t.disabled}</span><span className={`sync-pill ${provider.modelSync?.status || "idle"}`}>{provider.modelSync?.status || "idle"}</span></div><div><strong>{provider.models.length}</strong><div className="muted small">{t.models_}</div></div><div className="provider-actions"><button className="btn" onClick={() => onInspect(provider.id)} aria-expanded={inspectedProviderId === provider.id}><PanelRightOpen size={15} />{t.inspector}</button><button className="btn icon-btn" onClick={() => onSync(provider.id)} disabled={busy === "sync" || provider.format !== "openai"} aria-label={t.syncOne} title={t.syncOne}>{busy === "sync" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}</button><button className="btn" onClick={() => onTest(provider.id)}>{t.test}</button>{provider.oauth && <button className="btn" onClick={() => onOAuth(provider.id, Boolean(provider.oauth?.accessToken))}>{provider.oauth.accessToken ? t.disconnect : t.connect}</button>}<button className="btn icon-btn" onClick={() => onEdit(provider)} aria-label={t.edit} title={t.edit}><Edit3 size={15} /></button><button className="btn icon-btn" onClick={() => onDuplicate(provider)} aria-label={t.duplicate} title={t.duplicate}><CopyPlus size={15} /></button><button className="btn icon-btn danger" onClick={() => onDelete(provider.id)} aria-label={t.remove} title={t.remove}><Trash2 size={15} /></button></div></div>)}</div>;
}

function ProviderInspector({ provider, t, onEdit, onTest, onOAuth, onSync, busy }: { provider?: Provider; t: Copy; onEdit: (provider: Provider) => void; onTest: (id: string) => void; onOAuth: (id: string, disconnect?: boolean) => void; onSync: (id: string) => void; busy: Busy }) {
  if (!provider) return <aside className="card provider-inspector"><h2>{t.inspector}</h2><EmptyState title={t.noProviderSelected} text={t.chooseProvider} /></aside>;
  return <aside className="card provider-inspector"><div className="section-head"><div><span className="eyebrow"><PanelRightOpen size={14} /> {t.inspector}</span><h2>{provider.name}</h2></div><span className={`sync-pill ${provider.modelSync?.status || "idle"}`}>{provider.modelSync?.status || "idle"}</span></div><div className="inspector-grid"><div><span>{t.format}</span><strong>{provider.format}</strong></div><div><span>{t.keys}</span><strong>{provider.keys.length}</strong></div><div><span>{t.modelsCount}</span><strong>{provider.models.length}</strong></div><div><span>{t.timeout}</span><strong>{provider.timeoutMs || 120000} ms</strong></div></div><div className="inspector-section"><span className="muted small">{t.baseUrl}</span><code>{provider.baseUrl}</code></div><div className="chip-row">{provider.capabilities.map((capability) => <span className="tag" key={capability}>{capability}</span>)}</div><div className="inspector-section"><span className="muted small">{t.relays}</span>{provider.relays?.length ? provider.relays.map((relay) => <div className="relay-mini" key={relay.id}><span className="pulse-dot" /><div><strong>{relay.name}</strong><div className="mono muted truncate">{relay.url}</div></div></div>) : <p className="muted">{t.directRouting}</p>}</div><div className="inspector-actions"><button className="btn primary" onClick={() => onTest(provider.id)}>{t.test}</button><button className="btn" onClick={() => onSync(provider.id)} disabled={busy === "sync" || provider.format !== "openai"}><RefreshCw size={15} />{t.sync}</button>{provider.oauth && <button className="btn" onClick={() => onOAuth(provider.id, Boolean(provider.oauth?.accessToken))}>{provider.oauth.accessToken ? t.disconnect : t.connect}</button>}<button className="btn" onClick={() => onEdit(provider)}><Edit3 size={15} />{t.edit}</button></div></aside>;
}

function HealthNetwork({ providers, compact = false, t }: { providers: Provider[]; compact?: boolean; t: Copy }) {
  if (!providers.length) return <EmptyState title={t.noHealth} text={t.noHealthHint} />;
  return <div className={`health-network ${compact ? "compact" : ""}`}>{providers.map((provider, index) => <div className="health-segment" key={provider.id}><div className={`health-node ${provider.enabled ? "online" : "offline"}`}><Server size={16} /><strong>{provider.name}</strong><span>{provider.models.length} models</span></div>{index < providers.length - 1 && <span className="health-connector" />}</div>)}</div>;
}

function RouteCard({ alias, targets, providerName, onOpen, onDelete, compact = false, t }: { alias: string; targets: Target[]; providerName: (id: string) => string; onOpen: (alias: string) => void; onDelete: (alias: string) => void; compact?: boolean; t: Copy }) {
  return <article className={`card route-card clickable ${compact ? "compact" : ""}`} onClick={() => onOpen(alias)}><div className="section-head"><div className="min-0"><h2 className="mono truncate">{alias}</h2><span className="muted">{targets.length} {t.targets}</span></div><button className="btn icon-btn danger" onClick={(event) => { event.stopPropagation(); void onDelete(alias); }} aria-label={t.deleteRoute}><Trash2 size={15} /></button></div><div className="route-chain">{targets.map((target, index) => <div className="route-step" key={`${target.providerId}-${target.model}-${index}`}><div className="route-node"><span>{target.priority || index + 1}</span><div className="min-0"><strong>{providerName(target.providerId)}</strong><div className="mono muted truncate">{target.model}</div><div className="muted small">retry {target.retry || 0} - timeout {target.timeoutMs || "provider"} ms</div></div></div>{index < targets.length - 1 && <span className="route-connector" />}</div>)}</div></article>;
}

function CommandPalette({ query, setQuery, commands, onClose, t }: { query: string; setQuery: (value: string) => void; commands: { id: string; label: string; hint: string; Icon: LucideIcon; run: () => void }[]; onClose: () => void; t: Copy }) {
  return <div className="modal command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-title"><div className="command-search"><Command size={18} /><input autoFocus placeholder={t.commandHint} aria-label={t.commandPalette} value={query} onChange={(event) => setQuery(event.target.value)} /><button className="btn icon-btn" onClick={onClose} aria-label={t.close}><X size={16} /></button></div><h2 id="command-title">{t.commandPalette}</h2><div className="command-list">{commands.map(({ id, label, hint, Icon, run }) => <button key={id} onClick={() => { run(); onClose(); }}><Icon size={17} /><span><strong>{label}</strong><small>{hint}</small></span><Zap size={14} /></button>)}{commands.length === 0 && <EmptyState title={t.noCommand} text={t.noCommandHint} />}</div></section></div>;
}

function ProviderDialog({ draft, setDraft, error, detectStatus, detectError, busy, t, onDetect, onClose, onSave, locale }: { locale: "id" | "en"; draft: ProviderDraft; setDraft: (draft: ProviderDraft) => void; error: string; detectStatus: string; detectError: boolean; busy: Busy; t: Copy; onDetect: () => void; onClose: () => void; onSave: () => void }) {
  return <div className="modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title"><div className="section-head"><h2 id="provider-dialog-title">{draft.id ? t.edit : t.addProvider}</h2><button className="btn icon-btn" onClick={onClose} aria-label={t.fClose}><X size={16} /></button></div><div className="form"><div className="row"><Field label={t.fName}><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field><Field label={t.fApiFormat}><select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as Provider["format"] })}><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic native</option><option value="gemini">Gemini native</option></select></Field></div><Field label={t.fBaseUrl}><input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://integrate.api.nvidia.com/v1" /></Field><label className="switch-row"><span>{locale === "en" ? "Provider enabled" : "Provider aktif"}</span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /></label><Field label={t.fApiKeys}><textarea value={draft.keys} onChange={(event) => setDraft({ ...draft, keys: event.target.value })} rows={3} /></Field><div className="detect-row"><button className={`btn detect-btn${busy === "detect" ? " is-busy" : ""}`} onClick={onDetect} disabled={busy === "detect" || draft.format !== "openai"} aria-busy={busy === "detect"}>{busy === "detect" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}{busy === "detect" ? (t.fDetecting || "detecting ...") : t.fDetect}</button><span role="status" aria-live="polite" className={`detect-status${detectError ? " error" : ""}${busy === "detect" ? " busy" : ""}`}>{detectStatus || t.fDetectHint}</span></div><Field label={t.fModels}><textarea value={draft.models} onChange={(event) => setDraft({ ...draft, models: event.target.value })} rows={4} placeholder="model-a,model-b" /></Field><Field label={t.fCapabilities}><input value={draft.capabilities} onChange={(event) => setDraft({ ...draft, capabilities: event.target.value })} /></Field><details open><summary>{t.fPricingSection}</summary><div className="form inset"><Field label={t.fPricingMode}><select value={draft.pricingMode} onChange={(event) => setDraft({ ...draft, pricingMode: event.target.value as PricingMode })}><option value="auto">{locale === "en" ? "Auto - estimate every provider/model" : "Auto - estimasi semua provider/model"}</option><option value="free">{locale === "en" ? "Free - cost always $0" : "Free - cost selalu $0"}</option><option value="fixed">{locale === "en" ? "Fixed provider price" : "Harga tetap provider"}</option><option value="custom">{locale === "en" ? "Custom/internal cost" : "Cost custom/internal"}</option><option value="unknown">{locale === "en" ? "Unknown - show N/A" : "Tidak diketahui - tampilkan N/A"}</option></select></Field>{(draft.pricingMode === "fixed" || draft.pricingMode === "custom") && <div className="row"><Field label={t.fInputPrice}><input type="number" min={0} step="0.000001" value={draft.inputPerMillion} onChange={(event) => setDraft({ ...draft, inputPerMillion: Number(event.target.value) })} /></Field><Field label={t.fOutputPrice}><input type="number" min={0} step="0.000001" value={draft.outputPerMillion} onChange={(event) => setDraft({ ...draft, outputPerMillion: Number(event.target.value) })} /></Field></div>}<div className="muted small">{t.fPricingNote}</div></div></details><details><summary>{t.fHeadersSection}</summary><div className="form inset"><Field label={t.fHeaders}><textarea value={draft.headers} onChange={(event) => setDraft({ ...draft, headers: event.target.value })} rows={2} /></Field><Field label={t.fRelays}><textarea value={draft.relays} onChange={(event) => setDraft({ ...draft, relays: event.target.value })} rows={3} /></Field><Field label={t.fRelayMode}><select value={draft.relayMode} onChange={(event) => setDraft({ ...draft, relayMode: event.target.value as NonNullable<Provider["relayMode"]> })}><option value="direct">{locale === "en" ? "Direct, then relay" : "Direct, lalu relay"}</option><option value="prefer">{locale === "en" ? "Relay, then direct" : "Relay, lalu direct"}</option><option value="only">{locale === "en" ? "Relay only" : "Relay saja"}</option></select></Field></div></details><details><summary>{t.fOauthSection}</summary><div className="form inset"><label className="switch-row"><span>{t.fOauthEnable}</span><input type="checkbox" checked={draft.oauthEnabled} onChange={(event) => setDraft({ ...draft, oauthEnabled: event.target.checked })} /></label>{draft.oauthEnabled && <><div className="row"><Field label={t.fAuthorizeUrl}><input value={draft.authorizeUrl} onChange={(event) => setDraft({ ...draft, authorizeUrl: event.target.value })} /></Field><Field label={t.fTokenUrl}><input value={draft.tokenUrl} onChange={(event) => setDraft({ ...draft, tokenUrl: event.target.value })} /></Field></div><div className="row"><Field label={t.fClientId}><input value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} /></Field><Field label={t.fClientSecret}><input type="password" value={draft.clientSecret} onChange={(event) => setDraft({ ...draft, clientSecret: event.target.value })} /></Field></div><Field label={t.fScopes}><input value={draft.scopes} onChange={(event) => setDraft({ ...draft, scopes: event.target.value })} /></Field></>}</div></details>{error && <div className="error">{error}</div>}<div className="dialog-actions"><button className="btn" onClick={onClose}>{t.cancel}</button><button className="btn primary" onClick={onSave} disabled={busy === "save-provider"}>{busy === "save-provider" && <Loader2 size={15} className="spin" />}{t.save}</button></div></div></section></div>;
}

function RouteDialog({ routeDraft, setRouteDraft, providers, error, busy, dragIndex, setDragIndex, patchTarget, moveTarget, onClose, onSave, t, locale }: { locale: "id" | "en"; routeDraft: RouteDraft; setRouteDraft: (draft: RouteDraft) => void; providers: Provider[]; error: string; busy: Busy; dragIndex: number | null; setDragIndex: (index: number | null) => void; patchTarget: (index: number, patch: Partial<Target>) => void; moveTarget: (from: number, to: number) => void; onClose: () => void; onSave: () => void; t: Copy }) {
  return <div className="modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog route-dialog" role="dialog" aria-modal="true" aria-labelledby="route-dialog-title"><div className="section-head"><h2 id="route-dialog-title">{routeDraft.originalAlias ? t.fEditRoute : t.addRoute}</h2><button className="btn icon-btn" onClick={onClose} aria-label={t.fClose}><X size={16} /></button></div><div className="form"><Field label={t.fAlias}><input value={routeDraft.alias} onChange={(event) => setRouteDraft({ ...routeDraft, alias: event.target.value })} placeholder="smart" /></Field><div className="route-targets">{routeDraft.targets.map((target, index) => <div className="target-editor" key={index} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) moveTarget(dragIndex, index); setDragIndex(null); }}><div className="drag-handle"><ChevronsUpDown size={16} /></div><Field label={t.fProvider}><select value={target.providerId} onChange={(event) => patchTarget(index, { providerId: event.target.value })}><option value="">Provider</option>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></Field><Field label={t.fModel}><select value={target.model} onChange={(event) => patchTarget(index, { model: event.target.value })}><option value="">Model</option>{providers.find((provider) => provider.id === target.providerId)?.models.map((model) => <option value={model} key={model}>{model}</option>)}</select></Field><Field label={t.fPriority}><input type="number" min={1} value={target.priority || index + 1} onChange={(event) => patchTarget(index, { priority: Number(event.target.value) })} /></Field><Field label={t.fRetry}><input type="number" min={0} value={target.retry || 0} onChange={(event) => patchTarget(index, { retry: Number(event.target.value) })} /></Field><Field label={t.fTimeout}><input type="number" min={1000} value={target.timeoutMs || ""} onChange={(event) => patchTarget(index, { timeoutMs: Number(event.target.value) })} /></Field><div className="target-actions"><button className="btn icon-btn" onClick={() => moveTarget(index, index - 1)} aria-label={t.fMoveUp}><ChevronDown className="rotate" size={15} /></button><button className="btn icon-btn" onClick={() => moveTarget(index, index + 1)} aria-label={t.fMoveDown}><ChevronDown size={15} /></button><button className="btn icon-btn danger" onClick={() => setRouteDraft({ ...routeDraft, targets: routeDraft.targets.filter((_, targetIndex) => targetIndex !== index) })} aria-label={t.fRemoveTarget}><Trash2 size={15} /></button></div></div>)}</div><button className="btn" onClick={() => setRouteDraft({ ...routeDraft, targets: [...routeDraft.targets, { ...emptyTarget(), priority: routeDraft.targets.length + 1 }] })}><Plus size={15} />{t.fAddTarget}</button>{error && <div className="error">{error}</div>}<div className="dialog-actions"><button className="btn" onClick={onClose}>{t.cancel}</button><button className="btn primary" onClick={onSave} disabled={busy === "save-route"}>{busy === "save-route" && <Loader2 size={15} className="spin" />}{t.save}</button></div></div></section></div>;
}
