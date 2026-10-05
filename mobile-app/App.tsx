import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Updates from "expo-updates";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import VisitBrief from "./VisitBrief";
import { createPrivateStateStore } from "./private-state-store";
import { createPrivateFileActions } from "./private-file-actions";
import { requestAccountResource, SessionExpiredError } from "./account-resource";
import { createHealthDataCoordinator } from "./health-data-coordinator";
import { createPickerCache } from "./picker-cache";

const API = "https://www.doctoraiworld.com";
const STORE_MANIFEST = "doctorai-mobile-private-state-v1";
const STORE_CHUNK_PREFIX = "doctorai-mobile-private-state-chunk-";
const TOKEN_KEY = "doctorai-mobile-access-token-v1";
const MEDICATION_ACK_KEY = "doctorai-medication-alert-ack-v1";
const SECURE_STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// Native builds use encrypted SecureStore. The browser-only layout preview is
// deliberately temporary and never writes health records to browser storage.
const browserPreviewState = new Map<string, string>();
const privateStateStorage = {
  get: (key: string) => Platform.OS === "web" ? Promise.resolve(browserPreviewState.get(key) ?? null) : SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS),
  set: (key: string, value: string) => Platform.OS === "web" ? Promise.resolve(void browserPreviewState.set(key, value)) : SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
  remove: (key: string) => Platform.OS === "web" ? Promise.resolve(void browserPreviewState.delete(key)) : SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS),
};
const createScopedPrivateStateStore = (scope: string, medicationAckKey: string) => createPrivateStateStore({
  storage: privateStateStorage,
  manifestKey: scope === "device" ? STORE_MANIFEST : `${STORE_MANIFEST}-${scope}`,
  chunkPrefix: scope === "device" ? STORE_CHUNK_PREFIX : `${STORE_CHUNK_PREFIX}${scope}-`,
  createGeneration: () => Crypto.randomUUID().replace(/-/g, ""),
  auxiliaryKeys: [medicationAckKey],
});
const privateStateStore = createScopedPrivateStateStore("device", MEDICATION_ACK_KEY);
const accountStateStores = new Map<string, ReturnType<typeof createPrivateStateStore>>();
async function privateStateStoreForAccount(email: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("DoctorAI could not identify the signed-in account.");
  const digest = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizedEmail)).toLowerCase();
  const scope = `account-${digest}`;
  const medicationAckKey = `${MEDICATION_ACK_KEY}-${digest}`;
  if (!accountStateStores.has(scope)) accountStateStores.set(scope, createScopedPrivateStateStore(scope, medicationAckKey));
  return { scope, medicationAckKey, store: accountStateStores.get(scope)! };
}
const pickerCache = Platform.OS !== "web" && FileSystem.cacheDirectory
  ? createPickerCache(FileSystem.cacheDirectory, uri => FileSystem.deleteAsync(uri, { idempotent: true })) : null;
const privateFiles = Platform.OS !== "web" && FileSystem.cacheDirectory ? createPrivateFileActions({
  api: API,
  cacheRoot: `${FileSystem.cacheDirectory}doctorai-private-exports/`,
  createId: () => Crypto.randomUUID(),
  files: {
    prepare: directory => FileSystem.makeDirectoryAsync(directory, { intermediates: true }),
    download: async (url, file, headers) => {
      const result = await FileSystem.downloadAsync(url, file, { headers });
      const contentType = Object.entries(result.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";
      return { status: result.status, contentType };
    },
    write: (file, value) => FileSystem.writeAsStringAsync(file, value, { encoding: FileSystem.EncodingType.UTF8 }),
    contentUri: file => Platform.OS === "android" ? FileSystem.getContentUriAsync(file) : Promise.resolve(file),
    remove: directory => FileSystem.deleteAsync(directory, { idempotent: true }),
  },
  view: async (uri, type) => {
    if (Platform.OS === "android") {
      try { await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: uri, flags: 1, type }); }
      catch { throw new Error("A document viewer could not open this file. Install a compatible viewer on this device and retry."); }
    }
    else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: type, dialogTitle: "Open or save your private document" });
    else throw new Error("Document viewing is unavailable on this device.");
  },
  share: async (file, type) => {
    if (!await Sharing.isAvailableAsync()) throw new Error("File export is unavailable on this device.");
    await Sharing.shareAsync(file, { mimeType: type, dialogTitle: "Save your private DoctorAI export" });
  },
}) : null;
type Tab =
  | "today"
  | "ask"
  | "health"
  | "medications"
  | "appointments"
  | "research"
  | "results"
  | "timeline"
  | "documents";
type Message = { id: string; role: "user" | "assistant"; content: string };
type Medication = {
  id: string;
  name: string;
  dose: string;
  time: string;
  frequency: string;
  instructions: string;
  supply: string;
  refill: string;
  startDate?: string;
  endDate?: string;
  prescriptionExpiry?: string;
  repeats?: string;
  takenToday?: boolean;
};
type Appointment = {
  id: string;
  title: string;
  provider: string;
  date: string;
  time: string;
  location: string;
  notes: string;
};
type Provider = {
  id: string;
  name: string;
  practice: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};
type Measurement = { id: string; type: string; value: string; date: string };
type Profile = {
  conditions: string;
  allergies: string;
  bloodType: string;
  emergency: string;
  notes: string;
};
type TimelineEntry = { id: string; type: string; date: string; title: string; description: string; icon?: string; source?: string };
type HealthDocument = { id: string; category: string; type: string; title: string; description: string; date: string; size: string; createdAt?: number };
type Account = { sub: string; email: string; name?: string; picture?: string };
type State = {
  medications: Medication[];
  appointments: Appointment[];
  providers: Provider[];
  measurements: Measurement[];
  timeline: TimelineEntry[];
  documents: HealthDocument[];
  tasks: Array<{ id: string; title: string; done?: boolean }>;
  messages: Message[];
  profile: Profile;
  memoryEnabled: boolean;
  memoryDetails: string[];
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
};

const empty: State = {
  medications: [],
  appointments: [],
  providers: [],
  measurements: [],
  timeline: [],
  documents: [],
  tasks: [],
  messages: [],
  profile: {
    conditions: "",
    allergies: "",
    bloodType: "",
    emergency: "",
    notes: "",
  },
  memoryEnabled: false,
  memoryDetails: [],
  largeText: false,
  highContrast: false,
  reduceMotion: true,
};
const C = {
  navy: "#071b36",
  blue: "#0d75f5",
  cyan: "#dff9ff",
  mint: "#e5fbf4",
  violet: "#a58aff",
  coral: "#ff8b78",
  yellow: "#ffd96e",
  bg: "#f7fbff",
  muted: "#55728d",
  line: "#d8e7f2",
  white: "#fff",
  green: "#178a68",
  red: "#b9303f",
  amber: "#9b6a15",
};
const tabs: Array<[Tab, string, string]> = [
  ["today", "Today", "⌂"],
  ["ask", "Ask DoctorAI", "✦"],
  ["health", "My Health", "♡"],
  ["medications", "Medicines", "▣"],
  ["appointments", "Appointments", "◷"],
  ["research", "Research", "✧"],
  ["results", "Results", "⌁"],
  ["timeline", "Timeline", "☷"],
  ["documents", "Documents", "▤"],
];
const makeId = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const dateLabel = () =>
  new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const blankMed = (): Medication => ({
  id: "",
  name: "",
  dose: "",
  time: "",
  frequency: "",
  instructions: "",
  supply: "",
  refill: "",
  takenToday: false,
});
const blankAppt = (): Appointment => ({
  id: "",
  title: "",
  provider: "",
  date: "",
  time: "",
  location: "",
  notes: "",
});
const blankProvider = (): Provider => ({
  id: "",
  name: "",
  practice: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
});
const normaliseState = (saved: any): State => ({
  ...empty,
  ...(saved || {}),
  medications: Array.isArray(saved?.medications) ? saved.medications : [],
  appointments: Array.isArray(saved?.appointments) ? saved.appointments : [],
  providers: Array.isArray(saved?.providers) ? saved.providers : [],
  measurements: Array.isArray(saved?.measurements) ? saved.measurements : [],
  timeline: Array.isArray(saved?.timeline) ? saved.timeline : [],
  documents: Array.isArray(saved?.documents) ? saved.documents : [],
  tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
  messages: Array.isArray(saved?.messages) ? saved.messages : [],
  memoryDetails: Array.isArray(saved?.memoryDetails) ? saved.memoryDetails : [],
  profile: { ...empty.profile, ...(saved?.profile || {}) },
});
const healthStateForSync = (state: State) => ({
  medications: state.medications,
  appointments: state.appointments,
  providers: state.providers,
  timeline: state.timeline,
  documents: state.documents,
  measurements: state.measurements,
  tasks: state.tasks,
  profile: state.profile,
  memoryEnabled: state.memoryEnabled,
  memoryDetails: state.memoryDetails,
});
const hasHealthData = (state: State) => Boolean(
  state.medications.length || state.appointments.length || state.providers.length || state.measurements.length ||
  state.timeline.length || state.documents.length || state.tasks.length ||
  state.memoryDetails.length || Object.values(state.profile).some(Boolean),
);

