import { forwardRef } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";

import type { Selection } from "@/lib/codeforge-editor";

export type CodeForgeEditorSurfaceProps = Omit<TextInputProps, "selection" | "onSelectionChange" | "onChangeText"> & {
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
  onTextChange: (text: string) => void;
};

/**
 * Phase 5 fallback surface. The document/session core remains authoritative;
 * this adapter owns only native text input, focus, selection, and keyboard wiring.
 * A future Android native surface can implement the same contract without
 * changing document transactions or persistence.
 */
export const CodeForgeEditorSurface = forwardRef<TextInput, CodeForgeEditorSurfaceProps>(function CodeForgeEditorSurface(
  { selection, onSelectionChange, onTextChange, ...props },
  ref,
) {
  return (
    <TextInput
      {...props}
      ref={ref}
      selection={{ start: selection.anchor, end: selection.head }}
      onSelectionChange={(event) => onSelectionChange({ anchor: event.nativeEvent.selection.start, head: event.nativeEvent.selection.end })}
      onChangeText={onTextChange}
      multiline
      editable
      disableFullscreenUI
      textAlignVertical="top"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      accessibilityRole="text"
      accessibilityLabel={props.accessibilityLabel ?? "Code editor"}
      importantForAccessibility="yes"
      keyboardAppearance={Platform.OS === "ios" ? "dark" : undefined}
    />
  );
});
