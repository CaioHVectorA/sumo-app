import Ionicons from '@/components/Icon';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { palette as c } from '@/src/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={ui.titleRow}>
      <View style={{ flex: 1, gap: 6 }}>
        {eyebrow && <Text style={ui.eyebrow}>{eyebrow}</Text>}
        <Text accessibilityRole="header" style={ui.title}>
          {title}
        </Text>
        {description && <Text style={ui.body}>{description}</Text>}
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function Action({
  title,
  icon,
  onPress,
  tone = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const foreground = tone === 'secondary' ? c.ink : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        ui.action,
        {
          backgroundColor:
            tone === 'secondary' ? c.primaryLight : tone === 'danger' ? c.danger : c.primary,
          opacity: disabled || busy ? 0.45 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        icon && <Ionicons name={icon} size={20} color={foreground} />
      )}
      <Text style={[ui.actionText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[ui.notice, { backgroundColor: error ? c.dangerLight : c.primaryLight }]}>
      <Ionicons
        name={error ? 'alert-circle-outline' : 'information-circle-outline'}
        color={error ? c.danger : c.primary}
        size={20}
      />
      <Text style={[ui.body, { flex: 1, color: error ? c.danger : c.ink }]}>{children}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  content: {
    padding: 20,
    gap: 22,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: c.ink, letterSpacing: -1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: c.primary,
    textTransform: 'uppercase',
  },
  body: { fontSize: 14, lineHeight: 21, color: c.muted },
  section: { fontSize: 17, fontWeight: '700', color: c.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  action: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },
  actionText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  notice: { padding: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
});
