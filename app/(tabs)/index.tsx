import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import {
  FILES,
  INITIAL_CONTENT,
  OUTPUT_LINES,
  getWorkspaceStats,
  makeScratchFile,
  type FileItem,
} from "@/lib/codeforge-workspace";
import { analyzeSource, getWorkingTreeState } from "@/lib/codeforge-analysis";

type Mode = "editor" | "files" | "output" | "settings";
const WORKSPACE_STORAGE_KEY = "codeforge.workspace.v1";

function runHaptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(style);
  }
}

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>("editor");
  const [files, setFiles] = useState<FileItem[]>(FILES);
  const [activeFile, setActiveFile] = useState("main.py");
  const [contents, setContents] = useState(INITIAL_CONTENT);
  const [isDirty, setIsDirty] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState("Ready to run");
  const [fontSize, setFontSize] = useState(15);
  const [wordWrap, setWordWrap] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [fileQuery, setFileQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(WORKSPACE_STORAGE_KEY)
      .then((stored) => {
        if (!isMounted) return;
        if (stored) {
          try {
            const workspace = JSON.parse(stored) as {
              files?: FileItem[];
              activeFile?: string;
              contents?: Record<string, string>;
            };
            if (workspace.files?.length) setFiles(workspace.files);
            if (workspace.activeFile) setActiveFile(workspace.activeFile);
            if (workspace.contents) setContents((previous) => ({ ...previous, ...workspace.contents }));
          } catch {
            setLastRun("Started a fresh workspace");
          }
        }
        setIsHydrated(true);
      })
      .catch(() => {
        if (isMounted) {
          setIsHydrated(true);
          setLastRun("Local storage unavailable");
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({ files, activeFile, contents }),
    ).catch(() => setLastRun("Could not persist workspace"));
  }, [activeFile, contents, files, isHydrated]);

  const currentFile = files.find((file) => file.id === activeFile) ?? files[0];
  const currentContent = contents[activeFile] ?? "";
  const workspaceStats = getWorkspaceStats(files, currentContent);
  const diagnostics = analyzeSource(currentContent);
  const workingTree = getWorkingTreeState(contents, INITIAL_CONTENT);

  const stats = useMemo(
    () => [
      { label: "FILES", value: `${workspaceStats.files}` },
      { label: "LINES", value: `${workspaceStats.lines}` },
      { label: "CHARS", value: `${workspaceStats.chars}` },
    ],
    [workspaceStats.chars, workspaceStats.files, workspaceStats.lines],
  );
  const filteredFiles = useMemo(
    () => files.filter((file) => file.name.toLowerCase().includes(fileQuery.trim().toLowerCase())),
    [fileQuery, files],
  );

  const changeMode = (nextMode: Mode) => {
    runHaptic();
    setMode(nextMode);
  };

  const selectFile = (file: FileItem) => {
    runHaptic();
    setActiveFile(file.id);
    setMode("editor");
    setLastRun(`Loaded ${file.name}`);
  };

  const saveFile = () => {
    runHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsDirty(false);
    setLastRun(`${currentFile.name} saved locally`);
  };

  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "text/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const importedName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const importedContent = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const isPython = importedName.endsWith(".py");
      const isHtml = importedName.endsWith(".html");
      const isCss = importedName.endsWith(".css");
      const importedFile: FileItem = {
        id: importedName,
        name: importedName,
        language: isPython ? "Python" : isHtml ? "HTML" : isCss ? "CSS" : "JavaScript",
        icon: isPython ? "PY" : isHtml ? "<>" : isCss ? "#" : "JS",
        color: isPython ? "#FFD166" : isHtml ? "#FF6B35" : isCss ? "#61DAFB" : "#F7DF1E",
      };
      setFiles((previous) => previous.some((file) => file.id === importedFile.id) ? previous : [...previous, importedFile]);
      setContents((previous) => ({ ...previous, [importedFile.id]: importedContent }));
      setActiveFile(importedFile.id);
      setMode("editor");
      setLastRun(`Imported ${importedFile.name}`);
      runHaptic(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      Alert.alert("Import failed", "CodeForge could not read that file as UTF-8 source text.");
    }
  };

  const exportFile = async () => {
    try {
      if (!FileSystem.documentDirectory) throw new Error("No document directory");
      const exportUri = `${FileSystem.documentDirectory}${currentFile.name}`;
      await FileSystem.writeAsStringAsync(exportUri, currentContent, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportUri, { mimeType: "text/plain", dialogTitle: `Share ${currentFile.name}` });
        setLastRun(`Shared ${currentFile.name}`);
      } else {
        Alert.alert("Export ready", `${currentFile.name} was saved inside the CodeForge sandbox.`);
      }
    } catch {
      Alert.alert("Export failed", "CodeForge could not prepare this file for sharing.");
    }
  };

  const runFile = () => {
    runHaptic(Haptics.ImpactFeedbackStyle.Medium);
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      setMode("output");
      setIsRunning(false);
      setLastRun(`Run blocked: ${diagnostics.length} source issue${diagnostics.length === 1 ? "" : "s"}`);
      return;
    }
    setIsRunning(true);
    setMode("output");
    setLastRun(`Running ${currentFile.name}`);
    setTimeout(() => {
      setIsRunning(false);
      setLastRun("Run completed successfully");
    }, 650);
  };

  const createFile = () => {
    const newFile = makeScratchFile();
    if (!contents[newFile.id]) {
      setContents((previous) => ({ ...previous, [newFile.id]: "// Start building here\n" }));
      setFiles((previous) => [...previous, newFile]);
    }
    setActiveFile(newFile.id);
    setMode("editor");
    setLastRun("Created scratch.js");
  };

  const renderFile = ({ item }: { item: FileItem }) => (
    <Pressable
      onPress={() => selectFile(item)}
      style={({ pressed }) => [styles.fileRow, activeFile === item.id && styles.fileRowActive, pressed && styles.pressed]}
    >
      <View style={[styles.fileIcon, { borderColor: item.color }]}>
        <Text style={[styles.fileIconText, { color: item.color }]}>{item.icon}</Text>
      </View>
      <View style={styles.fileMeta}>
        <Text style={styles.fileName}>{item.name}</Text>
        <Text style={styles.fileLanguage}>{item.language}</Text>
      </View>
      {activeFile === item.id ? <View style={styles.activeDot} /> : null}
    </Pressable>
  );

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.page}>
          <View style={styles.topBar}>
            <View style={styles.brandLockup}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>{"</>"}</Text>
              </View>
              <View>
                <Text style={styles.brandName}>CODEFORGE</Text>
                <Text style={styles.brandSubtitle}>MOBILE WORKSPACE</Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                runHaptic();
                setMode("settings");
              }}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            >
              <Text style={styles.avatarText}>CF</Text>
            </Pressable>
          </View>

          <View style={styles.projectBar}>
            <View style={styles.projectInfo}>
              <View style={styles.statusLight} />
              <View>
                <Text style={styles.projectName}>mobile-lab</Text>
                <Text style={styles.projectPath}>~/projects/mobile-lab</Text>
              </View>
            </View>
            <View style={styles.projectActions}>
              <View style={styles.changePill}>
                <Text style={styles.changeText}>{workingTree.changedCount} changed</Text>
              </View>
              <View style={styles.trustPill}>
                <View style={styles.trustDot} />
                <Text style={styles.trustText}>TRUSTED</Text>
              </View>
              <View style={styles.branchPill}>
                <Text style={styles.branchIcon}>⑂</Text>
                <Text style={styles.branchText}>main</Text>
              </View>
            </View>
          </View>

          {mode === "editor" ? (
            <View style={styles.editorArea}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fileTabs}>
                {files.slice(0, 3).map((file) => (
                  <Pressable
                    key={file.id}
                    onPress={() => selectFile(file)}
                    style={({ pressed }) => [styles.fileTab, activeFile === file.id && styles.fileTabActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.tabDot, { color: file.color }]}>●</Text>
                    <Text style={[styles.fileTabText, activeFile === file.id && styles.fileTabTextActive]}>{file.name}</Text>
                    {activeFile === file.id && isDirty ? <Text style={styles.dirtyDot}>•</Text> : null}
                  </Pressable>
                ))}
                <Pressable onPress={createFile} style={({ pressed }) => [styles.newTab, pressed && styles.pressed]}>
                  <Text style={styles.newTabText}>＋</Text>
                </Pressable>
              </ScrollView>

              <View style={styles.editorHeader}>
                <View style={styles.breadcrumbs}>
                  <Text style={styles.breadcrumbMuted}>mobile-lab</Text>
                  <Text style={styles.breadcrumbSlash}>/</Text>
                  <Text style={styles.breadcrumbActive}>{currentFile.name}</Text>
                </View>
                <View style={styles.languagePill}>
                  <View style={[styles.languageDot, { backgroundColor: currentFile.color }]} />
                  <Text style={styles.languagePillText}>{currentFile.language}</Text>
                </View>
              </View>

              <View style={styles.editorShell}>
                <View style={styles.lineNumbers}>
                  {currentContent.split("\n").map((_, index) => (
                    <Text key={`${activeFile}-line-${index}`} style={[styles.lineNumber, index === 0 && styles.lineNumberActive]}>{index + 1}</Text>
                  ))}
                </View>
                <TextInput
                  value={currentContent}
                  onChangeText={(value) => {
                    setContents((previous) => ({ ...previous, [activeFile]: value }));
                    setIsDirty(true);
                  }}
                  multiline
                  scrollEnabled
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  style={[styles.codeInput, { fontSize, lineHeight: fontSize * 1.55 }, !wordWrap && styles.noWrap]}
                  selectionColor="#8B5CF6"
                />
              </View>

              <View style={styles.editorFooter}>
                <View style={styles.footerLeft}>
                  <Text style={styles.footerText}>Ln 1, Col 1</Text>
                  <Text style={styles.footerDivider}>•</Text>
                  <Text style={styles.footerText}>{currentFile.language}</Text>
                </View>
                <View style={styles.footerStatus}>
                  {diagnostics.length ? <Text style={styles.errorState}>{diagnostics.length} issue{diagnostics.length === 1 ? "" : "s"}</Text> : null}
                  <Text style={[styles.saveState, isDirty && styles.saveStateDirty]}>{isDirty ? "Unsaved changes" : "Saved locally"}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable onPress={saveFile} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonIcon}>↥</Text>
                  <Text style={styles.secondaryButtonText}>Save</Text>
                </Pressable>
                <Pressable onPress={exportFile} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonIcon}>↗</Text>
                  <Text style={styles.secondaryButtonText}>Share</Text>
                </Pressable>
                <Pressable onPress={runFile} style={({ pressed }) => [styles.runButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.runButtonIcon}>{isRunning ? "◌" : "▶"}</Text>
                  <Text style={styles.runButtonText}>{isRunning ? "Running" : "Run file"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {mode === "files" ? (
            <View style={styles.panelView}>
              <View style={styles.panelHeadingRow}>
                <View>
                  <Text style={styles.panelEyebrow}>PROJECT EXPLORER</Text>
                  <Text style={styles.panelTitle}>Your workspace</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable onPress={importFile} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                    <Text style={styles.addButtonText}>↑ Import</Text>
                  </Pressable>
                  <Pressable onPress={createFile} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                    <Text style={styles.addButtonText}>＋ New</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={fileQuery}
                  onChangeText={setFileQuery}
                  placeholder="Quick open a file"
                  placeholderTextColor="#74798A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.searchInput}
                />
                {fileQuery ? <Pressable onPress={() => setFileQuery("")}><Text style={styles.clearSearch}>×</Text></Pressable> : null}
              </View>
              <View style={styles.fileListCard}>
                <Text style={styles.cardLabel}>MOBILE-LAB / SOURCE</Text>
                <FlatList data={filteredFiles} renderItem={renderFile} keyExtractor={(item) => item.id} scrollEnabled={false} ListEmptyComponent={<Text style={styles.emptyText}>No files match “{fileQuery}”.</Text>} />
              </View>
              <View style={styles.statsRow}>
                {stats.map((stat) => (
                  <View key={stat.label} style={styles.statCard}>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {mode === "output" ? (
            <View style={styles.panelView}>
              <View style={styles.panelHeadingRow}>
                <View>
                  <Text style={styles.panelEyebrow}>TERMINAL OUTPUT</Text>
                  <Text style={styles.panelTitle}>{isRunning ? "Running task" : "Latest run"}</Text>
                </View>
                <View style={styles.connectedPill}><View style={styles.connectedDot} /><Text style={styles.connectedText}>SANDBOX</Text></View>
              </View>
              <View style={styles.terminalCard}>
                {OUTPUT_LINES.map((line, index) => (
                  <Text key={`${line.text}-${index}`} style={[styles.terminalLine, line.tone === "muted" && styles.terminalMuted, line.tone === "success" && styles.terminalSuccess]}>{line.text}</Text>
                ))}
                {isRunning ? <Text style={styles.terminalCursor}>▌</Text> : null}
              </View>
              <View style={styles.lastRunCard}>
                <Text style={styles.cardLabel}>STATUS</Text>
                <Text style={styles.lastRunText}>{lastRun}</Text>
              </View>
            </View>
          ) : null}

          {mode === "settings" ? (
            <ScrollView style={styles.panelView} contentContainerStyle={styles.settingsContent}>
              <Text style={styles.panelEyebrow}>EDITOR PREFERENCES</Text>
              <Text style={styles.panelTitle}>Tune your workspace</Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingRow}>
                  <View><Text style={styles.settingTitle}>Font size</Text><Text style={styles.settingDetail}>{fontSize}px editor text</Text></View>
                  <View style={styles.stepper}><Pressable onPress={() => setFontSize((value) => Math.max(12, value - 1))} style={styles.stepButton}><Text style={styles.stepButtonText}>−</Text></Pressable><Text style={styles.stepValue}>{fontSize}</Text><Pressable onPress={() => setFontSize((value) => Math.min(20, value + 1))} style={styles.stepButton}><Text style={styles.stepButtonText}>＋</Text></Pressable></View>
                </View>
                <View style={styles.settingRow}>
                  <View><Text style={styles.settingTitle}>Word wrap</Text><Text style={styles.settingDetail}>Wrap long lines on screen</Text></View>
                  <Pressable onPress={() => setWordWrap((value) => !value)} style={[styles.switch, wordWrap && styles.switchOn]}><View style={[styles.switchKnob, wordWrap && styles.switchKnobOn]} /></Pressable>
                </View>
                <View style={styles.settingRow}>
                  <View><Text style={styles.settingTitle}>Runtime profiles</Text><Text style={styles.settingDetail}>Python · JavaScript · HTML/CSS</Text></View>
                  <Text style={styles.settingChevron}>›</Text>
                </View>
              </View>
              <Pressable onPress={() => Alert.alert("CodeForge", "Your local workspace is ready for development.")} style={({ pressed }) => [styles.aboutCard, pressed && styles.pressed]}>
                <View style={styles.aboutIcon}><Text style={styles.aboutIconText}>i</Text></View>
                <View style={styles.aboutCopy}><Text style={styles.settingTitle}>About CodeForge</Text><Text style={styles.settingDetail}>Professional editing, wherever you build.</Text></View>
                <Text style={styles.settingChevron}>›</Text>
              </Pressable>
            </ScrollView>
          ) : null}

          <View style={styles.bottomNav}>
            <NavButton label="Editor" icon="⌘" active={mode === "editor"} onPress={() => changeMode("editor")} />
            <NavButton label="Files" icon="▤" active={mode === "files"} onPress={() => changeMode("files")} />
            <NavButton label="Output" icon="›_" active={mode === "output"} onPress={() => changeMode("output")} />
            <NavButton label="Settings" icon="⚙" active={mode === "settings"} onPress={() => changeMode("settings")} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function NavButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
      <Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: "#101116" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 },
  brandLockup: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandMark: { alignItems: "center", backgroundColor: "#8B5CF6", borderRadius: 9, height: 36, justifyContent: "center", width: 36 },
  brandMarkText: { color: "#FFFFFF", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 13, fontWeight: "700" },
  brandName: { color: "#F8FAFC", fontSize: 15, fontWeight: "800", letterSpacing: 2.2 },
  brandSubtitle: { color: "#7B8192", fontSize: 8, fontWeight: "700", letterSpacing: 1.6, marginTop: 2 },
  avatar: { alignItems: "center", backgroundColor: "#252632", borderColor: "#3A3B4B", borderRadius: 16, borderWidth: 1, height: 32, justifyContent: "center", width: 32 },
  avatarText: { color: "#C4B5FD", fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  projectBar: { alignItems: "center", backgroundColor: "#191A22", borderBottomColor: "#2A2C38", borderBottomWidth: 1, borderTopColor: "#292B37", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  projectInfo: { alignItems: "center", flexDirection: "row", gap: 10 },
  projectActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  changePill: { alignItems: "center", backgroundColor: "#342B1A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  changeText: { color: "#F5B84B", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  statusLight: { backgroundColor: "#45E0A6", borderRadius: 4, height: 8, shadowColor: "#45E0A6", shadowOpacity: 0.65, shadowRadius: 5, width: 8 },
  projectName: { color: "#E9E9F0", fontSize: 13, fontWeight: "700" },
  projectPath: { color: "#777C8D", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 10, marginTop: 3 },
  branchPill: { alignItems: "center", backgroundColor: "#252632", borderRadius: 8, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  branchIcon: { color: "#A78BFA", fontSize: 13 },
  branchText: { color: "#B7B8C8", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 10 },
  trustPill: { alignItems: "center", backgroundColor: "#17352F", borderRadius: 8, flexDirection: "row", gap: 5, paddingHorizontal: 8, paddingVertical: 6 },
  trustDot: { backgroundColor: "#45E0A6", borderRadius: 3, height: 6, width: 6 },
  trustText: { color: "#69DDB1", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  editorArea: { flex: 1 },
  fileTabs: { alignItems: "center", backgroundColor: "#171820", borderBottomColor: "#2A2C38", borderBottomWidth: 1, paddingHorizontal: 14 },
  fileTab: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 2, flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 13 },
  fileTabActive: { borderBottomColor: "#8B5CF6" },
  tabDot: { fontSize: 11 },
  fileTabText: { color: "#7B8192", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 11 },
  fileTabTextActive: { color: "#E6E7EF" },
  dirtyDot: { color: "#F59E0B", fontSize: 15, lineHeight: 11 },
  newTab: { paddingHorizontal: 10, paddingVertical: 10 },
  newTabText: { color: "#8E93A6", fontSize: 20 },
  editorHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  breadcrumbs: { alignItems: "center", flexDirection: "row", gap: 7 },
  breadcrumbMuted: { color: "#73798A", fontSize: 11 },
  breadcrumbSlash: { color: "#484B59", fontSize: 11 },
  breadcrumbActive: { color: "#C6C8D3", fontSize: 11, fontWeight: "700" },
  languagePill: { alignItems: "center", backgroundColor: "#252632", borderRadius: 7, flexDirection: "row", gap: 6, paddingHorizontal: 8, paddingVertical: 5 },
  languageDot: { borderRadius: 3, height: 6, width: 6 },
  languagePillText: { color: "#A8ACBC", fontSize: 10 },
  editorShell: { backgroundColor: "#0C0D12", borderBottomColor: "#252632", borderTopColor: "#252632", borderTopWidth: 1, flex: 1, flexDirection: "row", paddingTop: 17 },
  lineNumbers: { alignItems: "flex-end", paddingHorizontal: 13, width: 48 },
  lineNumber: { color: "#484C5A", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12, lineHeight: 23.25, textAlign: "right" },
  lineNumberActive: { color: "#8B5CF6" },
  codeInput: { color: "#D4D7E2", flex: 1, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), paddingBottom: 20, paddingRight: 18, paddingTop: 0 },
  noWrap: { minWidth: 520 },
  editorFooter: { alignItems: "center", backgroundColor: "#15161E", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 9 },
  footerLeft: { alignItems: "center", flexDirection: "row", gap: 7 },
  footerStatus: { alignItems: "center", flexDirection: "row", gap: 10 },
  footerText: { color: "#717688", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 10 },
  footerDivider: { color: "#454957", fontSize: 10 },
  saveState: { color: "#4CCB9A", fontSize: 10 },
  saveStateDirty: { color: "#F5B84B" },
  errorState: { color: "#FF7676", fontSize: 10, fontWeight: "700" },
  actionRow: { backgroundColor: "#101116", flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  secondaryButton: { alignItems: "center", borderColor: "#3A3B4B", borderRadius: 9, borderWidth: 1, flex: 0.8, flexDirection: "row", gap: 8, justifyContent: "center", paddingVertical: 13 },
  secondaryButtonIcon: { color: "#A3A7B7", fontSize: 17, transform: [{ rotate: "180deg" }] },
  secondaryButtonText: { color: "#C4C7D2", fontSize: 13, fontWeight: "700" },
  runButton: { alignItems: "center", backgroundColor: "#8B5CF6", borderRadius: 9, flex: 1.2, flexDirection: "row", gap: 8, justifyContent: "center", paddingVertical: 13 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  runButtonIcon: { color: "#FFFFFF", fontSize: 13 },
  runButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  panelView: { flex: 1, padding: 20 },
  panelHeadingRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  panelEyebrow: { color: "#8B5CF6", fontSize: 10, fontWeight: "800", letterSpacing: 1.6, marginBottom: 7 },
  panelTitle: { color: "#F1F1F6", fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 6 },
  addButton: { backgroundColor: "#252632", borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9 },
  addButtonText: { color: "#C4B5FD", fontSize: 11, fontWeight: "700" },
  searchBox: { alignItems: "center", backgroundColor: "#191A22", borderColor: "#343644", borderRadius: 9, borderWidth: 1, flexDirection: "row", marginBottom: 12, paddingHorizontal: 11 },
  searchIcon: { color: "#A78BFA", fontSize: 22, marginRight: 8 },
  searchInput: { color: "#E3E4EC", flex: 1, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12, paddingVertical: 12 },
  clearSearch: { color: "#8B90A0", fontSize: 22, paddingLeft: 8 },
  fileListCard: { backgroundColor: "#191A22", borderColor: "#2B2D39", borderRadius: 12, borderWidth: 1, padding: 10 },
  emptyText: { color: "#7B8192", fontSize: 12, padding: 14, textAlign: "center" },
  cardLabel: { color: "#717688", fontSize: 9, fontWeight: "800", letterSpacing: 1.4, marginBottom: 5, paddingHorizontal: 10, paddingTop: 4 },
  fileRow: { alignItems: "center", borderRadius: 8, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 12 },
  fileRowActive: { backgroundColor: "#262333" },
  fileIcon: { alignItems: "center", borderRadius: 5, borderWidth: 1, height: 28, justifyContent: "center", width: 28 },
  fileIconText: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 8, fontWeight: "800" },
  fileMeta: { flex: 1, marginLeft: 12 },
  fileName: { color: "#E3E4EC", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12 },
  fileLanguage: { color: "#73798A", fontSize: 10, marginTop: 4 },
  activeDot: { backgroundColor: "#8B5CF6", borderRadius: 3, height: 6, width: 6 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  statCard: { backgroundColor: "#191A22", borderColor: "#2B2D39", borderRadius: 10, borderWidth: 1, flex: 1, padding: 14 },
  statValue: { color: "#E9E9F0", fontSize: 20, fontWeight: "800" },
  statLabel: { color: "#717688", fontSize: 9, fontWeight: "800", letterSpacing: 1.1, marginTop: 5 },
  connectedPill: { alignItems: "center", backgroundColor: "#17352F", borderRadius: 8, flexDirection: "row", gap: 6, paddingHorizontal: 9, paddingVertical: 7 },
  connectedDot: { backgroundColor: "#45E0A6", borderRadius: 4, height: 7, width: 7 },
  connectedText: { color: "#69DDB1", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  terminalCard: { backgroundColor: "#090A0E", borderColor: "#2B2D39", borderRadius: 12, borderWidth: 1, minHeight: 230, padding: 18 },
  terminalLine: { color: "#D0D4DF", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12, lineHeight: 24 },
  terminalMuted: { color: "#6F7485" },
  terminalSuccess: { color: "#55D6A2" },
  terminalCursor: { color: "#8B5CF6", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 13, marginTop: 5 },
  lastRunCard: { backgroundColor: "#191A22", borderColor: "#2B2D39", borderRadius: 10, borderWidth: 1, marginTop: 14, padding: 14 },
  lastRunText: { color: "#C7C9D4", fontSize: 12, marginTop: 3 },
  settingsContent: { paddingBottom: 30 },
  settingsCard: { backgroundColor: "#191A22", borderColor: "#2B2D39", borderRadius: 12, borderWidth: 1, marginTop: 22, paddingHorizontal: 14 },
  settingRow: { alignItems: "center", borderBottomColor: "#2B2D39", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 72 },
  settingTitle: { color: "#E4E5EC", fontSize: 13, fontWeight: "700" },
  settingDetail: { color: "#7B8192", fontSize: 10, marginTop: 5 },
  stepper: { alignItems: "center", backgroundColor: "#252632", borderRadius: 7, flexDirection: "row", overflow: "hidden" },
  stepButton: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
  stepButtonText: { color: "#C4B5FD", fontSize: 17 },
  stepValue: { color: "#ECECF2", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 11, width: 24, textAlign: "center" },
  switch: { backgroundColor: "#3B3D4A", borderRadius: 13, height: 26, justifyContent: "center", paddingHorizontal: 3, width: 46 },
  switchOn: { backgroundColor: "#6D46C8" },
  switchKnob: { backgroundColor: "#A9ADBA", borderRadius: 10, height: 20, width: 20 },
  switchKnobOn: { alignSelf: "flex-end", backgroundColor: "#FFFFFF" },
  settingChevron: { color: "#74798A", fontSize: 25, fontWeight: "300" },
  aboutCard: { alignItems: "center", backgroundColor: "#191A22", borderColor: "#2B2D39", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginTop: 14, padding: 14 },
  aboutIcon: { alignItems: "center", backgroundColor: "#30265A", borderRadius: 9, height: 35, justifyContent: "center", width: 35 },
  aboutIconText: { color: "#C4B5FD", fontSize: 17, fontWeight: "800" },
  aboutCopy: { flex: 1, marginLeft: 12 },
  bottomNav: { backgroundColor: "#171820", borderTopColor: "#2A2C38", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-around", paddingBottom: Platform.OS === "web" ? 10 : 12, paddingTop: 9 },
  navButton: { alignItems: "center", minWidth: 62, paddingHorizontal: 8, paddingVertical: 3 },
  navIcon: { color: "#6F7485", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 17, height: 22 },
  navIconActive: { color: "#A78BFA" },
  navLabel: { color: "#6F7485", fontSize: 9, fontWeight: "700", marginTop: 3 },
  navLabelActive: { color: "#B9A3FF" },
});
