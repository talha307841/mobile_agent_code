import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as api from "./src/api";
import { colors } from "./src/theme";
import { taskStateColor } from "./src/utils";
import type { Approval, Device, Repository, Task, TaskLog } from "./src/types";

type AppContextValue = {
  machines: Device[];
  selected: Device | null;
  select: (d: Device) => void;
  reload: () => Promise<void>;
  live: boolean;
  loading: boolean;
  connectionError: string | null;
};
const AppContext = createContext<AppContextValue>(null as never);
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const Button = ({
  title,
  onPress,
  danger,
  disabled,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={[s.button, danger && s.danger, disabled && s.disabled]}
  >
    <Text style={s.buttonText}>{title}</Text>
  </Pressable>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
  <View style={s.empty}>
    <Text style={s.muted}>{children}</Text>
  </View>
);
const stateColor = taskStateColor;

function RunEntry({ entry }: { entry: TaskLog }) {
  const [expanded, setExpanded] = useState(false);
  const isTool = ["command", "stdout", "stderr"].includes(entry.stream);
  const text = entry.text || JSON.stringify(entry.payload);
  if (!isTool) {
    return (
      <View style={[s.message, entry.stream === "system" && s.systemMessage]}>
        <Text style={s.logKind}>
          {entry.stream === "agent" ? "CODEX" : "STATUS"}
        </Text>
        <Text selectable style={s.messageText}>
          {text}
        </Text>
      </View>
    );
  }
  return (
    <View style={s.toolCard}>
      <Pressable
        style={s.toolHeader}
        onPress={() => setExpanded((value) => !value)}
      >
        <Ionicons name="terminal-outline" size={17} color={colors.muted} />
        <Text numberOfLines={1} style={s.toolTitle}>
          {entry.stream === "stderr" ? "Command warning" : "Command"}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.muted}
        />
      </Pressable>
      {expanded && (
        <Text selectable style={s.toolText}>
          {text}
        </Text>
      )}
    </View>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [server, setServer] = useState(api.getBaseUrl()),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [isRegister, setRegister] = useState(false);
  const submit = async () => {
    try {
      setBusy(true);
      api.setBaseUrl(server);
      isRegister
        ? await api.register(email, password)
        : await api.login(email, password);
      onDone();
    } catch (e) {
      Alert.alert(
        "Could not sign in",
        String(e instanceof Error ? e.message : e),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.center}>
      <StatusBar style="light" />
      <Text style={s.logo}>AgentDeck</Text>
      <Text style={s.tagline}>Your coding agents, wherever you are.</Text>
      <View style={s.card}>
        <Text style={s.label}>Relay server</Text>
        <TextInput
          autoCapitalize="none"
          value={server}
          onChangeText={setServer}
          style={s.input}
        />
        <Text style={s.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={s.input}
        />
        <Text style={s.label}>Password</Text>
        <TextInput
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={s.input}
        />
        <Button
          disabled={busy || !email || password.length < 12}
          title={
            busy ? "Connecting…" : isRegister ? "Create account" : "Sign in"
          }
          onPress={submit}
        />
        <Pressable onPress={() => setRegister(!isRegister)}>
          <Text style={s.link}>
            {isRegister
              ? "Already registered? Sign in"
              : "First time? Create account"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MachineHeader() {
  const { machines, selected, select, live, connectionError } =
    useContext(AppContext);
  return (
    <View style={s.header}>
      <View>
        <Text style={s.eyebrow}>MACHINE</Text>
        <Text style={s.title}>{selected?.name || "No laptop registered"}</Text>
      </View>
      <View style={s.row}>
        {machines.map((machine) => (
          <Pressable
            key={machine.id}
            onPress={() => select(machine)}
            style={[s.pill, selected?.id === machine.id && s.pillActive]}
          >
            <View
              style={[
                s.dot,
                {
                  backgroundColor: machine.online
                    ? colors.primary
                    : colors.muted,
                },
              ]}
            />
            <Text style={s.pillText}>{machine.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.tiny, connectionError && s.error]}>
        {connectionError || (live ? "Live connection" : "Reconnecting…")}
      </Text>
    </View>
  );
}

function Machines() {
  const { machines, selected, select, reload, loading } =
    useContext(AppContext);
  return (
    <SafeAreaView style={s.page}>
      <MachineHeader />
      <FlatList
        data={machines}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            tintColor={colors.primary}
          />
        }
        keyExtractor={(x) => x.id}
        ListEmptyComponent={
          <View style={s.onboarding}>
            <View style={s.laptopIcon}>
              <Ionicons
                name="laptop-outline"
                size={46}
                color={colors.primary}
              />
            </View>
            <Text style={s.onboardingTitle}>Connect your first laptop</Text>
            <Text style={s.onboardingText}>
              Install the AgentDeck daemon on your laptop and register it with
              this same account. No SSH port or public laptop access is needed.
            </Text>
            <View style={s.step}>
              <Text style={s.stepNumber}>1</Text>
              <Text style={s.stepText}>Register this laptop securely</Text>
            </View>
            <View style={s.step}>
              <Text style={s.stepNumber}>2</Text>
              <Text style={s.stepText}>Choose allowed repositories</Text>
            </View>
            <View style={s.step}>
              <Text style={s.stepNumber}>3</Text>
              <Text style={s.stepText}>Start a task from your phone</Text>
            </View>
            <Button title="Refresh machines" onPress={reload} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => select(item)}
            style={[s.machineCard, selected?.id === item.id && s.selectedCard]}
          >
            <View style={s.machineTop}>
              <View style={s.machineGlyph}>
                <Ionicons
                  name="laptop-outline"
                  size={25}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{item.name}</Text>
                <Text style={s.muted}>
                  {item.label} · {item.default_agent}
                </Text>
              </View>
              <View
                style={[
                  s.statusBadge,
                  { backgroundColor: item.online ? "#193B32" : "#282F43" },
                ]}
              >
                <View
                  style={[
                    s.dot,
                    {
                      backgroundColor: item.online
                        ? colors.primary
                        : colors.muted,
                    },
                  ]}
                />
                <Text
                  style={{
                    color: item.online ? colors.primary : colors.muted,
                    fontSize: 12,
                  }}
                >
                  {item.online ? "Online" : "Offline"}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function NewTask({ navigation }: any) {
  const { selected } = useContext(AppContext);
  const [repos, setRepos] = useState<Repository[]>([]),
    [repo, setRepo] = useState<Repository | null>(null),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingRepos, setLoadingRepos] = useState(false);
  useEffect(() => {
    setRepos([]);
    setRepo(null);
    if (!selected) return;
    setLoadingRepos(true);
    api
      .repositories(selected.id)
      .then((value) => {
        setRepos(value);
        setRepo(value[0] || null);
      })
      .catch((e) => Alert.alert("Could not load repositories", e.message))
      .finally(() => setLoadingRepos(false));
  }, [selected?.id]);
  const submit = async () => {
    if (!selected || !repo) return;
    try {
      setBusy(true);
      const task = await api.createTask({
        device_id: selected.id,
        repository_id: repo.id,
        prompt,
        agent: selected.default_agent,
        idempotency_key: `${Date.now()}-${Math.random()}`,
      });
      setPrompt("");
      Keyboard.dismiss();
      navigation.navigate("Session", { taskId: task.id });
    } catch (e) {
      Alert.alert("Task not sent", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.page}>
      <MachineHeader />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.section}>Repository</Text>
        {loadingRepos ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={s.wrap}>
            {repos.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setRepo(item)}
                style={[s.pill, repo?.id === item.id && s.pillActive]}
              >
                <Text style={s.pillText}>{item.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {!loadingRepos && !repos.length && (
          <Empty>
            No repositories are allowlisted. On the laptop run: agentdeck repo
            add /path/to/project --name project, then restart the daemon.
          </Empty>
        )}
        <Text style={s.section}>What should the agent do?</Text>
        <TextInput
          multiline
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Inspect failing tests, fix the issue, and verify the result."
          placeholderTextColor={colors.muted}
          style={[s.input, s.composer]}
        />
        {selected && !selected.online && (
          <Text style={s.error}>
            This laptop is offline. Start agentdeck daemon on it.
          </Text>
        )}
        <Button
          title={
            busy
              ? "Dispatching…"
              : `Run with ${selected?.default_agent || "agent"}`
          }
          disabled={busy || !selected?.online || !repo || !prompt.trim()}
          onPress={submit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function History({ navigation }: any) {
  const { selected } = useContext(AppContext);
  const [items, setItems] = useState<Task[]>([]),
    [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!selected) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(await api.tasks(selected.id));
    } catch (e) {
      Alert.alert(
        "Could not load history",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SafeAreaView style={s.page}>
      <MachineHeader />
      <FlatList
        data={items}
        onRefresh={load}
        refreshing={loading}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={<Empty>No task history yet.</Empty>}
        renderItem={({ item }) => (
          <Pressable
            style={s.card}
            onPress={() => navigation.navigate("Session", { taskId: item.id })}
          >
            <View style={s.between}>
              <Text numberOfLines={2} style={[s.cardTitle, { flex: 1 }]}>
                {item.prompt}
              </Text>
              <Text style={{ color: stateColor(item.state) }}>
                {item.state}
              </Text>
            </View>
            <Text style={s.tiny}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Session({ route, navigation }: any) {
  const taskId = route.params.taskId as string,
    [task, setTask] = useState<Task | null>(null),
    [entries, setEntries] = useState<TaskLog[]>([]),
    [input, setInput] = useState(""),
    [showDiff, setShowDiff] = useState(false);
  const load = useCallback(async () => {
    try {
      const [found, logs] = await Promise.all([
        api.task(taskId),
        api.logs(taskId),
      ]);
      setTask(found);
      setEntries(logs);
    } catch (e) {
      Alert.alert(
        "Could not load run",
        e instanceof Error ? e.message : String(e),
      );
    }
  }, [taskId]);
  useEffect(() => {
    void load();
    const stop = api.connectEvents((message) => {
      if (message.payload.task_id === taskId) void load();
    });
    return stop;
  }, [load]);
  const isFinished =
    !!task && ["COMPLETED", "FAILED", "CANCELLED"].includes(task.state);
  const send = async () => {
    if (!task || !input.trim()) return;
    try {
      if (isFinished) {
        const next = await api.createTask({
          device_id: task.device_id,
          repository_id: task.repository_id,
          session_id: task.session_id,
          prompt: input.trim(),
          idempotency_key: `${Date.now()}-${Math.random()}`,
        });
        setInput("");
        navigation.replace("Session", { taskId: next.id });
      } else {
        await api.sendInput(taskId, input.trim());
        setInput("");
      }
    } catch (e) {
      Alert.alert("Could not send", e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.between}>
          <Text
            style={[s.title, { color: stateColor(task?.state || "QUEUED") }]}
          >
            {task?.state || "Loading…"}
          </Text>
          {task && !isFinished && (
            <Button
              danger
              title="Stop"
              onPress={() =>
                api
                  .cancelTask(taskId)
                  .then(load)
                  .catch((e) => Alert.alert("Could not stop", e.message))
              }
            />
          )}
        </View>
        <Text style={s.prompt}>{task?.prompt}</Text>
        {entries.map((entry) => (
          <RunEntry key={entry.sequence} entry={entry} />
        ))}
        {task?.error && <Text style={s.error}>{task.error}</Text>}
        {task?.result?.diff && (
          <View style={s.resultCard}>
            <View style={s.between}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Changes</Text>
                <Text style={s.muted}>
                  {task.result.changed_files?.length || 0} changed files
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDiff((value) => !value)}
                style={s.smallButton}
              >
                <Text style={s.smallButtonText}>
                  {showDiff ? "Hide diff" : "View diff"}
                </Text>
              </Pressable>
            </View>
            {showDiff && (
              <Text selectable style={s.diff}>
                {task.result.diff}
              </Text>
            )}
          </View>
        )}
        <Text style={s.section}>
          {isFinished
            ? "Continue this session"
            : "Send follow-up / paste error"}
        </Text>
        <TextInput
          multiline
          value={input}
          onChangeText={setInput}
          style={[s.input, { minHeight: 90 }]}
        />
        <Button
          disabled={!input.trim() || !task}
          title={isFinished ? "Start continuation" : "Send to active run"}
          onPress={send}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ApprovalsScreen() {
  const [items, setItems] = useState<Approval[]>([]);
  const load = () =>
    api
      .approvals()
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    void load();
  }, []);
  return (
    <SafeAreaView style={s.page}>
      <Text style={[s.title, s.content]}>Approvals</Text>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={<Empty>No actions need approval.</Empty>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.cardTitle}>{item.action.replaceAll("_", " ")}</Text>
            <Text style={s.muted}>{JSON.stringify(item.details)}</Text>
            <View style={s.row}>
              <Button
                title="Approve"
                onPress={() => api.decideApproval(item.id, true).then(load)}
              />
              <Button
                danger
                title="Deny"
                onPress={() => api.decideApproval(item.id, false).then(load)}
              />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
function Settings({ onLogout }: { onLogout: () => void }) {
  return (
    <SafeAreaView style={s.page}>
      <View style={s.content}>
        <Text style={s.title}>Settings</Text>
        <Text style={s.label}>Relay</Text>
        <Text selectable style={s.card}>
          {api.getBaseUrl()}
        </Text>
        <Button
          danger
          title="Sign out"
          onPress={() => api.logout().finally(onLogout)}
        />
      </View>
    </SafeAreaView>
  );
}

function Main({ onLogout }: { onLogout: () => void }) {
  const [machines, setMachines] = useState<Device[]>([]),
    [selected, setSelected] = useState<Device | null>(null),
    [live, setLive] = useState(false),
    [loading, setLoading] = useState(false),
    [connectionError, setConnectionError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api.devices();
      setMachines(value);
      setConnectionError(null);
      setSelected(
        (current) =>
          value.find((x) => x.id === current?.id) || value[0] || null,
      );
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return api.connectEvents(() => void reload(), setLive);
  }, [reload]);
  const context = useMemo(
    () => ({
      machines,
      selected,
      select: setSelected,
      reload,
      live,
      loading,
      connectionError,
    }),
    [machines, selected, reload, live, loading, connectionError],
  );
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    Machines: "laptop-outline",
    Task: "add-circle-outline",
    History: "time-outline",
    Approvals: "shield-checkmark-outline",
    Settings: "settings-outline",
  };
  return (
    <AppContext.Provider value={context}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={icons[route.name] || "ellipse-outline"}
              color={color}
              size={size}
            />
          ),
          tabBarStyle: {
            backgroundColor: colors.panel,
            borderTopColor: colors.border,
            height: 72,
            paddingTop: 8,
            paddingBottom: 10,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
        })}
      >
        <Tabs.Screen name="Machines" component={Machines} />
        <Tabs.Screen name="Task" component={NewTask} />
        <Tabs.Screen name="History" component={History} />
        <Tabs.Screen name="Approvals" component={ApprovalsScreen} />
        <Tabs.Screen name="Settings">
          {() => <Settings onLogout={onLogout} />}
        </Tabs.Screen>
      </Tabs.Navigator>
    </AppContext.Provider>
  );
}
export default function App() {
  const [ready, setReady] = useState(false),
    [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    api.onAuthFailure(() => setAuthenticated(false));
    api
      .restoreTokens()
      .then((value) => setAuthenticated(!!value))
      .finally(() => setReady(true));
    return () => api.onAuthFailure();
  }, []);
  if (!ready)
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return (
    <NavigationContainer
      theme={{
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: colors.bg,
          card: colors.panel,
          text: colors.text,
          border: colors.border,
          primary: colors.primary,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.panel },
          headerTintColor: colors.text,
        }}
      >
        {!authenticated ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <Login onDone={() => setAuthenticated(true)} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Home" options={{ headerShown: false }}>
              {() => <Main onLogout={() => setAuthenticated(false)} />}
            </Stack.Screen>
            <Stack.Screen name="Session" component={Session} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    padding: 24,
  },
  content: { padding: 18, gap: 12 },
  logo: { fontSize: 38, fontWeight: "800", color: colors.primary },
  tagline: { color: colors.muted, fontSize: 16, marginBottom: 28 },
  header: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 9,
  },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.muted },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  section: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  card: {
    margin: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.panel,
    gap: 8,
  },
  machineCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.panel,
  },
  machineTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  machineGlyph: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#193B32",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  selectedCard: { borderWidth: 1, borderColor: colors.primary },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 12, marginTop: 10 },
  input: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 13,
    borderRadius: 10,
  },
  composer: { height: 180, textAlignVertical: "top" },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.4 },
  buttonText: { color: colors.bg, fontWeight: "800" },
  link: { color: colors.primary, textAlign: "center", padding: 12 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    backgroundColor: colors.panel2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillActive: { borderWidth: 1, borderColor: colors.primary },
  pillText: { color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4 },
  muted: { color: colors.muted },
  tiny: { color: colors.muted, fontSize: 11 },
  empty: { padding: 28, alignItems: "center" },
  onboarding: {
    margin: 18,
    padding: 22,
    borderRadius: 20,
    backgroundColor: colors.panel,
    gap: 15,
    alignItems: "stretch",
  },
  laptopIcon: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: "#193B32",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  onboardingText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.panel2,
    color: colors.primary,
    textAlign: "center",
    lineHeight: 28,
    fontWeight: "800",
  },
  stepText: { color: colors.text, fontSize: 14 },
  prompt: { color: colors.text, fontSize: 16, lineHeight: 23 },
  message: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  systemMessage: {
    backgroundColor: "transparent",
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    borderRadius: 0,
  },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  toolCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.panel,
    overflow: "hidden",
  },
  toolHeader: {
    minHeight: 46,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  toolTitle: { color: colors.muted, flex: 1, fontWeight: "600" },
  toolText: {
    color: "#DCE6FF",
    backgroundColor: "#080C17",
    padding: 12,
    fontFamily: "monospace",
    fontSize: 11,
  },
  resultCard: {
    padding: 14,
    gap: 12,
    borderRadius: 14,
    backgroundColor: colors.panel,
  },
  smallButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: { color: colors.primary, fontWeight: "700" },
  log: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 10,
    gap: 3,
  },
  logKind: { fontSize: 9, color: colors.primary, fontWeight: "800" },
  logText: { color: colors.text, fontFamily: "monospace", fontSize: 12 },
  diff: {
    color: "#DCE6FF",
    backgroundColor: "#080C17",
    padding: 12,
    fontFamily: "monospace",
    fontSize: 11,
  },
  error: { color: colors.danger },
  tagline2: { color: colors.muted },
});
