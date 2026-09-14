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
  Image,
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
  secondary,
  icon,
  disabled,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
  secondary?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={[s.button, secondary && s.secondaryButton, danger && s.danger, disabled && s.disabled]}
  >
    {icon && <Ionicons name={icon} size={18} color={danger || !secondary ? colors.bg : colors.text} />}
    <Text style={[s.buttonText, secondary && s.secondaryButtonText]}>{title}</Text>
  </Pressable>
);
const Brand = ({ compact = false }: { compact?: boolean }) => (
  <View style={s.brandRow}>
    <Image source={require("./assets/agentdeck-logo-v3.png")} style={compact ? s.brandMarkSmall : s.brandMark} />
    <Text style={compact ? s.brandNameSmall : s.brandName}>
      Agent<Text style={s.brandAccent}>Deck</Text>
    </Text>
  </View>
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
      <Brand />
      <Text style={s.tagline}>Your coding agents. On your machines. In your hands.</Text>
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
      <View style={s.between}>
        <Brand compact />
        <View style={[s.liveBadge, !live && s.liveBadgeOffline]}>
          <View style={[s.dot, { backgroundColor: live ? colors.success : colors.warning }]} />
          <Text style={s.liveText}>{live ? "Live" : "Connecting"}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.machineChips}>
        {machines.map((machine) => (
          <Pressable
            key={machine.id}
            onPress={() => select(machine)}
            style={[s.machineChip, selected?.id === machine.id && s.machineChipActive]}
          >
            <View
              style={[
                s.dot,
                {
                  backgroundColor: machine.online
                    ? colors.success
                    : colors.muted,
                },
              ]}
            />
            <Text numberOfLines={1} style={s.machineChipText}>{machine.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {connectionError && <Text style={s.error}>{connectionError}</Text>}
    </View>
  );
}

function Machines({ navigation }: any) {
  const { machines, selected, select, reload, loading } =
    useContext(AppContext);
  const [recent, setRecent] = useState<Task[]>([]);
  const [pending, setPending] = useState<Approval[]>([]);
  const loadDashboard = useCallback(async () => {
    if (!selected) { setRecent([]); setPending([]); return; }
    try {
      const [tasks, approvals] = await Promise.all([api.tasks(selected.id), api.approvals()]);
      setRecent(tasks.slice(0, 4));
      setPending(approvals.filter((item) => item.status === "PENDING" || item.status === "pending"));
    } catch {}
  }, [selected?.id]);
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  const refresh = async () => { await reload(); await loadDashboard(); };
  return (
    <SafeAreaView style={s.page}>
      <MachineHeader />
      <FlatList
        data={machines}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
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
            <Button
              title="Open setup guide"
              onPress={() => navigation.getParent()?.navigate("LaptopSetup")}
            />
            <Pressable onPress={reload}>
              <Text style={s.link}>I finished setup — refresh</Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={machines.length ? <View style={s.dashboard}>
          <Text style={s.heroTitle}>Your agents are ready.</Text>
          {selected && <Pressable onPress={() => navigation.getParent()?.navigate("LaptopSettings", { deviceId: selected.id })} style={s.machineCard}>
            <View style={s.machineGlyph}><Ionicons name="laptop-outline" size={25} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={s.cardTitle}>{selected.name}</Text><Text style={s.muted}>{selected.label} · {selected.default_agent === "codex" ? "Codex" : "Claude Code"} ready</Text></View>
            <View style={s.statusBadge}><View style={[s.dot, { backgroundColor: selected.online ? colors.success : colors.muted }]} /><Text style={[s.statusText, { color: selected.online ? colors.success : colors.muted }]}>{selected.online ? "Online" : "Offline"}</Text></View>
            <Ionicons name="chevron-forward" size={19} color={colors.muted} />
          </Pressable>}
          <Button icon="play" title="Start a run" onPress={() => navigation.navigate("Run")} disabled={!selected?.online} />
          {!!pending.length && <Pressable style={s.attentionCard} onPress={() => navigation.navigate("Activity")}>
            <View style={s.attentionIcon}><Ionicons name="shield-checkmark" size={22} color={colors.warning} /></View>
            <View style={{ flex: 1 }}><Text style={s.attentionTitle}>{pending.length} permission {pending.length === 1 ? "request" : "requests"}</Text><Text style={s.muted}>Needs your review to continue</Text></View>
            <Ionicons name="chevron-forward" size={20} color={colors.warning} />
          </Pressable>}
          <View style={s.sectionHeader}><Text style={s.section}>Recent tasks</Text><Pressable onPress={() => navigation.navigate("Activity")}><Text style={s.linkInline}>View all</Text></Pressable></View>
          <View style={s.listCard}>{recent.length ? recent.map((task) => <Pressable key={task.id} style={s.taskRow} onPress={() => navigation.getParent()?.navigate("Session", { taskId: task.id })}>
            <View style={[s.stateIcon, { backgroundColor: `${stateColor(task.state)}22` }]}><Ionicons name={task.state === "COMPLETED" ? "checkmark" : task.state === "FAILED" ? "close" : "sync"} size={18} color={stateColor(task.state)} /></View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={s.taskTitle}>{task.prompt}</Text><Text style={s.tiny}>{task.state.replaceAll("_", " ")} · {new Date(task.updated_at).toLocaleString()}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>) : <Empty>No tasks yet. Start your first run.</Empty>}</View>
        </View> : null}
        renderItem={() => null}
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
        <Text style={s.screenTitle}>New run</Text>
        <Text style={s.screenSubtitle}>Tell your agent what to work on.</Text>
        <Text style={s.section}>Target machine</Text>
        {selected && <View style={s.selectorCard}>
          <Ionicons name="laptop-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}><Text style={s.cardTitle}>{selected.name}</Text><Text style={[s.tiny, { color: selected.online ? colors.success : colors.warning }]}>{selected.online ? "●  Online" : "○  Offline"}</Text></View>
        </View>}
        <Text style={s.section}>Repository</Text>
        {loadingRepos ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={s.wrap}>
            {repos.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setRepo(item)}
                style={[s.repoCard, repo?.id === item.id && s.choiceActive]}
              >
                <Ionicons name="folder-outline" size={19} color={repo?.id === item.id ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}><Text style={s.pillText}>{item.name}</Text><Text numberOfLines={1} style={s.tiny}>{item.path}</Text></View>
                {repo?.id === item.id && <Ionicons name="checkmark-circle" size={19} color={colors.primary} />}
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
          placeholder="Describe the work in natural language…"
          placeholderTextColor={colors.muted}
          style={[s.input, s.composer]}
        />
        <Text style={s.counter}>{prompt.length} / 4000</Text>
        <Text style={s.fieldHint}>Quick prompts</Text>
        <View style={s.quickGrid}>{["Fix a bug", "Add a feature", "Refactor code", "Add tests"].map((value, index) => <Pressable key={value} style={s.quickPrompt} onPress={() => setPrompt(value === "Fix a bug" ? "Investigate and fix " : `${value}: `)}><Ionicons name={(["build-outline", "sparkles-outline", "git-branch-outline", "flask-outline"] as const)[index]} size={17} color={colors.primary} /><Text style={s.quickText}>{value}</Text></Pressable>)}</View>
        {selected && !selected.online && (
          <Text style={s.error}>
            This laptop is offline. Start agentdeck daemon on it.
          </Text>
        )}
        <Button
          icon="play"
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

function Activity({ navigation }: any) {
  const { selected } = useContext(AppContext);
  const [items, setItems] = useState<Task[]>([]),
    [approvals, setApprovals] = useState<Approval[]>([]),
    [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!selected) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const [tasks, pending] = await Promise.all([api.tasks(selected.id), api.approvals()]);
      setItems(tasks);
      setApprovals(pending.filter((item) => item.status === "PENDING" || item.status === "pending"));
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
      <View style={s.activityHeading}><Text style={s.screenTitle}>Activity</Text><Text style={s.screenSubtitle}>Runs and permission requests</Text></View>
      <FlatList
        data={items}
        onRefresh={load}
        refreshing={loading}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={approvals.length ? <View style={s.approvalsSection}>
          <Text style={s.settingsSection}>NEEDS ATTENTION</Text>
          {approvals.map((item) => <View key={item.id} style={s.approvalCard}>
            <View style={s.row}><Ionicons name="shield-checkmark" size={22} color={colors.warning} /><View style={{ flex: 1 }}><Text style={s.cardTitle}>{item.action.replaceAll("_", " ")}</Text><Text numberOfLines={2} style={s.muted}>{JSON.stringify(item.details)}</Text></View></View>
            <View style={s.actionRow}><Button secondary danger title="Deny" onPress={() => api.decideApproval(item.id, false).then(load)} /><Button title="Allow once" onPress={() => api.decideApproval(item.id, true).then(load)} /></View>
          </View>)}
          <Text style={s.settingsSection}>ALL RUNS</Text>
        </View> : null}
        ListEmptyComponent={<Empty>No activity yet.</Empty>}
        renderItem={({ item }) => (
          <Pressable
            style={s.activityCard}
            onPress={() => navigation.navigate("Session", { taskId: item.id })}
          >
            <View style={s.between}>
              <Text numberOfLines={2} style={[s.cardTitle, { flex: 1 }]}>
                {item.prompt}
              </Text>
              <View style={[s.stateBadge, { backgroundColor: `${stateColor(item.state)}22` }]}><Text style={[s.stateBadgeText, { color: stateColor(item.state) }]}>{item.state}</Text></View>
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
    [taskApprovals, setTaskApprovals] = useState<Approval[]>([]),
    [decidingApproval, setDecidingApproval] = useState<string | null>(null),
    [input, setInput] = useState(""),
    [showDiff, setShowDiff] = useState(false);
  const load = useCallback(async () => {
    try {
      const [found, logs, approvals] = await Promise.all([
        api.task(taskId),
        api.logs(taskId),
        api.approvals(),
      ]);
      setTask(found);
      setEntries(logs);
      setTaskApprovals(approvals.filter((item) => item.task_id === taskId));
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
  const decide = async (approval: Approval, approved: boolean) => {
    setDecidingApproval(approval.id);
    try {
      await api.decideApproval(approval.id, approved);
      await load();
    } catch (e) {
      Alert.alert(
        "Could not update permission",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setDecidingApproval(null);
    }
  };
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
        <View style={s.sessionHeader}>
          <View style={{ flex: 1 }}><Text numberOfLines={2} style={s.screenTitle}>{task?.prompt || "Loading run…"}</Text><Text style={s.screenSubtitle}>Live agent session</Text></View>
          {task && !isFinished && (
            <Button
              secondary
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
        <View style={s.progressCard}>
          <View style={[s.progressRing, { borderColor: stateColor(task?.state || "QUEUED") }]}><Ionicons name={isFinished ? "checkmark" : "sync"} size={20} color={stateColor(task?.state || "QUEUED")} /></View>
          <View style={{ flex: 1 }}><Text style={s.cardTitle}>{task?.state?.replaceAll("_", " ") || "Loading…"}</Text><Text style={s.muted}>{isFinished ? "Run finished" : "Agent is working on your machine"}</Text></View>
          <View style={[s.stateBadge, { backgroundColor: `${stateColor(task?.state || "QUEUED")}22` }]}><Text style={[s.stateBadgeText, { color: stateColor(task?.state || "QUEUED") }]}>LIVE</Text></View>
        </View>
        {taskApprovals.map((approval) => (
          <View key={approval.id} style={s.approvalCard}>
            <View style={s.row}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Permission required</Text>
                <Text style={s.muted}>
                  {approval.action.replaceAll("_", " ")}
                </Text>
              </View>
            </View>
            <Text selectable style={s.approvalDetails}>
              {JSON.stringify(approval.details, null, 2)}
            </Text>
            <View style={s.actionRow}>
              <Button
                secondary
                title="Allow once"
                disabled={decidingApproval === approval.id}
                onPress={() => void decide(approval, true)}
              />
              <Button
                secondary danger
                title="Deny"
                disabled={decidingApproval === approval.id}
                onPress={() => void decide(approval, false)}
              />
            </View>
          </View>
        ))}
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
          icon="send"
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
function SettingsRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.settingsRow} onPress={onPress}>
      <View style={s.settingsIcon}>
        <Ionicons name={icon} size={21} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text numberOfLines={2} style={s.muted}>
          {detail}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

function Settings({ onLogout, navigation }: { onLogout: () => void; navigation: any }) {
  const { selected, machines } = useContext(AppContext);
  const root = navigation.getParent();
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Settings</Text>
        <Text style={s.settingsSection}>SETUP</Text>
        <View style={s.settingsGroup}>
          <SettingsRow
            icon="laptop-outline"
            title="Connect a laptop"
            detail="Installation, sign-in, repositories, and service setup"
            onPress={() => root?.navigate("LaptopSetup")}
          />
          <SettingsRow
            icon="hardware-chip-outline"
            title="Laptop settings"
            detail={
              selected
                ? `${selected.name} · ${selected.default_agent}`
                : "Connect a laptop to configure it"
            }
            onPress={() =>
              selected
                ? root?.navigate("LaptopSettings", { deviceId: selected.id })
                : root?.navigate("LaptopSetup")
            }
          />
          <SettingsRow
            icon="folder-open-outline"
            title="Repository access"
            detail="Choose which folders AgentDeck is allowed to use"
            onPress={() => root?.navigate("RepositorySetup")}
          />
        </View>
        <Text style={s.settingsSection}>CONNECTION & SECURITY</Text>
        <View style={s.settingsGroup}>
          <View style={s.settingsStaticRow}>
            <Ionicons name="cloud-outline" size={21} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Relay server</Text>
              <Text selectable style={s.muted}>{api.getBaseUrl()}</Text>
            </View>
          </View>
          <View style={s.settingsStaticRow}>
            <Ionicons name="shield-checkmark-outline" size={21} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Protected actions</Text>
              <Text style={s.muted}>Approval required · allow once only</Text>
            </View>
          </View>
        </View>
        <Text style={s.settingsSection}>ACCOUNT</Text>
        <View style={s.settingsGroup}>
          <View style={s.settingsStaticRow}>
            <Ionicons name="desktop-outline" size={21} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Connected laptops</Text>
              <Text style={s.muted}>{machines.length} registered</Text>
            </View>
          </View>
        </View>
        <Button
          danger
          title="Sign out"
          onPress={() => api.logout().finally(onLogout)}
        />
        <Text style={s.version}>AgentDeck 0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const SetupStep = ({ number, title, children }: { number: number; title: string; children: React.ReactNode }) => (
  <View style={s.setupCard}>
    <View style={s.row}>
      <Text style={s.stepNumber}>{number}</Text>
      <Text style={s.cardTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

function CommandBlock({ children }: { children: string }) {
  return <Text selectable style={s.commandBlock}>{children}</Text>;
}

function LaptopSetup() {
  return (
    <SafeAreaView style={s.page} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.guideContent}>
        <View style={s.guideHero}>
          <Image source={require("./assets/agentdeck-logo-v3.png")} style={s.guideLogo} />
          <Text style={s.guideTitle}>Connect your laptop</Text>
          <Text style={s.onboardingText}>
            Your laptop makes an encrypted outbound connection to the relay. You do not open an SSH port or expose your computer publicly.
          </Text>
        </View>
        <SetupStep number={1} title="Install AgentDeck">
          <Text style={s.muted}>On the laptop that will host the relay, install cloudflared and run:</Text>
          <CommandBlock>./scripts/start-public-relay.sh</CommandBlock>
        </SetupStep>
        <SetupStep number={2} title="Use the public URL">
          <Text style={s.muted}>The script prints an HTTPS URL. Use that exact URL when signing in on this phone and every laptop.</Text>
          <CommandBlock>https://example.trycloudflare.com</CommandBlock>
        </SetupStep>
        <SetupStep number={3} title="Connect each laptop">
          <Text style={s.muted}>On both laptops, open this project and replace URL with the one printed above:</Text>
          <CommandBlock>./scripts/connect-laptop.sh URL ~/Documents</CommandBlock>
        </SetupStep>
        <SetupStep number={4} title="Keep the relay running">
          <Text style={s.muted}>The free Quick Tunnel works across networks, but its URL changes after restart and the relay laptop must stay online.</Text>
          <CommandBlock>systemctl --user status agentdeck</CommandBlock>
        </SetupStep>
        <View style={s.infoCard}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          <Text style={[s.muted, { flex: 1 }]}>Return to Machines and pull down to refresh. The laptop should show Online.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RepositorySetup() {
  return (
    <SafeAreaView style={s.page} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.guideContent}>
        <Text style={s.guideTitle}>Repository access</Text>
        <Text style={s.onboardingText}>
          Repositories are allowlisted on the laptop so a phone account can never browse arbitrary folders remotely.
        </Text>
        <SetupStep number={1} title="Discover a folder">
          <CommandBlock>agentdeck repo discover ~/Documents</CommandBlock>
        </SetupStep>
        <SetupStep number={2} title="Add one repository">
          <CommandBlock>agentdeck repo add /path/to/project --name project</CommandBlock>
        </SetupStep>
        <SetupStep number={3} title="Review or remove access">
          <CommandBlock>agentdeck repo list</CommandBlock>
          <CommandBlock>agentdeck repo remove project</CommandBlock>
        </SetupStep>
        <SetupStep number={4} title="Sync changes">
          <CommandBlock>systemctl --user restart agentdeck</CommandBlock>
        </SetupStep>
      </ScrollView>
    </SafeAreaView>
  );
}

function LaptopSettings({ route, navigation }: any) {
  const deviceId = route.params.deviceId as string;
  const [device, setDevice] = useState<Device | null>(null),
    [name, setName] = useState(""),
    [label, setLabel] = useState<"Work" | "Personal">("Personal"),
    [agent, setAgent] = useState<"codex" | "claude">("codex"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api.devices().then((items) => {
      const found = items.find((item) => item.id === deviceId) || null;
      setDevice(found);
      if (found) {
        setName(found.name);
        setLabel(found.label);
        setAgent(found.default_agent);
      }
    }).catch((e) => Alert.alert("Could not load laptop", e.message));
  }, [deviceId]);
  const save = async () => {
    try {
      setBusy(true);
      setDevice(await api.updateDevice(deviceId, { name: name.trim(), label, default_agent: agent }));
      Alert.alert("Saved", "Laptop settings have been updated.");
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const revoke = () => Alert.alert(
    "Remove this laptop?",
    "It will lose access immediately and must be registered again to reconnect.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => api.revokeDevice(deviceId).then(() => navigation.popToTop()) },
    ],
  );
  return (
    <SafeAreaView style={s.page} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.infoCard}>
          <Ionicons name="laptop-outline" size={28} color={colors.primary} />
          <View style={{ flex: 1 }}><Text style={s.cardTitle}>{device?.online ? "Online" : "Offline"}</Text><Text style={s.muted}>{device?.last_seen_at ? `Last seen ${new Date(device.last_seen_at).toLocaleString()}` : "Never connected"}</Text></View>
        </View>
        <Text style={s.label}>Laptop name</Text>
        <TextInput value={name} onChangeText={setName} style={s.input} />
        <Text style={s.section}>Type</Text>
        <View style={s.row}>{(["Personal", "Work"] as const).map((value) => <Pressable key={value} onPress={() => setLabel(value)} style={[s.choiceCard, label === value && s.choiceActive]}><Ionicons name={value === "Work" ? "briefcase-outline" : "person-outline"} size={20} color={label === value ? colors.primary : colors.muted} /><Text style={s.pillText}>{value}</Text></Pressable>)}</View>
        <Text style={s.section}>Default coding agent</Text>
        <View style={s.agentGrid}>{(["codex", "claude"] as const).map((value) => { const available = device?.metadata_json?.agents && Boolean((device.metadata_json.agents as Record<string, unknown>)[value]); return <Pressable key={value} disabled={!available} onPress={() => setAgent(value)} style={[s.agentCard, agent === value && s.choiceActive, !available && s.disabled]}><Text style={s.cardTitle}>{value === "codex" ? "Codex" : "Claude Code"}</Text><Text style={s.tiny}>{available ? "Installed" : "Not detected"}</Text></Pressable>; })}</View>
        <Button title={busy ? "Saving…" : "Save changes"} disabled={busy || !name.trim()} onPress={save} />
        <Pressable onPress={revoke}><Text style={s.removeLink}>Remove laptop</Text></Pressable>
      </ScrollView>
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
    Home: "home-outline",
    Run: "add-outline",
    Activity: "list-outline",
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
            backgroundColor: "#0E1013",
            borderTopColor: colors.border,
            height: 70,
            paddingTop: 7,
            paddingBottom: 9,
          },
          tabBarItemStyle: { minHeight: 52 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
        })}
      >
        <Tabs.Screen name="Home" component={Machines} />
        <Tabs.Screen name="Run" component={NewTask} />
        <Tabs.Screen name="Activity" component={Activity} />
        <Tabs.Screen name="Settings">
          {(props) => <Settings {...props} onLogout={onLogout} />}
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
            <Stack.Screen
              name="LaptopSetup"
              component={LaptopSetup}
              options={{ title: "Laptop setup" }}
            />
            <Stack.Screen
              name="RepositorySetup"
              component={RepositorySetup}
              options={{ title: "Repositories" }}
            />
            <Stack.Screen
              name="LaptopSettings"
              component={LaptopSettings}
              options={{ title: "Laptop settings" }}
            />
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
  content: { padding: 18, paddingBottom: 36, gap: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 64, height: 64, resizeMode: "contain" },
  brandMarkSmall: { width: 31, height: 31, resizeMode: "contain" },
  brandName: { fontSize: 34, fontWeight: "800", color: colors.text, letterSpacing: -1.2 },
  brandNameSmall: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.7 },
  brandAccent: { color: colors.primary },
  tagline: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.muted },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  screenTitle: { fontSize: 26, lineHeight: 31, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  screenSubtitle: { color: colors.muted, fontSize: 14, marginTop: 2 },
  heroTitle: { fontSize: 25, fontWeight: "800", color: colors.text, letterSpacing: -0.5, marginBottom: 2 },
  section: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.panel,
    gap: 8,
  },
  machineCard: {
    minHeight: 76,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  machineTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  machineGlyph: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#262032",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#153024", minHeight: 36, paddingHorizontal: 11, borderRadius: 18 },
  liveBadgeOffline: { backgroundColor: "#332A16" },
  liveText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  machineChips: { gap: 8, paddingRight: 18 },
  machineChip: { minHeight: 38, maxWidth: 180, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 7 },
  machineChipActive: { borderColor: colors.primary, backgroundColor: "#211B2D" },
  machineChipText: { color: colors.text, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  selectedCard: { borderWidth: 1, borderColor: colors.primary },
  settingsSection: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 12,
  },
  settingsGroup: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsRow: {
    minHeight: 76,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsStaticRow: {
    minHeight: 70,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#262032",
    alignItems: "center",
    justifyContent: "center",
  },
  version: { color: colors.muted, textAlign: "center", fontSize: 11, padding: 8 },
  guideContent: { padding: 18, paddingBottom: 40, gap: 14 },
  guideHero: { alignItems: "center", gap: 8, paddingVertical: 8 },
  guideLogo: { width: 108, height: 86, resizeMode: "contain" },
  guideTitle: { color: colors.text, fontSize: 25, fontWeight: "800", textAlign: "center" },
  setupCard: {
    backgroundColor: colors.panel,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    gap: 11,
  },
  commandBlock: {
    color: "#DCE6FF",
    backgroundColor: "#080C17",
    borderRadius: 9,
    padding: 12,
    fontFamily: "monospace",
    fontSize: 12,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: "#211B2D" },
  agentGrid: { flexDirection: "row", gap: 10 },
  agentCard: {
    flex: 1,
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 13,
    justifyContent: "center",
    gap: 4,
  },
  removeLink: { color: colors.danger, textAlign: "center", fontWeight: "700", padding: 14 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 12, marginTop: 10 },
  input: {
    minHeight: 50,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 13,
    borderRadius: 12,
    fontSize: 15,
  },
  composer: { height: 180, textAlignVertical: "top", fontFamily: "monospace", lineHeight: 22 },
  button: {
    minHeight: 50,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  danger: { backgroundColor: colors.danger },
  secondaryButton: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text },
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
  dashboard: { padding: 18, paddingBottom: 34, gap: 14 },
  attentionCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#271E0E", borderWidth: 1, borderColor: "#654716", borderRadius: 14 },
  attentionIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#392A10" },
  attentionTitle: { color: colors.warning, fontSize: 15, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  linkInline: { color: colors.primary, fontSize: 13, fontWeight: "700", padding: 10 },
  listCard: { backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  taskRow: { minHeight: 68, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  stateIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  selectorCard: { minHeight: 68, padding: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  repoCard: { width: "100%", minHeight: 60, padding: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  counter: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: -8 },
  fieldHint: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickPrompt: { width: "48%", minHeight: 48, flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 11 },
  quickText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  activityHeading: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  approvalsSection: { paddingHorizontal: 16, gap: 10 },
  activityCard: { marginHorizontal: 16, marginTop: 10, minHeight: 82, padding: 14, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 9 },
  stateBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  stateBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  actionRow: { flexDirection: "row", gap: 10 },
  sessionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  progressCard: { minHeight: 76, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  progressRing: { width: 42, height: 42, borderWidth: 3, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel2 },
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
    backgroundColor: "#262032",
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
  approvalCard: {
    padding: 14,
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.panel,
  },
  approvalDetails: {
    color: colors.text,
    backgroundColor: colors.panel2,
    borderRadius: 8,
    padding: 10,
    fontFamily: "monospace",
    fontSize: 11,
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