export default function App() {
  const [state, setState] = useState<State>(empty);
  const [hydrated, setHydrated] = useState(false);
  const [localLoadError, setLocalLoadError] = useState(false);
  const [localSaveError, setLocalSaveError] = useState(false);
  const localSaveAttempt = useRef(0);
  const privateFileBusy = useRef(false);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [appUpdateReady, setAppUpdateReady] = useState(false);
  const [updateRestartBusy, setUpdateRestartBusy] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const deletingDataRef = useRef(false);
  const healthRevision = useRef(0);
  const healthJobs = useRef(createHealthDataCoordinator()).current;
  const renderEpoch = healthJobs.epoch();
  const [clearedRecordVersion, setClearedRecordVersion] = useState(0);
  const [tab, setTab] = useState<Tab>("today");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const scanPromptOpen = useRef(false);
  const [settings, setSettings] = useState(false);
  const [med, setMed] = useState(blankMed());
  const [appt, setAppt] = useState(blankAppt());
  const [providerForm, setProviderForm] = useState(blankProvider());
  const [measure, setMeasure] = useState({ type: "Weight", value: "" });
  const [editing, setEditing] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [subscription, setSubscription] = useState<{ active: boolean; expiresAt?: number | null }>({ active: false });
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const activePrivateStateStore = useRef(privateStateStore);
  const activeStorageScope = useRef("device");
  const activeMedicationAckKey = useRef(MEDICATION_ACK_KEY);
  const accountRevision = useRef(0);
  const pauseLocalSave = useRef(false);
  const deviceStateSnapshot = useRef<State>(empty);
  const deviceUpdatedAt = useRef(0);
  const [syncStatus, setSyncStatus] = useState("Private data saved on this device");
  const [researchTopic, setResearchTopic] = useState("");
  const [researchItems, setResearchItems] = useState<any[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const suppressCloudSyncOnce = useRef(false);
  const updatedAt = useRef(0);

  useEffect(() => {
    if (__DEV__) return;
    let active = true;
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!active || !update.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (active) setAppUpdateReady(true);
      } catch {
        // A network or update-service outage must never block access to the
        // last verified embedded app bundle.
      }
    })();
    return () => { active = false; };
  }, []);

  const apiFetch = (path: string, init: RequestInit = {}) => fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers || {}),
      ...(account?.sub ? { "x-doctorai-expected-sub": account.sub } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  function resetAccountScopedDrafts() {
    setTab("today");
    setSettings(false);
    setQuestion("");
    setBusy(false);
    setScanBusy(false);
    scanPromptOpen.current = false;
    setMed(blankMed());
    setAppt(blankAppt());
    setProviderForm(blankProvider());
    setMeasure({ type: "Weight", value: "" });
    setEditing(false);
    setResearchTopic("");
    setResearchItems([]);
    setResearchBusy(false);
    setOpeningDocument(null);
    setExportBusy(false);
  }
  function restoreDeviceScope(saved: State) {
    activePrivateStateStore.current = privateStateStore;
    activeStorageScope.current = "device";
    activeMedicationAckKey.current = MEDICATION_ACK_KEY;
    updatedAt.current = deviceUpdatedAt.current;
    setState(saved);
    setAccount(null);
    setAccessToken(null);
    setSubscription({ active: false });
    setClearedRecordVersion(value => value + 1);
    resetAccountScopedDrafts();
  }
  async function refreshAccount(token: string) {
    const revision = accountRevision.current;
    const healthAtStart = healthRevision.current;
    const identity = await requestAccountResource(API, "/api/auth/google", token);
    if (identity.status === 401 || identity.status === 403) throw new SessionExpiredError();
    if (!identity.ok || !String(identity.payload?.user?.email || "").trim() || !String(identity.payload?.user?.sub || "").trim()) throw new Error("DoctorAI could not verify the signed-in account.");
    const user = identity.payload.user as Account;
    const scoped = await privateStateStoreForAccount(user.email);
    const stored = await scoped.store.read();
    const local = stored?.raw ? normaliseState(JSON.parse(stored.raw)) : empty;
    if (revision !== accountRevision.current) return false;

    activePrivateStateStore.current = scoped.store;
    activeStorageScope.current = scoped.scope;
    activeMedicationAckKey.current = scoped.medicationAckKey;
    updatedAt.current = Number(stored?.updatedAt) || 0;
    pauseLocalSave.current = true;
    setState(local);
    setAccount(user);
    setAccessToken(token);
    setClearedRecordVersion(value => value + 1);
    resetAccountScopedDrafts();
    suppressCloudSyncOnce.current = false;

    const unavailable = { ok: false, status: 0, payload: {} };
    const [entitlementResult, cloud] = await Promise.all([
      requestAccountResource(API, "/api/stripe/entitlement", token, { expectedSub: user.sub }).catch(() => unavailable),
      requestAccountResource(API, "/api/health/state", token, { expectedSub: user.sub }).catch(() => unavailable),
    ]);
    if (revision !== accountRevision.current) return false;
    const entitlement = entitlementResult.ok ? entitlementResult.payload : { active: false };
    setSubscription({ active: entitlement?.active === true, expiresAt: entitlement?.expiresAt || null });
    const cloudPayload = cloud.payload;
    let syncMessage = "";
    if (cloud.ok && cloudPayload.state) {
      const cloudUpdatedAt = Number(cloudPayload.updatedAt || 0);
      if (healthRevision.current === healthAtStart && (cloudUpdatedAt >= (Number(stored?.updatedAt) || 0) || !hasHealthData(local))) {
        setState(current => revision === accountRevision.current && healthRevision.current === healthAtStart ? ({ ...normaliseState(cloudPayload.state), messages: current.messages, largeText: current.largeText, highContrast: current.highContrast, reduceMotion: current.reduceMotion }) : current);
        updatedAt.current = cloudUpdatedAt || Date.now();
      }
      syncMessage = healthRevision.current === healthAtStart ? "Account data checked" : "New device changes waiting to sync";
    } else if (cloudPayload.code === "secure_storage_not_configured") {
      syncMessage = "Account data remains on this device until storage is connected";
    } else if (!cloud.ok) {
      syncMessage = "Account sync unavailable — this account's device entries remain available";
    } else {
      syncMessage = hasHealthData(local) ? "This account's saved entries are ready to sync" : "No health entries saved in this account yet";
    }
    if (hasHealthData(deviceStateSnapshot.current)) syncMessage += " · older device-only entries remain separate";
    setSyncStatus(syncMessage);
    return true;
  }

  async function loadDeviceState() {
    setHydrated(false);
    setCloudReady(false);
    pauseLocalSave.current = true;
    let saved: State;
    try {
      await privateFiles?.clearCache();
      await pickerCache?.clear();
      const stored = await privateStateStore.read();
      saved = stored?.raw ? normaliseState(JSON.parse(stored.raw)) : empty;
      deviceUpdatedAt.current = Number(stored?.updatedAt) || 0;
      deviceStateSnapshot.current = saved;
      setLocalLoadError(false);
    } catch {
      setLocalLoadError(true);
      setHydrated(true);
      pauseLocalSave.current = false;
      return;
    }
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS);
      if (token) {
        accountRevision.current += 1;
        try {
          const loaded = await refreshAccount(token);
          if (!loaded) throw new Error("The account changed before its data finished loading.");
        } catch (error) {
          if (error instanceof SessionExpiredError) {
            await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS).catch(() => {});
            setSyncStatus("Sign in to sync your DoctorAI account");
          } else setSyncStatus("Account check unavailable — showing the separate device-only record");
          restoreDeviceScope(saved);
        }
      } else {
        restoreDeviceScope(saved);
        setSyncStatus("Device-only health information");
      }
    } catch {
      restoreDeviceScope(saved);
      setSyncStatus("Account check unavailable — showing the separate device-only record");
    } finally {
      pauseLocalSave.current = false;
      setHydrated(true);
      setCloudReady(true);
    }
  }
  async function saveDeviceState() {
    const attempt = ++localSaveAttempt.current;
    const store = activePrivateStateStore.current;
    const scope = activeStorageScope.current;
    const snapshot = state;
    const timestamp = updatedAt.current || Date.now();
    try {
      await store.write(snapshot, timestamp);
      if (scope === "device" && activeStorageScope.current === "device") {
        deviceStateSnapshot.current = snapshot;
        deviceUpdatedAt.current = timestamp;
      }
      if (attempt === localSaveAttempt.current) setLocalSaveError(false);
      return true;
    } catch {
      if (attempt === localSaveAttempt.current) setLocalSaveError(true);
      return false;
    }
  }
  async function restartWithUpdate() {
    if (updateRestartBusy || deletingDataRef.current) return;
    setUpdateRestartBusy(true);
    if (!await saveDeviceState()) {
      setLocalSaveError(true);
      setUpdateRestartBusy(false);
      Alert.alert("Restart postponed", "Your latest entries could not be saved on this device. Keep the app open and retry saving before restarting.");
      return;
    }
    try { await Updates.reloadAsync(); }
    catch { Alert.alert("Update unavailable", "Your entries were saved. Close and reopen DoctorAI when you are ready."); }
    finally { setUpdateRestartBusy(false); }
  }
  useEffect(() => {
    void loadDeviceState();
  }, []);
  useEffect(() => {
    if (hydrated && !localLoadError && !deletingData && !pauseLocalSave.current) void saveDeviceState();
  }, [state, hydrated, localLoadError, deletingData, account]);
  useEffect(() => {
    if (!hydrated || localLoadError || deletingData || !cloudReady || !accessToken) return;
    if (suppressCloudSyncOnce.current) {
      suppressCloudSyncOnce.current = false;
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const controller = new AbortController();
    syncAbort.current = controller;
    syncTimer.current = setTimeout(() => { void healthJobs.track((async () => {
      try {
        setSyncStatus("Saving private account data…");
        const response = await apiFetch("/api/health/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: healthStateForSync(state) }), signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!deletingDataRef.current) setSyncStatus(response.ok ? "Private data synced" : payload.code === "secure_storage_not_configured" ? "Private data saved on this device until secure storage is connected" : "Private data saved on this device");
      } catch { if (!deletingDataRef.current) setSyncStatus("Private data saved on this device"); }
    })());
    }, 900);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (!deletingDataRef.current) controller.abort();
      if (syncAbort.current === controller) syncAbort.current = null;
    };
  }, [state, hydrated, localLoadError, deletingData, cloudReady, accessToken]);
  const theme = useMemo(
    () =>
      state.highContrast
        ? { ...C, bg: "#e7f1f7", muted: "#304e60", line: "#8ab3c5" }
        : C,
    [state.highContrast],
  );
  const scale = state.largeText ? 1.16 : 1;
  const title = (
    {
      today: "Your health, at a glance",
      ask: "Ask DoctorAI",
      health: "My Health",
      medications: "Medications",
      appointments: "Appointments",
      research: "Latest medical research",
      results: "Tests & results",
      timeline: "Health timeline",
      documents: "Medical documents",
    } as Record<Tab, string>
  )[tab];
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>(),
      dupes = new Set<string>();
    state.medications.forEach((m) => {
      const k = normalize(m.name) + ":" + normalize(m.dose);
      if (seen.has(k)) dupes.add(k);
      seen.add(k);
    });
    return dupes;
  }, [state.medications]);
  const update = (p: Partial<State>) => {
    if (deletingDataRef.current || pauseLocalSave.current || !healthJobs.isCurrent(renderEpoch)) return;
    if (Object.keys(p).some(key => !["messages", "largeText", "highContrast", "reduceMotion"].includes(key))) {
      healthRevision.current++;
      updatedAt.current = Date.now();
    }
    setState((s) => ({ ...s, ...p }));
  };
  const select = useCallback((t: Tab) => {
    setTab(t);
    setSettings(false);
  }, []);
  async function signIn() {
    if (authBusy || deletingDataRef.current) return;
    setAuthBusy(true);
    setCloudReady(false);
    const authState = `${Crypto.randomUUID().replace(/-/g, "")}${Crypto.randomUUID().replace(/-/g, "")}`;
    let candidateToken: string | null = null;
    let tokenSaved = false;
    try {
      const url = `${API}/mobile-auth?state=${encodeURIComponent(authState)}&return=${encodeURIComponent("doctorai://auth")}`;
      const result = await WebBrowser.openAuthSessionAsync(url, "doctorai://auth", { preferEphemeralSession: true });
      if (result.type !== "success" || !result.url) return;
      const query = ExpoLinking.parse(result.url).queryParams || {};
      const returnedState = Array.isArray(query.state) ? query.state[0] : query.state;
      candidateToken = Array.isArray(query.token) ? query.token[0] : query.token as string;
      if (returnedState !== authState || typeof candidateToken !== "string" || candidateToken.length < 40) throw new Error("The secure sign-in response could not be verified.");
      if (!await saveDeviceState()) throw new Error("Sign-in was paused because the device-only record could not be saved. Retry saving before continuing.");
      pauseLocalSave.current = true;
      accountRevision.current++;
      healthRevision.current++;
      healthJobs.invalidate();
      await privateFiles?.clearCache();
      await pickerCache?.clear();
      setState(empty);
      setAccount(null);
      setAccessToken(null);
      setSubscription({ active: false });
      setClearedRecordVersion(value => value + 1);
      resetAccountScopedDrafts();
      const loaded = await refreshAccount(candidateToken);
      if (!loaded) throw new Error("The signed-in account could not finish loading.");
      await SecureStore.setItemAsync(TOKEN_KEY, candidateToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      tokenSaved = true;
      pauseLocalSave.current = false;
      setCloudReady(true);
      Alert.alert("Signed in", "Your account data is ready. Existing device-only entries stayed separate and were not added to this account.");
    } catch (error) {
      if (tokenSaved || candidateToken) await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS).catch(() => {});
      restoreDeviceScope(deviceStateSnapshot.current);
      pauseLocalSave.current = false;
      Alert.alert("Sign-in unavailable", error instanceof Error ? error.message : "Google sign-in could not be completed.");
    } finally { pauseLocalSave.current = false; setAuthBusy(false); setCloudReady(true); }
  }
  async function signOut() {
    if (authBusy || deletingDataRef.current) return;
    setAuthBusy(true);
    setCloudReady(false);
    pauseLocalSave.current = true;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = null;
    syncAbort.current?.abort();
    if (!await healthJobs.waitForPending(8000)) {
      pauseLocalSave.current = false;
      setCloudReady(true);
      setAuthBusy(false);
      Alert.alert("Sign-out postponed", "A health upload or sync is still finishing. Reconnect and retry so the current account's saved state stays complete.");
      return;
    }
    healthJobs.invalidate();
    healthRevision.current++;
    accountRevision.current++;
    if (!await saveDeviceState()) {
      pauseLocalSave.current = false;
      setCloudReady(true);
      setAuthBusy(false);
      Alert.alert("Sign-out postponed", "The current account's device record could not be confirmed saved. Keep the app open and retry before signing out.");
      return;
    }
    let serverSessionRevoked = !accessToken;
    try {
      if (accessToken) {
        const response = await requestAccountResource(API, "/api/auth/google", accessToken, { method: "DELETE", expectedSub: account?.sub });
        serverSessionRevoked = response.ok;
      }
    } catch {}
    let deviceTokenRemoved = true;
    try { await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS); }
    catch { deviceTokenRemoved = false; }
    if (!deviceTokenRemoved) {
      pauseLocalSave.current = false;
      setCloudReady(true);
      setAuthBusy(false);
      Alert.alert("Session cleanup incomplete", "DoctorAI stopped using this session, but could not confirm removal of the saved device sign-in. Keep the app open and retry before closing it.", [{ text: "Retry cleanup", onPress: () => void signOut() }]);
      return;
    }
    await privateFiles?.clearCache().catch(() => {});
    await pickerCache?.clear().catch(() => {});
    restoreDeviceScope(deviceStateSnapshot.current);
    pauseLocalSave.current = false;
    setCloudReady(true);
    setSyncStatus("Device-only health information");
    setAuthBusy(false);
    Alert.alert(
      serverSessionRevoked ? "Signed out" : "Signed out on this device",
      serverSessionRevoked
        ? "Your DoctorAI session was revoked. Your account entries remain stored under that account; device-only entries are shown separately."
        : "The saved device sign-in was removed. DoctorAI could not confirm server-side revocation; that session may remain valid until it expires. Your account entries remain stored separately from device-only entries.",
    );
  }
  function deleteMyHealthData() {
    Alert.alert(
      "Delete your health data?",
      accessToken
        ? "This removes this account's saved health information and documents from its device cache and DoctorAI account, plus the separate device-only record. This cannot be undone."
        : "This removes the separate device-only record. Account-scoped records remain stored for their owners; sign in to each account to delete its device cache and DoctorAI copy. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete data",
          style: "destructive",
          onPress: async () => {
            if (deletingDataRef.current) return;
            deletingDataRef.current = true;
            healthJobs.invalidate();
            healthRevision.current++;
            setDeletingData(true);
            try {
            if (syncTimer.current) clearTimeout(syncTimer.current);
            syncTimer.current = null;
            // Let an already submitted write finish before issuing deletion.
            // A deadline keeps a network outage from claiming deletion succeeded.
            if (!await healthJobs.waitForPending()) {
              Alert.alert("Upload or sync still pending", "Deletion was postponed because a previous upload or sync has not finished. Keep the app open, reconnect and retry.");
              return;
            }
            let remoteComplete = Boolean(accessToken);
            try {
              if (accessToken) {
                const library = await requestAccountResource(API, "/api/documents", accessToken, { expectedSub: account?.sub });
                if (!library.ok || !Array.isArray(library.payload.documents)) remoteComplete = false;
                else for (const document of library.payload.documents) {
                  const response = await requestAccountResource(API, `/api/documents?id=${encodeURIComponent(document.id)}`, accessToken, { method: "DELETE", expectedSub: account?.sub });
                  if (!response.ok && response.status !== 404) remoteComplete = false;
                }
                const response = await requestAccountResource(API, "/api/health/state", accessToken, { method: "DELETE", expectedSub: account?.sub });
                if (!response.ok) remoteComplete = false;
              }
            } catch { remoteComplete = false; }
            if (accessToken && !remoteComplete) {
              setSyncStatus("Cloud deletion incomplete — retry while signed in");
              Alert.alert("Cloud deletion incomplete", "Some cloud documents may already be deleted. Your on-device data was kept so you can retry while signed in.");
              return;
            }
            try {
              await privateFiles?.clearCache();
              await pickerCache?.clear();
              await activePrivateStateStore.current.clear();
              if (activeStorageScope.current !== "device") await privateStateStore.clear();
            } catch {
              setSyncStatus("Device deletion incomplete — retry from Settings");
              Alert.alert("Device deletion incomplete", "DoctorAI could not confirm that all on-device data was removed. Keep the app open and retry from Settings.");
              return;
            }
            updatedAt.current = Date.now();
            deviceStateSnapshot.current = empty;
            deviceUpdatedAt.current = updatedAt.current;
            healthRevision.current++;
            suppressCloudSyncOnce.current = Boolean(accessToken);
            setState(empty);
            setMed(blankMed()); setAppt(blankAppt()); setProviderForm(blankProvider());
            setMeasure({ type: "Weight", value: "" }); setQuestion(""); setEditing(false);
            setResearchTopic(""); setResearchItems([]);
            setClearedRecordVersion(value => value + 1);
            setSyncStatus(accessToken ? "Private health data deleted" : "Device data deleted; account copy not checked");
            Alert.alert(
              accessToken ? "Health data deleted" : "Device data deleted",
              accessToken
                ? "Your saved DoctorAI health data has been deleted from this device and account."
                : "Health data was deleted from this device. Because you were signed out, DoctorAI could not check or delete an account copy. Sign in to the account and retry if you have synced data there.",
            );
            } finally { deletingDataRef.current = false; setDeletingData(false); }
          },
        },
      ],
    );
  }
  async function searchResearch(topic = researchTopic) {
    const clean = topic.trim().slice(0, 80);
    setResearchBusy(true);
    try {
      const response = await fetch(`${API}/api/research`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ topic: clean, pageSize: 12 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Research updates are unavailable.");
      if (healthJobs.isCurrent(renderEpoch)) setResearchItems(Array.isArray(payload.results) ? payload.results : []);
    } catch (error) {
      Alert.alert("Research unavailable", error instanceof Error ? error.message : "Try again shortly.");
    } finally { setResearchBusy(false); }
  }
  async function ask() {
    const text = question.trim();
    if (!text || busy) return;
    const u = { id: makeId("msg"), role: "user" as const, content: text };
    const next = [...state.messages, u];
    setQuestion("");
    update({ messages: next });
    setBusy(true);
    try {
      if (!accessToken) throw new Error("Please sign in with Google before using DoctorAI chat.");
      const r = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const p = await r.json();
      if (!r.ok)
        throw new Error(p.error || "DoctorAI is unavailable right now.");
      update({
        messages: [
          ...next,
          { id: makeId("msg"), role: "assistant", content: p.answer },
        ],
      });
    } catch (e) {
      update({
        messages: [
          ...next,
          {
            id: makeId("msg"),
            role: "assistant",
            content:
              e instanceof Error
                ? e.message
                : "DoctorAI could not answer right now.",
          },
        ],
      });
    } finally {
      setBusy(false);
    }
  }
  async function scan() {
    if (scanBusy || scanPromptOpen.current) return;
    if (!accessToken) {
      Alert.alert("Sign in first", "Sign in with Google before scanning a private medicine label.");
      return;
    }
    if (!subscription.active) {
      Alert.alert("DoctorAI Pro required", "Medication image scanning is included with DoctorAI Pro.");
      return;
    }
    scanPromptOpen.current = true;
    Alert.alert(
      "Before scanning",
      "If you continue, a photo of the medicine label will be sent to DoctorAI and OpenAI to extract visible text. OpenAI may retain API content in abuse-monitoring logs for up to 30 days. Review every extracted detail against the label; this scan does not check medicine safety. See the Privacy Notice for details.",
      [
        { text: "Cancel", style: "cancel", onPress: () => { scanPromptOpen.current = false; } },
        { text: "Agree & open camera", onPress: () => { scanPromptOpen.current = false; void scanLabelAfterConsent(); } },
      ],
      { cancelable: false },
    );
  }
  async function scanLabelAfterConsent() {
    setScanBusy(true);
    let cameraCopy: string | undefined;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access to scan a medicine label or prescription.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.45,
        base64: true,
        exif: false,
      });
      if (result.canceled) return;
      cameraCopy = result.assets[0]?.uri;
      if (!result.assets[0]?.base64 || !healthJobs.isCurrent(renderEpoch)) return;
      const a = result.assets[0];
      const mimeType = /^(?:image\/jpeg|image\/png|image\/webp)$/i.test(a.mimeType || "")
        ? a.mimeType
        : "image/jpeg";
      const body = JSON.stringify({ consent: true, image: `data:${mimeType};base64,${a.base64}` });
      if (body.length > 3_900_000) throw new Error("That camera image is still too large to send. Move closer to the label and try again.");
      const r = await apiFetch("/api/medication/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const p = await r.json();
      if (!r.ok)
        throw new Error(p.error || "Scanning is available with DoctorAI Pro.");
      const x = p.medication || {};
      if (!healthJobs.isCurrent(renderEpoch)) return;
      setMed((m) => ({
        ...m,
        name: x.name || "",
        dose: x.dose || "",
        frequency: x.frequency || m.frequency,
        instructions: x.instructions || "",
        supply: x.supply ? String(x.supply) : m.supply,
        refill: x.refill || x.refillDate || "",
        time: x.time || m.time,
        startDate: x.startDate || m.startDate,
        endDate: x.endDate || m.endDate,
        prescriptionExpiry: x.prescriptionExpiry || m.prescriptionExpiry,
        repeats: x.repeats || m.repeats,
      }));
      Alert.alert(
        "Details extracted",
        "Review every field against the box or prescription before saving.",
      );
    } catch (e) {
      Alert.alert(
        "Scan unavailable",
        e instanceof Error
          ? e.message
          : "Enter it manually and check the label.",
      );
    } finally {
      try { await pickerCache?.removeCopy(cameraCopy); }
      catch { Alert.alert("Temporary photo cleanup incomplete", "Retry deleting device data from Settings to remove the temporary label photo."); }
      setScanBusy(false);
    }
  }
  function saveMed() {
    const m = { ...med, name: med.name.trim(), dose: med.dose.trim() };
    if (!m.name || !m.dose) {
      Alert.alert("Add the medicine name and dose");
      return;
    }
    const k = normalize(m.name) + ":" + normalize(m.dose);
    const commit = () => {
      const saved = { ...m, id: makeId("med") };
      update({
        medications: [...state.medications, saved],
        timeline: [{ id: makeId("timeline"), type: "medication", date: new Date().toISOString().slice(0, 10), title: `${saved.name} added`, description: `${saved.dose} · ${saved.frequency || "schedule needs review"}`, icon: "▣" }, ...state.timeline],
      });
      setMed(blankMed());
      Alert.alert(
        "Medicine saved",
        "Confirm the schedule and instructions against the label.",
      );
    };
    if (duplicateKeys.has(k))
      Alert.alert(
        "Possible duplicate medicine",
        "A medicine with the same name and dose is already saved. Check with a pharmacist before taking both.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save anyway", onPress: commit },
        ],
      );
    else commit();
  }
  function removeMed(m: Medication) {
    Alert.alert(`Delete ${m.name}?`, "This removes it from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          update({
            medications: state.medications.filter((x) => x.id !== m.id),
          }),
      },
    ]);
  }
  function toggleMed(m: Medication) {
    update({
      medications: state.medications.map((x) =>
        x.id === m.id ? { ...x, takenToday: !x.takenToday } : x,
      ),
    });
  }
  function saveAppt() {
    if (!appt.title.trim()) {
      Alert.alert("Add an appointment reason");
      return;
    }
    update({
      appointments: [...state.appointments, { ...appt, id: makeId("appt") }],
      timeline: [{ id: makeId("timeline"), type: "appointment", date: appt.date || new Date().toISOString().slice(0, 10), title: `${appt.title} added`, description: appt.provider || "Provider to confirm", icon: "◷" }, ...state.timeline],
    });
    setAppt(blankAppt());
  }
  function removeAppt(a: Appointment) {
    Alert.alert(
      `Delete ${a.title}?`,
      "This removes the appointment from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            update({
              appointments: state.appointments.filter((x) => x.id !== a.id),
            }),
        },
      ],
    );
  }
  function saveProvider() {
    const provider = { ...providerForm, name: providerForm.name.trim() };
    if (!provider.name) {
      Alert.alert("Add the doctor's name");
      return;
    }
    update({ providers: [...state.providers, { ...provider, id: makeId("provider") }] });
    setProviderForm(blankProvider());
  }
  function removeProvider(provider: Provider) {
    Alert.alert(`Delete ${provider.name}?`, "This removes the local doctor contact from this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => update({ providers: state.providers.filter(item => item.id !== provider.id) }) },
    ]);
  }
  function prepare(a: Appointment) {
    setQuestion(
      `Help me prepare for my appointment: ${a.title} with ${a.provider || "my provider"} on ${a.date || "the scheduled date"}. Use only the health information I have approved.`,
    );
    setTab("ask");
  }
  function saveMeasure() {
    if (!measure.value.trim()) {
      Alert.alert("Add a measurement value");
      return;
    }
    update({
      measurements: [
        {
          id: makeId("measurement"),
          type: measure.type,
          value: measure.value.trim(),
          date: dateLabel(),
        },
        ...state.measurements,
      ],
      timeline: [{ id: makeId("timeline"), type: "result", date: new Date().toISOString().slice(0, 10), title: `${measure.type} logged`, description: measure.value.trim(), icon: "⌁" }, ...state.timeline],
    });
    setMeasure({ ...measure, value: "" });
  }
  async function uploadDocument() {
    if (deletingDataRef.current) return;
    return healthJobs.track(uploadDocumentJob());
  }
  async function uploadDocumentJob() {
    if (!accessToken) {
      Alert.alert("Sign in required", "Sign in before adding a private health document.");
      return;
    }
    if (!subscription.active) {
      Alert.alert("DoctorAI Pro", "Secure document uploads are included with DoctorAI Pro.");
      return;
    }
    let pickedCopy: string | undefined;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      pickedCopy = asset.uri;
      if (!healthJobs.isCurrent(renderEpoch)) return;
      if ((asset.size || 0) > 2 * 1024 * 1024) throw new Error("Choose a document smaller than 2 MB.");
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const type = asset.mimeType || (asset.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      const lower = asset.name.toLowerCase();
      const category = /prescription|script|rx/.test(lower) ? "prescription" : /lab|blood|test|result/.test(lower) ? "result" : /referral/.test(lower) ? "referral" : /discharge/.test(lower) ? "discharge" : /imaging|xray|x-ray|scan|mri|ct/.test(lower) ? "imaging" : "other";
      const response = await apiFetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: asset.name, category, type: "Medical document", data: `data:${type};base64,${base64}` }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Secure document upload is unavailable.");
      const saved = payload.document;
      if (!healthJobs.isCurrent(renderEpoch)) return;
      const document: HealthDocument = {
        id: saved.id,
        category: saved.category || category,
        type: saved.type || "Medical document",
        title: saved.name || asset.name,
        description: "Securely stored · available only to your signed-in account",
        date: dateLabel(),
        size: `${Math.max(1, Math.round((saved.size || asset.size || 0) / 1024))} KB`,
        createdAt: saved.createdAt,
      };
      update({ documents: [document, ...state.documents], timeline: [{ id: makeId("timeline"), type: "document", date: new Date().toISOString().slice(0, 10), title: "Health document uploaded", description: document.title, icon: "▤", source: "document" }, ...state.timeline] });
      Alert.alert("Document stored", "Your file was encrypted before it was saved. Review it before using it in a health conversation.");
    } catch (error) {
      if (healthJobs.isCurrent(renderEpoch)) Alert.alert("Upload unavailable", error instanceof Error ? error.message : "Secure document upload is unavailable.");
    } finally {
      try { await pickerCache?.removeCopy(pickedCopy); }
      catch { Alert.alert("Temporary file cleanup incomplete", "Retry deleting device data from Settings to remove the temporary imported file."); }
    }
  }
  async function removeDocument(document: HealthDocument) {
    Alert.alert("Delete document?", `Delete ${document.title} from your private library?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          const response = await apiFetch(`/api/documents?id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok && response.status !== 404) throw new Error(payload.error || "The document could not be deleted.");
          update({ documents: state.documents.filter(item => item.id !== document.id), timeline: state.timeline.filter(item => item.description !== document.title) });
        } catch (error) { Alert.alert("Delete unavailable", error instanceof Error ? error.message : "The document could not be deleted."); }
      } },
    ]);
  }
  function openDocument(document: HealthDocument) {
    if (privateFileBusy.current) return;
    if (!accessToken) { Alert.alert("Sign in required", "Sign in before opening a private document."); return; }
    Alert.alert("Open private document?", "DoctorAI will download a temporary copy and open it with a document viewer on this device. The viewer may keep a copy. Copies outside DoctorAI are not removed when you delete your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Open document", onPress: async () => {
        if (privateFileBusy.current) return;
        privateFileBusy.current = true;
        setOpeningDocument(document.id);
        try {
          if (!privateFiles) throw new Error("Document viewing is unavailable in this browser preview.");
          await privateFiles.openDocument(document, accessToken);
        } catch (error) {
          Alert.alert("Document unavailable", error instanceof Error ? error.message : "Try again with a document viewer installed on this device.");
        } finally { privateFileBusy.current = false; setOpeningDocument(null); }
      } },
    ]);
  }
  function exportMyHealthData() {
    if (privateFileBusy.current) return;
    Alert.alert("Export saved health data?", "This creates an unencrypted file containing the entries saved in this app, including notes and chat history. Document files are separate. Choose a trusted destination; exported copies are not removed when you delete DoctorAI data or close your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Choose destination", onPress: async () => {
        if (privateFileBusy.current) return;
        privateFileBusy.current = true;
        setExportBusy(true);
        try {
          if (!privateFiles) throw new Error("File export is unavailable in this browser preview.");
          await privateFiles.exportHealth(state);
        } catch (error) {
          Alert.alert("Export unavailable", error instanceof Error ? error.message : "The export could not be prepared.");
        } finally { privateFileBusy.current = false; setExportBusy(false); }
      } },
    ]);
  }
  if (!hydrated || localLoadError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
          <StatusBar style="dark" />
          <ScrollView contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: "center" }]}>
            {!hydrated ? <ActivityIndicator color={theme.blue} accessibilityLabel="Loading your private record" /> : <>
              <Text accessibilityRole="header" style={[s.title, { color: theme.navy }]}>Device record unavailable</Text>
              <Text style={[s.muted, { color: theme.muted, marginBottom: 20 }]}>Your saved record could not be loaded. Retry to restore access before adding new details.</Text>
              <Pressable onPress={() => void loadDeviceState()} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Retry loading saved record</Text></Pressable>
            </>}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }
  const content =
    tab === "today" ? (
      <Today
        key={clearedRecordVersion}
        theme={theme}
        scale={scale}
        state={state}
        open={select}
        toggle={toggleMed}
        apiFetch={apiFetch}
        signedIn={Boolean(accessToken)}
        signIn={signIn}
        stateStore={activePrivateStateStore.current}
        medicationAckKey={activeMedicationAckKey.current}
      />
    ) : tab === "ask" ? (
      <Ask
        theme={theme}
        scale={scale}
        state={state}
        question={question}
        setQuestion={setQuestion}
        busy={busy}
        send={ask}
        clear={() => update({ messages: [] })}
      />
    ) : tab === "medications" ? (
      <Meds
        theme={theme}
        scale={scale}
        meds={state.medications}
        form={med}
        setForm={setMed}
        scan={scan}
        scanBusy={scanBusy}
        save={saveMed}
        remove={removeMed}
        toggle={toggleMed}
        dupes={duplicateKeys}
      />
    ) : tab === "appointments" ? (
      <Appointments
        theme={theme}
        scale={scale}
        items={state.appointments}
        form={appt}
        setForm={setAppt}
        save={saveAppt}
        remove={removeAppt}
        prepare={prepare}
      />
    ) : tab === "health" ? (
      <Health
        theme={theme}
        scale={scale}
        profile={state.profile}
        editing={editing}
        setEditing={setEditing}
        update={(p: Profile) => update({ profile: p })}
        providers={state.providers}
        providerForm={providerForm}
        setProviderForm={setProviderForm}
        saveProvider={saveProvider}
        removeProvider={removeProvider}
      />
    ) : tab === "research" ? (
      <Research theme={theme} scale={scale} topic={researchTopic} setTopic={setResearchTopic} items={researchItems} busy={researchBusy} search={searchResearch} />
    ) : tab === "results" ? (
      <Results
        theme={theme}
        scale={scale}
        items={state.measurements}
        form={measure}
        setForm={setMeasure}
        save={saveMeasure}
        upload={uploadDocument}
      />
    ) : tab === "timeline" ? (
      <Timeline theme={theme} scale={scale} state={state} />
    ) : (
      <Documents theme={theme} scale={scale} items={state.documents} upload={uploadDocument} remove={removeDocument} open={openDocument} opening={openingDocument} />
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
        <StatusBar style="dark" />
        <View style={s.auroraLine} />
        <View style={[s.header, { borderBottomColor: theme.line }]}>
          <Pressable
            onPress={() => setSettings(!settings)}
            accessibilityRole="button"
            accessibilityLabel="Open DoctorAI menu"
            style={s.headerIconButton}
          >
            <Ionicons name="menu-outline" size={27} color={theme.navy} />
          </Pressable>
          <Pressable
            onPress={() => select("today")}
            accessibilityRole="button"
            accessibilityLabel="DoctorAI home"
            style={s.headerBrand}
          >
            <Image
              source={require("./assets/doctorai-logo.png")}
              style={s.logo}
              resizeMode="contain"
              accessibilityLabel="DoctorAI logo"
            />
          </Pressable>
          <Pressable
            onPress={() => select("appointments")}
            accessibilityRole="button"
            accessibilityLabel="Open notifications and appointments"
            style={s.headerIconButton}
          >
            <Ionicons name="notifications-outline" size={25} color={theme.navy} />
            {state.medications.some((medication) => !medication.takenToday) && <View style={s.notificationDot} />}
          </Pressable>
        </View>
        {Platform.OS === "web" && <Text style={{ padding: 10, color: theme.muted, fontSize: 12 * scale }}>Browser preview: changes are temporary and disappear when this page closes.</Text>}
        {appUpdateReady && <View style={{ padding: 12, backgroundColor: theme.cyan }}>
          <Text style={{ color: theme.navy, fontSize: 13 * scale }}>An app update is ready. Restart when you are ready to save your current entries and apply it.</Text>
          <Pressable disabled={updateRestartBusy || deletingData} onPress={() => void restartWithUpdate()} accessibilityRole="button" style={[s.action, { minHeight: 48 }]}><Text style={{ color: theme.blue, fontWeight: "800" }}>{updateRestartBusy ? "Saving before restart…" : "Save and restart"}</Text></Pressable>
        </View>}
        {localSaveError && <View style={{ padding: 14, backgroundColor: "#fff3df" }}>
          <Text accessibilityRole="alert" style={{ color: "#663d00", fontSize: 13 * scale }}>Latest changes are not confirmed saved on this device. Keep the app open and retry saving.</Text>
          <Pressable onPress={() => void saveDeviceState()} accessibilityRole="button" style={[s.action, { marginTop: 8 }]}><Text style={{ color: theme.blue, fontWeight: "800" }}>Retry device save</Text></Pressable>
        </View>}
        {settings && (
          <Settings
            theme={theme}
            scale={scale}
            state={state}
            update={update}
            close={() => setSettings(false)}
            navigate={select}
            account={account}
            signedIn={Boolean(accessToken)}
            authBusy={authBusy}
            signIn={signIn}
            signOut={signOut}
            deleteData={deleteMyHealthData}
            exportData={exportMyHealthData}
            exportBusy={exportBusy}
            subscription={subscription}
            syncStatus={syncStatus}
          />
        )}
        {tab === "today" ? (
          <ScrollView style={[s.todayViewport, { backgroundColor: theme.bg }]} contentContainerStyle={s.todayScrollContent} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        ) : (
          <ScrollView style={s.screenScroll} contentContainerStyle={s.content}>
            <Text style={[s.eyebrow, { color: theme.blue, fontSize: 12 * scale }]}>YOUR PRIVATE HEALTH HUB</Text>
            <Text accessibilityRole="header" style={[s.title, { color: theme.navy, fontSize: 32 * scale, lineHeight: 38 * scale }]}>{title}</Text>
            {content}
          </ScrollView>
        )}
        <BottomNav
          tab={tab}
          theme={theme}
          scale={scale}
          select={select}
          setSettings={setSettings}
          settingsOpen={settings}
        />
        <Modal visible={deletingData} transparent animationType="fade" onRequestClose={() => {}}>
          <View style={{ flex: 1, backgroundColor: "rgba(12,35,55,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <View style={[s.card, { backgroundColor: theme.white, width: "100%" }]}>
              <ActivityIndicator color={theme.blue} />
              <Text accessibilityRole="header" style={[s.cardTitle, { color: theme.navy, marginTop: 16 }]}>Deleting health data</Text>
              <Text style={[s.muted, { color: theme.muted }]}>Keep DoctorAI open while the device and account checks finish.</Text>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function BottomNav({ tab, theme, scale, select, setSettings, settingsOpen }: any) {
  const item = (key: Tab, label: string, icon: any, action?: () => void, selected = key === tab) => (
    <Pressable
      key={label}
      onPress={action || (() => select(key))}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={s.bottomItem}
    >
      <Ionicons name={icon} size={23} color={selected ? theme.blue : "#61798d"} />
          <Text style={[s.bottomItemLabel, { color: selected ? theme.blue : theme.muted, fontSize: 12 * scale }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[s.bottomNav, { borderTopColor: theme.line, backgroundColor: theme.white }]}>
      {item("today", "Home", "home-outline")}
      {item("ask", "Chat", "chatbubble-ellipses-outline")}
      <Pressable
        onPress={() => select("today")}
        accessibilityRole="button"
        accessibilityLabel="Open DoctorAI quick access"
        style={s.bottomCenterWrap}
      >
        <View style={s.bottomCenterButton}>
          <Image source={require("./assets/doctorai-icon-foreground.png")} style={s.bottomCenterLogo} resizeMode="contain" accessibilityLabel="DoctorAI" />
        </View>
      </Pressable>
      {item("health", "Health", "heart-outline")}
      {item("health", "Profile", "person-outline", () => setSettings(true), settingsOpen)}
    </View>
  );
}

function Today({ theme, scale, state, open, toggle, apiFetch, signedIn, signIn, stateStore, medicationAckKey }: any) {
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingText, setBriefingText] = useState("");
  const [briefingError, setBriefingError] = useState("");
  const duplicateMedication = state.medications.some((medication: Medication, index: number) => state.medications.slice(index + 1).some((other: Medication) => String(medication.name || '').trim().toLowerCase() === String(other.name || '').trim().toLowerCase()));
  const recentSymptoms = useMemo(() => state.timeline.filter((item: TimelineEntry) => item.type === "symptom").slice(0, 5), [state.timeline]);
  const hasCodeine = state.medications.some((medication: Medication) => /\bcodeine\b/i.test(String(medication.name || "")));
  const hasHeadache = recentSymptoms.some((item: TimelineEntry) => /headache|head pain|migraine/i.test(`${item.title} ${item.description}`));
  const hasBreathingConcern = recentSymptoms.some((item: TimelineEntry) => /breath|shortness|wheez|cannot breathe|can't breathe/i.test(`${item.title} ${item.description}`));
  const duplicateAlertKey = useMemo(() => {
    if (!duplicateMedication) return "";
    const names = state.medications.map((medication: Medication) => String(medication.name || "").trim().toLowerCase()).filter(Boolean).sort();
    return `duplicate:${names.join("|")}`;
  }, [duplicateMedication, state.medications]);
  const presentedMedicationAlert = useRef("");
  const checkedAt = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const orbPulse = useRef(new Animated.Value(1)).current;
  const buildBriefingPrompt = () => {
    const clean = (value: unknown, max = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
    const medicines = state.medications.slice(0, 8).map((item: Medication) => [clean(item.name, 100), clean(item.dose, 60), clean(item.frequency, 60), item.time ? `time ${clean(item.time, 20)}` : "", clean(item.instructions)].filter(Boolean).join(" · "));
    const symptoms = recentSymptoms.map((item: TimelineEntry) => [clean(item.title, 100), clean(item.description)].filter(Boolean).join(" · "));
    return `Create a concise personal health briefing from these unverified, user-saved notes.\n\nSaved medicines: ${medicines.length ? medicines.join(" | ") : "none"}\nRecent symptoms: ${symptoms.length ? symptoms.join(" | ") : "none"}\n\nUse exactly these headings: MEDICINES, POSSIBLE OVERLAPS TO CHECK, SYMPTOMS, TODAY. Give no more than 3 short bullet points under each. Explain established general information about medicines already listed, including label timing, food or drink cautions, sedation/driving and serious warning signs. Never provide a dose, recommend a new medicine, or state medicines are safe together. Flag only plausible duplication or interaction concerns for a pharmacist to verify; say when exact ingredients or formulation are unclear. For symptoms, give only low-risk self-care and monitoring, not a diagnosis. For breathing difficulty, give no exercise advice and advise clinical assessment, with emergency escalation for severe breathlessness, chest pain, confusion, collapse, blue/grey lips or inability to speak normally. Keep the whole answer under 320 words.`;
  };
  const generateBriefing = async () => {
    setBriefingOpen(true);
    setBriefingError("");
    setBriefingText("");
    if (!signedIn) return;
    setBriefingBusy(true);
    try {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25_000);
        try {
          const response = await apiFetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: buildBriefingPrompt() }], responseLength: "medium" }),
            signal: controller.signal,
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && typeof payload?.answer === "string" && payload.answer.trim()) {
            setBriefingText(payload.answer.trim());
            return;
          }
          const error = new Error(typeof payload?.error === "string" ? payload.error : "The personalised briefing is temporarily unavailable.");
          lastError = error;
          const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
          if (!retryable || attempt === 1) break;
        } catch (error) {
          lastError = error;
          const retryable = error instanceof Error && (error.name === "AbortError" || error.name === "TypeError");
          if (!retryable || attempt === 1) break;
        } finally {
          clearTimeout(timeout);
        }
      }
      throw lastError || new Error("The personalised briefing is temporarily unavailable.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const unavailable = error instanceof Error && (error.name === "AbortError" || error.name === "TypeError")
        ? "The briefing timed out or could not connect. Your saved medicine, symptom and safety sections above are still available."
        : message.includes("temporarily unavailable") || message.includes("could not answer") || message.includes("could not finish")
          ? "The AI briefing is temporarily unavailable. Your saved medicine, symptom and safety sections above are still available."
          : message || "The AI briefing is temporarily unavailable. Your saved information above is still available.";
      setBriefingError(unavailable);
    } finally {
      setBriefingBusy(false);
    }
  };
  useEffect(() => {
    if (state.reduceMotion) {
      orbPulse.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(orbPulse, { toValue: 1.025, duration: 650, useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.delay(4200),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [orbPulse]);
  useEffect(() => {
    if (!duplicateAlertKey || presentedMedicationAlert.current === duplicateAlertKey) return;
    presentedMedicationAlert.current = duplicateAlertKey;
    let active = true;
    stateStore.readAuxiliary(medicationAckKey).then(acknowledged => {
      if (!active || acknowledged === duplicateAlertKey) return;
      const acknowledge = async () => { if (active) await stateStore.writeAuxiliary(medicationAckKey, duplicateAlertKey).catch(() => {}); };
      Alert.alert(
        "Possible duplicate medicine",
        "Two saved medicines have the same name. Check whether this is an accidental double-up before taking another dose. Do not change or stop treatment without a pharmacist or qualified clinician.",
        [
          { text: "I understand", style: "cancel", onPress: acknowledge },
          { text: "Review medicines", onPress: async () => { await acknowledge(); if (active) open("medications"); } },
        ],
        { cancelable: false },
      );
    }).catch(() => {});
    return () => { active = false; };
  }, [duplicateAlertKey, medicationAckKey, open, stateStore]);
  return (
    <View style={s.todayScreen}>
      <View style={s.mobileHero}>
        <View style={s.heroIntroRow}>
          <View style={s.heroTextBlock}>
            <Text style={[s.mobileHeroGreeting, { color: theme.muted, fontSize: 12 * scale }]}>Welcome back,</Text>
            <Text accessibilityRole="header" style={[s.mobileHeroTitle, { color: theme.navy, fontSize: 27 * scale, lineHeight: 30 * scale }]}>How can I help <Text style={s.mobileHeroAccent}>you today?</Text></Text>
            <Text style={[s.mobileHeroCopy, { color: theme.muted, fontSize: 12 * scale }]}>Optional AI tools for organising health information and general education.</Text>
          </View>
          <Pressable onPress={generateBriefing} accessibilityRole="button" accessibilityLabel="Open my private health briefing" style={s.healthBriefingButton}>
            <View style={s.healthBriefingButtonIcon}><Ionicons name="sparkles" size={19} color="#0874db" /></View>
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[s.healthBriefingButtonTitle, { fontSize: 14 * scale }]}>Open my health briefing</Text><Text numberOfLines={2} style={[s.healthBriefingButtonHint, { fontSize: 12 * scale }]}>Saved health details and points to review.</Text></View>
            <View style={s.healthBriefingButtonArrow}><Ionicons name="arrow-forward" size={18} color="#0874db" /></View>
          </Pressable>
        </View>
      </View>
      <VisitBrief state={state} scale={scale} />
      <View
        style={s.mobileOrbit}
        accessible={false}
      >
        <View style={s.orbitOuter} />
        <View style={s.orbitInner} />
        <Animated.View style={[s.orbitCore, { transform: [{ scale: orbPulse }] }]}>
          <Image
            source={require("./assets/doctorai-icon-foreground.png")}
            style={s.orbitLogo}
            resizeMode="contain"
            accessibilityLabel="DoctorAI"
          />
        </Animated.View>
        <OrbitQuickAction label="Ask AI" subtitle="Explore general health information" icon="sparkles" accent="#1679e8" target="ask" open={open} placement={s.orbitAsk} fromCentre={{ x: 0, y: -141 }} tone="#eef8ff" />
        <OrbitQuickAction label="Research" subtitle="Discover trusted health information" icon="search" accent="#16a36f" target="research" open={open} placement={s.orbitResearch} fromCentre={{ x: -124, y: -73 }} tone="#effbf5" />
        <OrbitQuickAction label="Prescription Hub" subtitle="Scan, manage & understand" icon="medical" accent="#7952d8" target="medications" open={open} placement={s.orbitMedicines} fromCentre={{ x: 124, y: -73 }} tone="#f7f1ff" />
        <OrbitQuickAction label="Scan & Understand" subtitle="Turn documents into clear words" icon="document-text" accent="#ee725f" target="results" open={open} placement={s.orbitResults} fromCentre={{ x: -124, y: 73 }} tone="#fff3ef" />
        <OrbitQuickAction label="Appointments" subtitle="Manage your appointments" icon="calendar" accent="#c99314" target="appointments" open={open} placement={s.orbitAppointments} fromCentre={{ x: 124, y: 73 }} tone="#fff9e8" />
        <OrbitQuickAction label="Documents" subtitle="Store & access health files" icon="folder-open" accent="#0caaa9" target="documents" open={open} placement={s.orbitHealth} fromCentre={{ x: 0, y: 109 }} tone="#eafcfb" />
        <Text style={s.orbitHint}>‹ Swipe to explore ›</Text>
      </View>
      <View style={[s.prescriptionAlert, { backgroundColor: duplicateMedication ? "#fff8ed" : "#effbf5", borderColor: duplicateMedication ? "#f0d3a9" : "#b9e4d3" }]} accessibilityRole="summary">
        <View style={[s.prescriptionAlertIcon, { backgroundColor: duplicateMedication ? "#c9842c" : "#249b72" }]}><Ionicons name={duplicateMedication ? "warning-outline" : "checkmark"} size={20} color="#fff" /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={[s.prescriptionAlertTitle, { color: duplicateMedication ? "#875722" : "#176a4e", fontSize: 15 * scale }]}>Prescription Alerts</Text><Text style={[s.prescriptionAlertMessage, { color: duplicateMedication ? "#875722" : "#176a4e", fontSize: 13 * scale }]}>{duplicateMedication ? "Possible duplicate saved medicine." : "No duplicate saved medicine name detected."}</Text><Text style={[s.prescriptionAlertMeta, { color: duplicateMedication ? "#875722" : "#176a4e", fontSize: 12 * scale }]}>Not a full interaction check · Verify with your pharmacist or doctor.</Text></View>
        <Pressable onPress={() => open("medications")} accessibilityRole="button" accessibilityLabel="View prescription alert details" style={s.prescriptionAlertAction}><Text style={[s.prescriptionAlertLink, { color: duplicateMedication ? "#875722" : "#176a4e" }]}>Details →</Text></Pressable>
      </View>
      <Modal visible={briefingOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBriefingOpen(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={s.briefingScreen}>
            <View style={s.briefingHeader}>
            <View style={{ flex: 1 }}><Text style={s.briefingEyebrow}>PRIVATE DAILY OVERVIEW</Text><Text accessibilityRole="header" style={[s.briefingTitle, { fontSize: 24 * scale }]}>Your health briefing</Text></View>
            <Pressable onPress={() => setBriefingOpen(false)} accessibilityRole="button" accessibilityLabel="Close health briefing" style={s.briefingClose}><Ionicons name="close" size={23} color={C.navy} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={s.briefingContent} showsVerticalScrollIndicator={false}>
            <View style={s.briefingSummary}><View style={{ flex: 1 }}><Text style={s.briefingSummaryKicker}>YOUR INFORMATION, TOGETHER</Text><Text accessibilityRole="header" style={[s.briefingSummaryTitle, { fontSize: 21 * scale }]}>{state.medications.length || recentSymptoms.length ? "What matters today" : "Start building your briefing"}</Text><Text style={s.briefingSummaryText}>{state.medications.length + recentSymptoms.length} saved medicine and symptom item{state.medications.length + recentSymptoms.length === 1 ? "" : "s"} reviewed privately.</Text></View><Ionicons name="checkmark-circle-outline" size={38} color="#d8fbff" /></View>

            <View style={s.briefingCard}>
              <View style={s.briefingCardHeader}><View><Text style={s.briefingCardKicker}>CURRENT ROUTINE</Text><Text accessibilityRole="header" style={s.briefingCardTitle}>Medicines and timings</Text></View><Pressable onPress={() => { setBriefingOpen(false); open("medications"); }} accessibilityRole="button" style={s.briefingLinkButton}><Text style={s.briefingLink}>View all</Text></Pressable></View>
              {!state.medications.length ? <Text style={s.briefingEmpty}>No medicines saved yet.</Text> : state.medications.slice(0, 8).map((medicine: Medication) => <View key={medicine.id} style={s.briefingListRow}><View style={s.briefingMedicineIcon}><Ionicons name="medical-outline" size={17} color="#1769b5" /></View><View style={{ flex: 1 }}><Text style={s.briefingItemTitle}>{medicine.name} {medicine.dose}</Text><Text style={s.briefingItemMeta}>{[medicine.frequency, medicine.time ? `at ${medicine.time}` : "", medicine.instructions || "Check the saved label"].filter(Boolean).join(" · ")}</Text><Text style={medicine.takenToday ? s.briefingTaken : s.briefingDue}>{medicine.takenToday ? "Marked taken today" : "Still to review today"}</Text></View></View>)}
            </View>

            {hasCodeine && <View style={[s.briefingCard, s.briefingVerifiedCard]}><Text style={s.briefingCardKicker}>RECOGNISED MEDICINE · SOURCE CHECKED</Text><Text style={s.briefingCardTitle}>Codeine</Text><Text style={s.briefingBullet}>• Codeine itself can usually be taken with or without food. Combination products may have different instructions, so check the full label.</Text><Text style={s.briefingBullet}>• Avoid alcohol. Do not drive, cycle or use machinery if you feel sleepy, dizzy or unable to concentrate.</Text><Text style={s.briefingBullet}>• Slow, weak or shallow breathing, severe confusion or difficulty waking needs urgent medical help.</Text><Text style={s.briefingBullet}>• Do not double a missed dose or stop long-term codeine suddenly without professional advice.</Text><Pressable onPress={() => Linking.openURL("https://www.nhs.uk/medicines/codeine/")} accessibilityRole="link" style={s.briefingSourceLink}><Text style={s.briefingSourceText}>Read NHS codeine guidance ↗</Text></Pressable></View>}

            <View style={s.briefingCard}>
              <Text style={s.briefingCardKicker}>POSSIBLE OVERLAPS</Text><Text style={s.briefingCardTitle}>Medication review</Text>
              <View style={[s.briefingClashBox, { backgroundColor: duplicateMedication ? "#fff5e8" : "#edf9f5", borderColor: duplicateMedication ? "#efd1a0" : "#c9e9dc" }]}><Ionicons name={duplicateMedication ? "warning-outline" : "information-circle-outline"} size={21} color={duplicateMedication ? C.amber : C.green} /><Text style={[s.briefingClashText, { color: duplicateMedication ? "#7b541a" : "#285f50" }]}>{duplicateMedication ? "A duplicate medicine name is saved. Check for an accidental double-up before another dose." : "No duplicate saved name was found. This does not check every ingredient or prove combinations are safe."}</Text></View>
            </View>

            <View style={s.briefingCard}>
              <Text style={s.briefingCardKicker}>RECENT NOTES</Text><Text style={s.briefingCardTitle}>Symptoms</Text>
              {!recentSymptoms.length ? <Text style={s.briefingEmpty}>No recent symptom entries saved.</Text> : recentSymptoms.map((item: TimelineEntry) => <View key={item.id} style={s.briefingSymptomRow}><Ionicons name="pulse-outline" size={18} color="#b2584e" /><View style={{ flex: 1 }}><Text style={s.briefingItemTitle}>{item.title || "Saved symptom"}</Text><Text style={s.briefingItemMeta}>{item.description || item.date}</Text></View></View>)}
              {hasHeadache && <View style={s.briefingSelfCare}><Text style={s.briefingSelfCareTitle}>For a recorded headache</Text><Text style={s.briefingBullet}>• Water, regular meals, rest and reduced screen strain may be reasonable low-risk steps.</Text><Text style={s.briefingBullet}>• Record timing and context rather than assuming a cause.</Text><Text style={s.briefingBullet}>• A sudden extremely painful headache, weakness, confusion, seizure, vision loss or trouble speaking needs urgent help.</Text><Pressable onPress={() => Linking.openURL("https://www.nhs.uk/symptoms/headaches/")} accessibilityRole="link" style={s.briefingSourceLink}><Text style={s.briefingSourceText}>Read NHS headache guidance ↗</Text></Pressable></View>}
              {hasBreathingConcern && <View style={s.briefingUrgent}><Text style={s.briefingUrgentTitle}>Breathing symptoms need caution</Text><Text style={s.briefingBullet}>Do not use exercise as a test or treatment. Stop activity and seek clinical assessment. Severe breathlessness, chest pain, confusion, collapse, blue/grey lips or being unable to speak normally needs local emergency help now.</Text></View>}
            </View>

            <View style={[s.briefingCard, s.briefingAiCard]}><Text style={s.briefingCardKicker}>DOCTORAI BRIEFING · AI ASSISTED</Text><Text style={s.briefingCardTitle}>Personalised points to review</Text>{!signedIn ? <View><Text style={s.briefingEmpty}>Sign in to generate a private briefing from the information you chose to save.</Text><Pressable onPress={signIn} accessibilityRole="button" style={s.briefingPrimary}><Text style={s.briefingPrimaryText}>Sign in securely</Text></Pressable></View> : briefingBusy ? <View style={s.briefingLoading}><ActivityIndicator color={C.blue} /><Text style={s.briefingEmpty}>Reviewing saved medicines and recent symptoms…</Text></View> : briefingError ? <View><Text style={s.briefingErrorText}>{briefingError}</Text><Pressable onPress={generateBriefing} accessibilityRole="button" style={s.briefingSecondary}><Text style={s.briefingSecondaryText}>Try again</Text></Pressable></View> : <Text selectable style={s.briefingAiText}>{briefingText}</Text>}</View>

            {state.appointments[0] && <View style={s.briefingCard}><Text style={s.briefingCardKicker}>COMING UP</Text><Text style={s.briefingCardTitle}>Next saved appointment</Text><Text style={s.briefingItemTitle}>{state.appointments[0].title}</Text><Text style={s.briefingItemMeta}>{[state.appointments[0].date, state.appointments[0].time, state.appointments[0].provider].filter(Boolean).join(" · ")}</Text></View>}
            <View style={s.briefingSafety}><Text style={s.briefingSafetyText}><Text style={{ fontWeight: "800" }}>Education and organisation—not diagnosis or a treatment plan.</Text> DoctorAI does not prescribe, recommend starting medication, or confirm that medicines are safe together. Verify medication advice with a pharmacist or prescriber.</Text></View>
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function OrbitQuickAction({ label, subtitle, icon, accent, target, open, placement, fromCentre, tone }: any) {
  const drag = useRef(new Animated.ValueXY()).current;
  const dragged = useRef(false);
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragged.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        dragged.current = true;
        drag.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        const droppedOnLogo = Math.hypot(fromCentre.x + gesture.dx, fromCentre.y + gesture.dy) < 76;
        Animated.spring(drag, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          damping: 16,
          stiffness: 190,
        }).start();
        if (droppedOnLogo) {
          open(target);
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[placement, { transform: drag.getTranslateTransform() }]}
      {...responder.panHandlers}
    >
      <Pressable
        onPress={() => {
          if (!dragged.current) open(target);
          dragged.current = false;
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
        style={[s.orbitAction, { backgroundColor: tone, borderColor: `${accent}55` }]}
      >
        <View style={[s.orbitActionIconWrap, { backgroundColor: `${accent}20` }]}><Ionicons name={icon} size={20} color={accent} /></View>
        <View style={{ flex: 1 }}><Text style={s.orbitActionLabel}>{label}</Text><Text style={s.orbitActionSubtitle}>{subtitle}</Text></View>
      </Pressable>
    </Animated.View>
  );
}
function Ask({
  theme,
  scale,
  state,
  question,
  setQuestion,
  busy,
  send,
  clear,
}: any) {
  return (
    <View style={s.chat}>
      <View style={s.safety}>
        <Text
          style={[s.safetyTitle, { color: theme.amber, fontSize: 13 * scale }]}
        >
          Education and organisation only
        </Text>
        <Text
          style={[s.safetyText, { color: theme.muted, fontSize: 12 * scale }]}
        >
          You are chatting with AI, not a clinician. Messages you send are
          processed by our AI provider. DoctorAI does not diagnose or replace a
          healthcare professional. For urgent symptoms, contact local emergency services.
        </Text>
      </View>
      <View style={s.chatHeader}>
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 16 * scale }]}
        >
          DoctorAI conversation
        </Text>
        <Pressable
          onPress={clear}
          accessibilityRole="button"
          accessibilityLabel="Clear conversation"
          style={s.clear}
        >
          <Text style={{ color: theme.blue, fontWeight: "800" }}>Clear</Text>
        </Pressable>
      </View>
      <ScrollView
        style={s.messages}
        contentContainerStyle={{ paddingBottom: 10 }}
      >
        {!state.messages.length && (
          <Text style={[s.empty, { color: theme.muted, fontSize: 14 * scale }]}>
            Ask about organising information, understanding terminology, or
            preparing for an appointment.
          </Text>
        )}
        {state.messages.map((m: Message) => (
          <View
            key={m.id}
            accessible
            accessibilityLabel={`${m.role === "user" ? "You said" : "DoctorAI said"}: ${m.content}`}
            style={[
              s.bubble,
              m.role === "user"
                ? [s.user, { backgroundColor: theme.navy }]
                : [
                    s.ai,
                    { borderColor: theme.line, backgroundColor: theme.white },
                  ],
            ]}
          >
            <Text
              style={[
                m.role === "user" ? s.userText : s.aiText,
                { fontSize: 14 * scale },
              ]}
            >
              {m.content}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.quick}>
        <Pressable
          onPress={() =>
            setQuestion("Help me prepare for my next medical appointment.")
          }
          accessibilityRole="button"
          style={[s.quickButton, { borderColor: theme.line }]}
        >
      <Text style={{ color: theme.blue, fontSize: 12 * scale }}>
            Prepare for an appointment
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            setQuestion("Explain a test result in plain language.")
          }
          accessibilityRole="button"
          style={[s.quickButton, { borderColor: theme.line }]}
        >
      <Text style={{ color: theme.blue, fontSize: 12 * scale }}>
            Explain a result
          </Text>
        </Pressable>
      </View>
      <View style={s.composer}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a health question…"
          placeholderTextColor="#78909e"
          multiline
          accessibilityLabel="Health question"
          style={[
            s.input,
            {
              borderColor: theme.line,
              color: theme.navy,
              fontSize: 14 * scale,
            },
          ]}
        />
        <Pressable
          onPress={send}
          accessibilityRole="button"
          accessibilityLabel="Send question to DoctorAI"
          style={[s.send, { backgroundColor: theme.blue }]}
        >
          <Text style={s.sendText}>{busy ? "Working…" : "Send"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
function Meds({
  theme,
  scale,
  meds,
  form,
  setForm,
  scan,
  scanBusy,
  save,
  remove,
  toggle,
  dupes,
}: any) {
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        Keep medicines, reminders, supply and prescription details together.
        Always verify a scan against the label before saving.
      </Text>
      <Pressable
        onPress={scan}
        accessibilityRole="button"
        accessibilityLabel="Scan a prescription or medicine label"
        style={[s.primary, { backgroundColor: theme.navy }]}
      >
        <Text style={s.primaryText}>
          {scanBusy ? "Reading image…" : "Scan prescription · Pro"}
        </Text>
      </Pressable>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Add medication
        </Text>
        <Field
          label="Medication name"
          value={form.name}
          set={(v: string) => setForm({ ...form, name: v })}
          placeholder="As shown on the label"
          theme={theme}
          scale={scale}
        />
        <Field
          label="Dose"
          value={form.dose}
          set={(v: string) => setForm({ ...form, dose: v })}
          placeholder="e.g. 10 mg"
          theme={theme}
          scale={scale}
        />
        <View style={s.two}>
          <Field
            label="Time"
            value={form.time}
            set={(v: string) => setForm({ ...form, time: v })}
            placeholder="21:00"
            theme={theme}
            scale={scale}
          />
          <Field
            label="Frequency"
            value={form.frequency}
            set={(v: string) => setForm({ ...form, frequency: v })}
            placeholder="Once daily"
            theme={theme}
            scale={scale}
          />
        </View>
        <Field
          label="Remaining supply"
          value={form.supply}
          set={(v: string) => setForm({ ...form, supply: v })}
          placeholder="30"
          theme={theme}
          scale={scale}
        />
        <Field
          label="Refill date"
          value={form.refill}
          set={(v: string) => setForm({ ...form, refill: v })}
          placeholder="Optional"
          theme={theme}
          scale={scale}
        />
        <View style={s.two}>
          <Field
            label="Start date"
            value={form.startDate || ""}
            set={(v: string) => setForm({ ...form, startDate: v })}
            placeholder="Optional"
            theme={theme}
            scale={scale}
          />
          <Field
            label="End date"
            value={form.endDate || ""}
            set={(v: string) => setForm({ ...form, endDate: v })}
            placeholder="Optional"
            theme={theme}
            scale={scale}
          />
        </View>
        <View style={s.two}>
          <Field
            label="Prescription expiry"
            value={form.prescriptionExpiry || ""}
            set={(v: string) => setForm({ ...form, prescriptionExpiry: v })}
            placeholder="Optional"
            theme={theme}
            scale={scale}
          />
          <Field
            label="Repeats"
            value={form.repeats || ""}
            set={(v: string) => setForm({ ...form, repeats: v })}
            placeholder="Optional"
            theme={theme}
            scale={scale}
          />
        </View>
        <Field
          label="Instructions from label"
          value={form.instructions}
          set={(v: string) => setForm({ ...form, instructions: v })}
          placeholder="Copy directions exactly"
          theme={theme}
          scale={scale}
          multiline
        />
        <Pressable
          onPress={save}
          accessibilityRole="button"
          accessibilityLabel="Save medication"
          style={[s.secondary, { backgroundColor: theme.cyan }]}
        >
          <Text
            style={{
              color: theme.blue,
              fontWeight: "800",
              fontSize: 14 * scale,
            }}
          >
            Save medication
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Saved medications
        </Text>
        {!meds.length && (
          <Text style={[s.muted, { color: theme.muted, fontSize: 13 * scale }]}>
            No medicines saved yet.
          </Text>
        )}
        {meds.map((m: Medication) => {
          const dup = dupes.has(normalize(m.name) + ":" + normalize(m.dose));
          return (
            <View
              key={m.id}
              style={[
                s.row,
                {
                  borderTopColor: dup ? "#f2c1c7" : theme.line,
                  backgroundColor: dup ? "#fff3f4" : theme.white,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    s.rowTitle,
                    { color: theme.navy, fontSize: 15 * scale },
                  ]}
                >
                  {m.name} {m.dose}
                </Text>
                <Text
                  style={[
                    s.muted,
                    { color: theme.muted, fontSize: 12 * scale },
                  ]}
                >
                  {m.frequency || "Schedule not set"} ·{" "}
                  {m.instructions || "Check label"}
                </Text>
                {dup && (
                  <Text style={[s.warn, { fontSize: 12 * scale }]}>
                    Warning: duplicate name and dose saved
                  </Text>
                )}
              </View>
              <View style={s.actions}>
                <Pressable
                  onPress={() => toggle(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${m.name} ${m.takenToday ? "not taken" : "taken"} today`}
                  style={s.action}
                >
                  <Text
                    style={{
                      color: m.takenToday ? theme.green : theme.blue,
                      fontSize: 12,
                    }}
                  >
                    {m.takenToday ? "Taken" : "Due"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => remove(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${m.name}`}
                  style={s.delete}
                >
                  <Text style={s.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
      <View style={s.notice}>
        <Text
          style={[s.noticeText, { color: theme.muted, fontSize: 12 * scale }]}
        >
          Potential clashes or allergy warnings must be confirmed with a
          pharmacist or clinician. Never change prescription medicine based only
          on AI output.
        </Text>
      </View>
    </View>
  );
}
function Appointments({
  theme,
  scale,
  items,
  form,
  setForm,
  save,
  remove,
  prepare,
}: any) {
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        Keep upcoming visits, questions, notes and follow-ups in one place.
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Add appointment
        </Text>
        <Field
          label="Reason"
          value={form.title}
          set={(v: string) => setForm({ ...form, title: v })}
          placeholder="e.g. annual review"
          theme={theme}
          scale={scale}
        />
        <Field
          label="Provider"
          value={form.provider}
          set={(v: string) => setForm({ ...form, provider: v })}
          placeholder="Doctor or clinic"
          theme={theme}
          scale={scale}
        />
        <View style={s.two}>
          <Field
            label="Date"
            value={form.date}
            set={(v: string) => setForm({ ...form, date: v })}
            placeholder="22 Aug 2026"
            theme={theme}
            scale={scale}
          />
          <Field
            label="Time"
            value={form.time}
            set={(v: string) => setForm({ ...form, time: v })}
            placeholder="10:00"
            theme={theme}
            scale={scale}
          />
        </View>
        <Field
          label="Location"
          value={form.location}
          set={(v: string) => setForm({ ...form, location: v })}
          placeholder="Optional"
          theme={theme}
          scale={scale}
        />
        <Field
          label="Questions or notes"
          value={form.notes}
          set={(v: string) => setForm({ ...form, notes: v })}
          placeholder="What do I want to ask?"
          theme={theme}
          scale={scale}
          multiline
        />
        <Pressable
          onPress={save}
          accessibilityRole="button"
          style={[s.secondary, { backgroundColor: theme.cyan }]}
        >
          <Text style={{ color: theme.blue, fontWeight: "800" }}>
            Save appointment
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Your appointments
        </Text>
        {!items.length && (
          <Text style={[s.muted, { color: theme.muted, fontSize: 13 * scale }]}>
            No appointments saved yet.
          </Text>
        )}
        {items.map((a: Appointment) => (
          <View key={a.id} style={[s.row, { borderTopColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  s.rowTitle,
                  { color: theme.navy, fontSize: 15 * scale },
                ]}
              >
                {a.title}
              </Text>
              <Text
                style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}
              >
                {a.provider || "Provider not set"} · {a.date || "Date not set"}{" "}
                {a.time}
              </Text>
            </View>
            <View style={s.actions}>
              <Pressable
                onPress={() => prepare(a)}
                accessibilityRole="button"
                accessibilityLabel={`Prepare for ${a.title}`}
                style={[s.action, { backgroundColor: theme.cyan }]}
              >
                <Text
                  style={{ color: theme.blue, fontWeight: "800", fontSize: 12 }}
                >
                  Prepare
                </Text>
              </Pressable>
              <Pressable
                onPress={() => remove(a)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${a.title}`}
                style={s.delete}
              >
                <Text style={s.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
function Health({ theme, scale, profile, editing, setEditing, update, providers, providerForm, setProviderForm, saveProvider, removeProvider }: any) {
  const fields: [keyof Profile, string][] = [
    ["conditions", "Conditions and history"],
    ["allergies", "Allergies and adverse reactions"],
    ["bloodType", "Blood type"],
    ["emergency", "Emergency health information"],
    ["notes", "Relevant health notes"],
  ];
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        Your personal health information stays under your control. Add only what
        you choose to keep here.
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <View style={s.cardHeader}>
          <Text
            style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
          >
            Personal health profile
          </Text>
          <Pressable
            onPress={() => setEditing(!editing)}
            accessibilityRole="button"
          >
            <Text style={{ color: theme.blue, fontWeight: "800" }}>
              {editing ? "Done" : "Edit"}
            </Text>
          </Pressable>
        </View>
        {editing
          ? fields.map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={profile[k]}
                set={(v: string) => update({ ...profile, [k]: v })}
                placeholder="Not added"
                theme={theme}
                scale={scale}
                multiline={k === "notes" || k === "emergency"}
              />
            ))
          : fields.map(([k, label]) => (
              <View key={k} style={[s.row, { borderTopColor: theme.line }]}>
                <Text
                  style={[
                    s.rowTitle,
                    { color: theme.navy, fontSize: 14 * scale },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    s.muted,
                    { color: theme.muted, fontSize: 13 * scale },
                  ]}
                >
                  {profile[k] || "Not added"}
                </Text>
              </View>
            ))}
      </View>
      <View style={s.notice}>
        <Text
          style={[s.noticeText, { color: theme.muted, fontSize: 12 * scale }]}
        >
          Health Memory is optional. Review, edit or delete saved details before
          allowing DoctorAI to use them in a conversation.
        </Text>
      </View>
      <View style={[s.card, { backgroundColor: theme.white, borderColor: theme.line }]}>
        <View style={s.cardHeader}>
          <View>
            <Text style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}>Local doctors</Text>
            <Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}>Private contact directory, separate from appointments</Text>
          </View>
          <Text style={{ color: theme.violet, fontWeight: "900", fontSize: 20 * scale }}>♧</Text>
        </View>
        <Field label="Doctor's name *" value={providerForm.name} set={(v: string) => setProviderForm({ ...providerForm, name: v })} placeholder="e.g. Dr. Morgan" theme={theme} scale={scale} />
        <Field label="Practice or clinic" value={providerForm.practice} set={(v: string) => setProviderForm({ ...providerForm, practice: v })} placeholder="Optional" theme={theme} scale={scale} />
        <Field label="Phone" value={providerForm.phone} set={(v: string) => setProviderForm({ ...providerForm, phone: v })} placeholder="Optional" theme={theme} scale={scale} keyboardType="phone-pad" />
        <Field label="Email" value={providerForm.email} set={(v: string) => setProviderForm({ ...providerForm, email: v })} placeholder="Optional" theme={theme} scale={scale} keyboardType="email-address" />
        <Field label="Address" value={providerForm.address} set={(v: string) => setProviderForm({ ...providerForm, address: v })} placeholder="Optional" theme={theme} scale={scale} />
        <Field label="Notes" value={providerForm.notes} set={(v: string) => setProviderForm({ ...providerForm, notes: v })} placeholder="Optional" theme={theme} scale={scale} multiline />
        <Pressable onPress={saveProvider} accessibilityRole="button" style={[s.primary, { backgroundColor: theme.navy }]}>
          <Text style={{ color: theme.white, fontWeight: "900" }}>Save local doctor</Text>
        </Pressable>
        {!providers.length ? <Text style={[s.muted, { color: theme.muted, marginTop: 12 }]}>No local doctors added yet.</Text> : providers.map((provider: Provider) => (
          <View key={provider.id} style={[s.providerRow, { borderTopColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}>{provider.name}</Text>
              {!!provider.practice && <Text style={[s.muted, { color: theme.muted }]}>{provider.practice}</Text>}
              {!!provider.phone && <Text style={[s.muted, { color: theme.muted }]}>{provider.phone}</Text>}
              {!!provider.email && <Text style={[s.muted, { color: theme.muted }]}>{provider.email}</Text>}
              {!!provider.address && <Text style={[s.muted, { color: theme.muted }]}>{provider.address}</Text>}
            </View>
            <Pressable onPress={() => removeProvider(provider)} accessibilityRole="button" accessibilityLabel={`Delete ${provider.name}`} style={s.delete}>
              <Text style={s.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
function Results({ theme, scale, items, form, setForm, save, upload }: any) {
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        Record measurements and keep test results together. AI explanations do
        not replace clinical advice.
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Add a measurement
        </Text>
        <Field
          label="Measurement type"
          value={form.type}
          set={(v: string) => setForm({ ...form, type: v })}
          placeholder="Weight, blood pressure, mood…"
          theme={theme}
          scale={scale}
        />
        <Field
          label="Value"
          value={form.value}
          set={(v: string) => setForm({ ...form, value: v })}
          placeholder="e.g. 72 kg or 120/80"
          theme={theme}
          scale={scale}
        />
        <Pressable
          onPress={save}
          accessibilityRole="button"
          style={[s.secondary, { backgroundColor: theme.cyan }]}
        >
          <Text style={{ color: theme.blue, fontWeight: "800" }}>
            Save measurement
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Recent measurements
        </Text>
        {!items.length && (
          <Text style={[s.muted, { color: theme.muted, fontSize: 13 * scale }]}>
            No measurements recorded yet.
          </Text>
        )}
        {items.map((m: Measurement) => (
          <View key={m.id} style={[s.row, { borderTopColor: theme.line }]}>
            <Text
              style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}
            >
              {m.type}
            </Text>
            <Text
              style={[s.muted, { color: theme.muted, fontSize: 13 * scale }]}
            >
              {m.value} · {m.date}
            </Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={upload}
        accessibilityRole="button"
        style={[s.primary, { backgroundColor: theme.navy }]}
      >
        <Text style={s.primaryText}>Upload a result · Pro</Text>
      </Pressable>
    </View>
  );
}
function Timeline({ theme, scale, state }: any) {
  const entries = [
    ...state.timeline.map((entry: TimelineEntry) => ({ id: entry.id, label: entry.type || "Health record", title: entry.title, detail: entry.description || entry.date })),
    ...state.medications.map((m: Medication) => ({
      id: m.id,
      label: "Medication",
      title: `${m.name} ${m.dose}`,
      detail: m.frequency || "Saved medication",
    })),
    ...state.appointments.map((a: Appointment) => ({
      id: a.id,
      label: "Appointment",
      title: a.title,
      detail: `${a.provider || "Provider not set"} · ${a.date || "Date not set"}`,
    })),
    ...state.measurements.map((m: Measurement) => ({
      id: m.id,
      label: "Measurement",
      title: `${m.type}: ${m.value}`,
      detail: m.date,
    })),
  ];
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        A chronological view of saved health information across the hub.
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        {!entries.length && (
          <Text style={[s.muted, { color: theme.muted, fontSize: 13 * scale }]}>
            Your timeline will appear as you add health information.
          </Text>
        )}
        {entries.map((e: any) => (
          <View
            key={e.id}
            style={[s.timeline, { borderLeftColor: theme.blue }]}
          >
            <Text
              style={[s.eyebrow, { color: theme.blue, fontSize: 12 * scale }]}
            >
              {e.label}
            </Text>
            <Text
              style={[s.rowTitle, { color: theme.navy, fontSize: 15 * scale }]}
            >
              {e.title}
            </Text>
            <Text
              style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}
            >
              {e.detail}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
function Documents({ theme, scale, items, upload, remove, open, opening }: any) {
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        Keep prescriptions, lab reports, referrals, discharge letters and
        specialist documents together.
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: theme.white, borderColor: theme.line },
        ]}
      >
        <Text style={[s.cardTitle, { color: theme.navy, fontSize: 18 * scale }]}>Secure document area</Text>
        <Text style={[s.muted, { color: theme.muted, fontSize: 14 * scale }]}>
          Upload and organise the files you choose. Open a document to review its original content; uploads do not automatically extract or explain it.
        </Text>
        <Pressable
          onPress={upload}
          accessibilityRole="button"
          style={[s.primary, { backgroundColor: theme.navy, marginTop: 15 }]}
        >
          <Text style={s.primaryText}>Upload a document · Pro</Text>
        </Pressable>
        {!items.length && <Text style={[s.muted, { color: theme.muted, fontSize: 13 * scale, marginTop: 14 }]}>No private documents saved yet.</Text>}
        {items.map((document: HealthDocument) => (
          <View key={document.id} style={[s.row, { borderTopColor: theme.line, flexDirection: "column", alignItems: "stretch" }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}>{document.title}</Text>
              <Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}>{document.type} · {document.date} · {document.size}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <Pressable disabled={Boolean(opening)} onPress={() => open(document)} accessibilityRole="button" accessibilityLabel={`Open ${document.title}`} style={[s.action, { minHeight: 48 }]}><Text style={{ color: theme.blue, fontWeight: "800" }}>{opening === document.id ? "Opening…" : "Open document"}</Text></Pressable>
              <Pressable disabled={Boolean(opening)} onPress={() => remove(document)} accessibilityRole="button" accessibilityLabel={`Delete ${document.title}`} style={s.delete}><Text style={s.deleteText}>Delete</Text></Pressable>
            </View>
          </View>
        ))}
      </View>
      <View style={s.notice}>
        <Text
          style={[s.noticeText, { color: theme.muted, fontSize: 12 * scale }]}
        >
          Only upload documents you are comfortable storing. Privacy permissions
          and Health Memory controls remain available in account settings.
        </Text>
      </View>
    </View>
  );
}
function Research({ theme, scale, topic, setTopic, items, busy, search }: any) {
  return (
    <View>
      <Text style={[s.lead, { color: theme.muted, fontSize: 14 * scale }]}>
        Discover newly indexed medical papers in plain language, with the
        original source and study context kept visible.
      </Text>
      <View style={[s.researchCard, { borderColor: theme.line }]}>
        <Text style={[s.eyebrow, { color: theme.blue, fontSize: 12 * scale }]}>
          G.L. EVIDENCE LIBRARY
        </Text>
        <Text
          style={[s.researchTitle, { color: theme.navy, fontSize: 24 * scale }]}
        >
          Evidence, without the academic overload.
        </Text>
        <Text style={[s.muted, { color: theme.muted, fontSize: 13 * scale }]}>Browse highlights or search topics such as Ozempic and GLP-1 medicines, weight loss and diabetes, cosmetics, wellbeing, or new medicines.</Text>
        <TextInput value={topic} onChangeText={setTopic} placeholder="Search a research topic" placeholderTextColor="#78909e" accessibilityLabel="Search medical research" style={[s.field, { marginTop: 16, borderColor: theme.line, color: theme.navy, fontSize: 14 * scale }]} />
        <Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale, marginTop: 6 }]}>Your topic is sent to DoctorAI and Europe PMC to find public research. Avoid names or details that could identify you.</Text>
        <Pressable
          onPress={() => search(topic)}
          accessibilityRole="button"
          style={[s.primary, { backgroundColor: theme.navy, marginTop: 18 }]}
        >
          <Text style={s.primaryText}>{busy ? "Searching…" : "Explore research"}</Text>
        </Pressable>
        {!items.length && !busy && <Pressable onPress={() => search("")} accessibilityRole="button" style={[s.secondary, { backgroundColor: theme.cyan, marginTop: 10 }]}><Text style={{ color: theme.blue, fontWeight: "800" }}>Show latest research</Text></Pressable>}
        {items.slice(0, 5).map((item: any) => (
          <Pressable key={`${item.source || "MED"}-${item.id || item.title}`} onPress={() => item.doi ? Linking.openURL(`https://doi.org/${item.doi}`) : Linking.openURL(`https://europepmc.org/article/${item.source || "MED"}/${item.id || ""}`)} accessibilityRole="link" style={[s.row, { borderTopColor: theme.line }]}>
            <View style={{ flex: 1 }}><Text style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}>{item.title || "Untitled research record"}</Text><Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}>{item.journalTitle || "Medical research"} · {item.firstPublicationDate || item.firstPubDate || "Date unavailable"}</Text></View>
          </Pressable>
        ))}
      </View>
      <View style={s.notice}>
        <Text
          style={[s.noticeText, { color: theme.muted, fontSize: 12 * scale }]}
        >
          Research summaries are educational, not diagnosis or treatment advice.
          Open the original paper before drawing conclusions.
        </Text>
      </View>
    </View>
  );
}
function Settings({ theme, scale, state, update, close, navigate, account, signedIn, authBusy, signIn, signOut, deleteData, exportData, exportBusy, subscription, syncStatus }: any) {
  const { height: screenHeight } = useWindowDimensions();
  const openLegalPage = (path: string) => {
    Linking.openURL(`${API}${path}`).catch(() => {
      Alert.alert("Page unavailable", "Check your connection and try again.");
    });
  };
  const requestAccountDeletion = () => {
    const subject = encodeURIComponent("DoctorAI account deletion request");
    const body = encodeURIComponent([
      "Please delete my DoctorAI account and associated data.",
      `Google sign-in email: ${account?.email || ""}`,
      "",
      "Please do not include health details or payment-card information."
    ].join("\n"));
    Linking.openURL(`mailto:support@doctoraiworld.com?subject=${subject}&body=${body}`).catch(() => {
      Alert.alert(
        "Request account deletion",
        "Email support@doctoraiworld.com from your Google sign-in email. Include only your account email; do not send health details or payment-card information."
      );
    });
  };
  return (
    <ScrollView
      style={[s.settings, { borderBottomColor: theme.line, maxHeight: Math.max(220, Math.min(screenHeight * 0.72, screenHeight - 140)) }]}
      contentContainerStyle={s.settingsContent}
      showsVerticalScrollIndicator
    >
      <View style={s.cardHeader}>
        <Text
          style={[s.cardTitle, { color: theme.navy, fontSize: 17 * scale }]}
        >
          Profile & accessibility
        </Text>
        <Pressable onPress={close} accessibilityRole="button">
          <Text style={{ color: theme.blue, fontWeight: "800" }}>Close</Text>
        </Pressable>
      </View>
      <View style={[s.setting, { borderTopColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}>{signedIn ? account?.name || account?.email : "Not signed in"}</Text>
          <Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}>{signedIn ? `${account?.email || "Private account"} · ${syncStatus}` : "Sign in to sync only your own private health hub."}</Text>
        </View>
        <Pressable disabled={authBusy} onPress={signedIn ? signOut : signIn} accessibilityRole="button" style={[s.action, { backgroundColor: theme.cyan }]}><Text style={{ color: theme.blue, fontWeight: "800", fontSize: 14 * scale }}>{authBusy ? "Working…" : signedIn ? "Sign out" : "Sign in"}</Text></Pressable>
      </View>
      <View style={[s.setting, { borderTopColor: theme.line }]}>
        <View style={{ flex: 1 }}><Text style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}>{subscription.active ? "DoctorAI Pro active" : "Free plan"}</Text><Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}>{subscription.active && subscription.expiresAt ? `Access ends ${new Date(subscription.expiresAt * 1000).toLocaleDateString()}` : "Pro features appear here when active on your signed-in DoctorAI account."}</Text></View>
      </View>
      <View style={[s.setting, { borderTopColor: theme.line, flexDirection: "column", alignItems: "stretch" }]}>
        <Text style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}>Export saved health data</Text>
        <Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale, marginVertical: 8 }]}>Save the entries in this app to a destination you choose. Document files are separate.</Text>
        <Pressable disabled={exportBusy} onPress={exportData} accessibilityRole="button" style={[s.action, { minHeight: 48 }]}><Text style={{ color: theme.blue, fontWeight: "800" }}>{exportBusy ? "Preparing export…" : "Export private health file"}</Text></Pressable>
      </View>
      <View style={[s.toolsSection, { borderTopColor: theme.line }]}>
        <Text style={[s.toolsTitle, { color: theme.navy, fontSize: 14 * scale }]}>More health tools</Text>
        <Text style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}>Everything stays available from this menu.</Text>
        <View style={s.toolsGrid}>
          {tabs.filter(([key]) => !["today", "ask", "health"].includes(key)).map(([key, label, icon]) => (
            <Pressable key={key} onPress={() => navigate(key)} accessibilityRole="button" accessibilityLabel={`Open ${label}`} style={[s.toolLink, { borderColor: theme.line, backgroundColor: theme.bg }]}>
              <Ionicons name={key === "medications" ? "medical-outline" : key === "appointments" ? "calendar-outline" : key === "research" ? "search-outline" : key === "results" ? "analytics-outline" : key === "timeline" ? "list-outline" : "folder-open-outline"} size={18} color={theme.blue} />
              <Text style={[s.toolLinkText, { color: theme.navy, fontSize: 14 * scale }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {[
        ["Larger text", "Increase reading size", state.largeText, "largeText"],
        [
          "Higher contrast",
          "Strengthen borders and text",
          state.highContrast,
          "highContrast",
        ],
        [
          "Reduce motion",
          "Avoid distracting animation",
          state.reduceMotion,
          "reduceMotion",
        ],
      ].map(([label, hint, value, key]: any) => (
        <View key={key} style={[s.setting, { borderTopColor: theme.line }]}>
          <View style={{ flex: 1 }}>
            <Text
              style={[s.rowTitle, { color: theme.navy, fontSize: 14 * scale }]}
            >
              {label}
            </Text>
            <Text
              style={[s.muted, { color: theme.muted, fontSize: 12 * scale }]}
            >
              {hint}
            </Text>
          </View>
          <Switch
            value={value}
            onValueChange={(v) => update({ [key]: v })}
            accessibilityLabel={label}
            trackColor={{ false: "#c3d4dc", true: theme.blue }}
          />
        </View>
      ))}
      <Pressable onPress={() => openLegalPage("/privacy")} accessibilityRole="link" accessibilityLabel="Open the DoctorAI privacy notice" style={s.webSettings}>
        <Text style={{ color: theme.blue, fontWeight: "800", fontSize: 13 * scale }}>
          Privacy notice ↗
        </Text>
      </Pressable>
      <Pressable onPress={() => openLegalPage("/terms")} accessibilityRole="link" accessibilityLabel="Open the DoctorAI terms of use" style={s.webSettings}>
        <Text style={{ color: theme.blue, fontWeight: "800", fontSize: 13 * scale }}>
          Terms of use ↗
        </Text>
      </Pressable>
      <Pressable onPress={() => openLegalPage("/account-deletion")} accessibilityRole="link" accessibilityLabel="Open the DoctorAI World account-deletion request page" style={s.webSettings}>
        <Text style={{ color: theme.blue, fontWeight: "800", fontSize: 13 * scale }}>
          Account deletion request page ↗
        </Text>
      </Pressable>
      <Pressable onPress={requestAccountDeletion} accessibilityRole="link" accessibilityLabel="Email support to request deletion of your DoctorAI account" style={s.webSettings}>
        <Text style={{ color: "#a33e3e", fontWeight: "800", fontSize: 13 * scale }}>
          Request account deletion by email ↗
        </Text>
      </Pressable>
      <Pressable onPress={deleteData} accessibilityRole="button" accessibilityLabel="Delete my DoctorAI health data" style={[s.webSettings, { borderTopWidth: 1, borderTopColor: theme.line }]}>
        <Text style={{ color: "#a33e3e", fontWeight: "800", fontSize: 13 * scale }}>
          Delete my health data
        </Text>
      </Pressable>
    </ScrollView>
  );
}
function Field({
  label,
  value,
  set,
  placeholder,
  theme,
  scale,
  multiline = false,
  keyboardType = "default",
}: any) {
  return (
    <View style={s.fieldWrap}>
      <Text
        style={[s.fieldLabel, { color: theme.muted, fontSize: 12 * scale }]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={set}
        placeholder={placeholder}
        placeholderTextColor="#78909e"
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={[
          s.field,
          {
            borderColor: theme.line,
            color: theme.navy,
            fontSize: 14 * scale,
            minHeight: multiline ? 78 : 48,
          },
        ]}
      />
    </View>
  );
}
function Stat({ label, value, theme, scale }: any) {
  return (
    <View
      style={[
        s.stat,
        { backgroundColor: theme.white, borderColor: theme.line },
      ]}
    >
      <Text style={[s.statLabel, { color: theme.muted, fontSize: 12 * scale }]}>
        {label}
      </Text>
      <Text style={[s.statValue, { color: theme.navy, fontSize: 15 * scale }]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  auroraLine: {
    height: 4,
    backgroundColor: "#5de4f5",
    borderRightWidth: 110,
    borderRightColor: "#a58aff",
    borderLeftWidth: 80,
    borderLeftColor: "#ff8b78",
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerIconButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBrand: { flex: 1, alignItems: "center", justifyContent: "center" },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#1679e8",
    borderWidth: 1,
    borderColor: "#fff",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    flex: 1,
  },
  logo: { width: 145, height: 58 },
  brand: { fontWeight: "800" },
  tagline: { marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  proPill: {
    minHeight: 44,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  profile: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  nav: { backgroundColor: "#f7fbff", borderBottomWidth: 1, paddingVertical: 9 },
  navScroll: { paddingHorizontal: 12, alignItems: "center" },
  navItem: {
    minWidth: 86,
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  navIcon: { fontSize: 17, marginBottom: 2 },
  navText: { fontWeight: "700" },
  screenScroll: { flex: 1 },
  todayViewport: { flex: 1, minHeight: 0 },
  todayScrollContent: { paddingHorizontal: 14, paddingTop: 5, paddingBottom: 24 },
  todayScreen: {},
  content: { paddingHorizontal: 19, paddingTop: 17, paddingBottom: 116 },
  todayContent: { backgroundColor: "#f4faff" },
  eyebrow: { fontWeight: "800", letterSpacing: 1.5, marginTop: 6 },
  title: { fontWeight: "800", marginTop: 11, marginBottom: 19 },
  mobileHero: { paddingTop: 3, paddingBottom: 2 },
  heroIntroRow: { gap: 10 },
  heroTextBlock: { minWidth: 0 },
  mobileHeroGreeting: { fontWeight: "700", marginBottom: 5 },
  mobileHeroEyebrow: {
    color: "#2a7297",
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  mobileHeroTitle: { fontWeight: "800", letterSpacing: -1.35, marginTop: 3 },
  mobileHeroAccent: {
    color: "#137cdc",
    fontWeight: "800",
  },
  mobileHeroCopy: { lineHeight: 18, marginTop: 9 },
  askPrompt: { flex: 1.08, minHeight: 84, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderRadius: 18, shadowColor: "#173550", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  askPromptIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  askPromptTitle: { fontWeight: "800" },
  askPromptHint: { marginTop: 4, lineHeight: 13 },
  askPromptArrow: { fontSize: 20, fontWeight: "800", paddingHorizontal: 6 },
  mobileHeroActions: { flexDirection: "row", gap: 9, marginTop: 21 },
  heroPrimary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  heroSecondary: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileOrbit: {
    height: 350,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginTop: 3,
    marginBottom: 1,
  },
  orbitOuter: {
    position: "absolute",
    width: 246,
    height: 246,
    borderWidth: 1,
    borderColor: "#a58aff",
    borderTopColor: "#ff8b78",
    borderRadius: 123,
  },
  orbitInner: {
    position: "absolute",
    width: 178,
    height: 178,
    borderWidth: 3,
    borderColor: "#5de4f5",
    borderBottomColor: "#57dfbd",
    borderRadius: 89,
  },
  orbitCore: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 6,
    borderColor: "#fff",
    backgroundColor: "#f3fdff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#12557a",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 5,
  },
  orbitLogo: { width: 86, height: 86 },
  orbitSmall: {
    position: "absolute",
    bottom: 8,
    color: "#337692",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  orbitAction: {
    width: 138,
    minHeight: 68,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#123e65",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  orbitActionIconWrap: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 7 },
  orbitActionIcon: { color: "#174667", fontSize: 21, marginRight: 6 },
  orbitActionLabel: {
    color: "#123958",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  orbitActionSubtitle: { color: "#465f73", fontSize: 12, lineHeight: 16, marginTop: 2 },
  orbitAsk: {
    position: "absolute",
    top: 0,
    left: "50%",
    marginLeft: -69,
    zIndex: 5,
  },
  orbitResearch: { position: "absolute", top: 68, left: 0, zIndex: 5 },
  orbitMedicines: { position: "absolute", top: 68, right: 0, zIndex: 5 },
  orbitResults: { position: "absolute", bottom: 68, left: 0, zIndex: 5 },
  orbitAppointments: {
    position: "absolute",
    bottom: 68,
    right: 0,
    zIndex: 5,
  },
  orbitHealth: {
    position: "absolute",
    bottom: 32,
    left: "50%",
    marginLeft: -69,
    zIndex: 5,
  },
  orbitHint: {
    position: "absolute",
    bottom: 1,
    color: "#55798f",
    fontSize: 12,
    fontWeight: "700",
  },
  prescriptionAlert: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 15 },
  prescriptionAlertIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  prescriptionAlertIconText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  prescriptionAlertTitle: { fontWeight: "800" },
  prescriptionAlertMessage: { fontWeight: "700", marginTop: 2, lineHeight: 19 },
  prescriptionAlertMeta: { marginTop: 3, lineHeight: 16 },
  prescriptionAlertAction: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  prescriptionAlertLink: { color: "#176a4e", fontWeight: "800", fontSize: 13 },
  startJourney: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 19, backgroundColor: "#287de6", shadowColor: "#1762bf", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 4 },
  startJourneyIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,.2)", alignItems: "center", justifyContent: "center" },
  startJourneyTitle: { color: "#fff", fontWeight: "800" },
  startJourneyText: { color: "#e5f3ff", lineHeight: 14, marginTop: 3 },
  startJourneyButton: { minHeight: 44, paddingHorizontal: 11, borderRadius: 22, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 4 },
  startJourneyButtonText: { color: "#1b57ba", fontSize: 14, fontWeight: "800" },
  welcome: { borderRadius: 20, padding: 20, borderWidth: 1 },
  kicker: { fontWeight: "800", marginBottom: 8 },
  welcomeTitle: { fontWeight: "700" },
  welcomeText: { lineHeight: 21, marginTop: 8 },
  stats: { flexDirection: "row", marginTop: 14 },
  stat: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginRight: 10,
  },
  statLabel: {},
  statValue: { fontWeight: "800", marginTop: 8 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 17,
    marginTop: 14,
    shadowColor: "#17486a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  cardTitle: { fontWeight: "800", marginBottom: 11 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderTopWidth: 1, paddingTop: 13, marginTop: 13 },
  askCta: {
    marginTop: 14,
    borderRadius: 21,
    padding: 22,
    shadowColor: "#071b36",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 4,
  },
  askTitle: { color: "#bff4ff", fontWeight: "800" },
  spark: { color: "#6ce3f1" },
  askText: { color: "#d7e8ef", lineHeight: 20, marginTop: 7 },
  cta: { color: "#8ee9f4", fontSize: 12, fontWeight: "800", marginTop: 15 },
  mobileResearch: {
    minHeight: 130,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#eff7ff",
    borderBottomWidth: 4,
    borderBottomColor: "#25a9ce",
  },
  mobileResearchKicker: {
    color: "#0759b6",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  mobileResearchTitle: {
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 24,
    marginTop: 8,
  },
  mobileResearchArrow: {
    color: "#0d75f5",
    fontSize: 22,
    fontWeight: "800",
    marginLeft: 12,
  },
  researchCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    backgroundColor: "#f5faff",
  },
  researchTitle: { fontWeight: "800", lineHeight: 30, marginVertical: 10 },
  lead: { lineHeight: 21, marginBottom: 16 },
  primary: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#d7f8ff", fontWeight: "800", fontSize: 14 },
  secondary: {
    minHeight: 50,
    marginTop: 12,
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldWrap: { marginBottom: 11 },
  fieldLabel: { fontWeight: "700", marginBottom: 5 },
  field: {
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    textAlignVertical: "top",
  },
  two: { flexDirection: "row" },
  row: {
    minHeight: 65,
    paddingVertical: 12,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: { fontWeight: "800" },
  muted: { lineHeight: 19, marginTop: 3 },
  actions: { alignItems: "flex-end", marginLeft: 8 },
  action: {
    minHeight: 44,
    minWidth: 48,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  delete: {
    minHeight: 44,
    minWidth: 60,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#efb7bf",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  deleteText: { color: "#b9303f", fontWeight: "800", fontSize: 14 },
  warn: { color: "#b9303f", fontWeight: "800", marginTop: 5 },
  notice: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#c9e1ed",
    backgroundColor: "#f5fbfd",
    padding: 13,
    marginTop: 14,
  },
  noticeText: { lineHeight: 18 },
  safety: {
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#f0dfb4",
    backgroundColor: "#fff8ea",
    marginBottom: 12,
  },
  safetyTitle: { fontWeight: "800" },
  safetyText: { marginTop: 5, lineHeight: 18 },
  chat: { minHeight: 530 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingTop: 13,
  },
  clear: { minHeight: 48, justifyContent: "center", paddingHorizontal: 8 },
  messages: {
    maxHeight: 395,
    backgroundColor: "#fff",
    padding: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  empty: { lineHeight: 21, paddingVertical: 30 },
  bubble: { maxWidth: "90%", borderRadius: 15, padding: 13, marginVertical: 5 },
  user: { alignSelf: "flex-end" },
  ai: { alignSelf: "flex-start", borderWidth: 1 },
  userText: { color: "#fff", lineHeight: 21 },
  aiText: { color: "#153452", lineHeight: 21 },
  quick: { flexDirection: "row", paddingVertical: 10 },
  quickButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  composer: { flexDirection: "row", alignItems: "flex-end", marginTop: 5 },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
  },
  send: {
    minHeight: 52,
    paddingHorizontal: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendText: { color: "#fff", fontWeight: "800" },
  bottomNav: {
    minHeight: 72,
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 7,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  bottomItem: { width: 58, minHeight: 56, alignItems: "center", justifyContent: "flex-start", paddingTop: 2 },
  bottomItemLabel: { fontWeight: "700", marginTop: 4 },
  bottomCenterWrap: { width: 64, alignItems: "center", marginTop: -25 },
  bottomCenterButton: { width: 62, height: 62, borderRadius: 31, borderWidth: 5, borderColor: "#fff", backgroundColor: "#edfaff", alignItems: "center", justifyContent: "center", shadowColor: "#1578e5", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5 },
  bottomCenterLogo: { width: 45, height: 45 },
  settings: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
  },
  settingsContent: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  setting: {
    minHeight: 62,
    borderTopWidth: 1,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  toolsSection: { borderTopWidth: 1, paddingTop: 13, paddingBottom: 4 },
  toolsTitle: { fontWeight: "800" },
  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  toolLink: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  toolLinkText: { fontWeight: "700" },
  webSettings: { minHeight: 48, justifyContent: "center" },
  timeline: {
    borderLeftWidth: 3,
    paddingLeft: 13,
    paddingVertical: 13,
    marginVertical: 4,
  },
  healthBriefingButton: { width: "100%", minHeight: 78, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 19, backgroundColor: "#0876dc", shadowColor: "#075db5", shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 5 },
  healthBriefingButtonIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  healthBriefingButtonTitle: { color: "#fff", fontWeight: "900", letterSpacing: -0.2 },
  healthBriefingButtonHint: { color: "#fff", lineHeight: 17, marginTop: 3 },
  healthBriefingButtonArrow: { width: 35, height: 35, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  briefingScreen: { flex: 1, backgroundColor: "#f4f9fd" },
  briefingHeader: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#d8e7f2", backgroundColor: "#fff" },
  briefingEyebrow: { color: "#0759b6", fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  briefingTitle: { color: "#071b36", fontWeight: "900", letterSpacing: -0.6, marginTop: 3 },
  briefingClose: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, borderColor: "#d8e7f2", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  briefingContent: { padding: 16, paddingBottom: 38, gap: 12 },
  briefingSummary: { minHeight: 130, flexDirection: "row", alignItems: "center", gap: 13, padding: 19, borderRadius: 22, backgroundColor: "#0876dc", shadowColor: "#075db5", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 4 },
  briefingSummaryKicker: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  briefingSummaryTitle: { color: "#fff", fontWeight: "900", letterSpacing: -0.5, marginTop: 7 },
  briefingSummaryText: { color: "#fff", fontSize: 14, lineHeight: 21, marginTop: 6 },
  briefingCard: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: "#d8e7f2", backgroundColor: "#fff" },
  briefingCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  briefingCardKicker: { color: "#28678d", fontSize: 12, fontWeight: "900", letterSpacing: 0.9 },
  briefingCardTitle: { color: "#102e49", fontSize: 17, fontWeight: "900", letterSpacing: -0.3, marginTop: 5, marginBottom: 10 },
  briefingLinkButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  briefingLink: { color: "#096ba9", fontSize: 14, fontWeight: "800" },
  briefingEmpty: { color: "#52697a", fontSize: 14, lineHeight: 21 },
  briefingListRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#e8f0f5" },
  briefingMedicineIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#edf6ff", alignItems: "center", justifyContent: "center" },
  briefingItemTitle: { color: "#173550", fontSize: 14, fontWeight: "800" },
  briefingItemMeta: { color: "#52697a", fontSize: 13, lineHeight: 19, marginTop: 3 },
  briefingTaken: { color: "#176a4e", fontSize: 12, fontWeight: "800", marginTop: 4 },
  briefingDue: { color: "#80550e", fontSize: 12, fontWeight: "800", marginTop: 4 },
  briefingVerifiedCard: { borderColor: "#bfe0ee", backgroundColor: "#f7fcff" },
  briefingBullet: { color: "#3f5d72", fontSize: 14, lineHeight: 21, marginTop: 7 },
  briefingSourceLink: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginTop: 7 },
  briefingSourceText: { color: "#096ba9", fontSize: 14, fontWeight: "800" },
  briefingClashBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderWidth: 1, borderRadius: 12 },
  briefingClashText: { flex: 1, fontSize: 14, lineHeight: 21 },
  briefingSymptomRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#edf1f4" },
  briefingSelfCare: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: "#fff9f6", borderWidth: 1, borderColor: "#f0d9d2" },
  briefingSelfCareTitle: { color: "#8b4b43", fontSize: 14, fontWeight: "900" },
  briefingUrgent: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: "#fff2f0", borderWidth: 1, borderColor: "#eebdb8" },
  briefingUrgentTitle: { color: "#8b302b", fontSize: 14, fontWeight: "900", marginBottom: 2 },
  briefingAiCard: { borderColor: "#bedfea", backgroundColor: "#f5fbfe" },
  briefingLoading: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 55 },
  briefingAiText: { color: "#35576e", fontSize: 14, lineHeight: 22 },
  briefingErrorText: { color: "#8b4b43", fontSize: 14, lineHeight: 21 },
  briefingPrimary: { minHeight: 48, marginTop: 11, borderRadius: 12, backgroundColor: "#0876dc", alignItems: "center", justifyContent: "center" },
  briefingPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  briefingSecondary: { minHeight: 44, marginTop: 10, borderRadius: 11, borderWidth: 1, borderColor: "#bcd9e7", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  briefingSecondaryText: { color: "#096ba9", fontSize: 14, fontWeight: "800" },
  briefingSafety: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#ead4c3", backgroundColor: "#fff9f4" },
  briefingSafetyText: { color: "#725f53", fontSize: 14, lineHeight: 21 },
});
