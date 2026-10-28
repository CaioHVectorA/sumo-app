import Ionicons from '@/components/Icon';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette as c } from '@/src/theme';

export function NumberControl({
  label,
  value,
  onChange,
  step = 50,
  min = -1599,
  max = 1599,
  unit = 'PWM',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const change = (delta: number) =>
    onChange(String(Math.max(min, Math.min(max, (Number(value) || 0) + delta))));
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diminuir ${label}`}
          onPress={() => change(-step)}
          style={s.button}>
          <Ionicons name="remove" size={22} color={c.primary} />
        </Pressable>
        <View style={s.inputWrap}>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            selectTextOnFocus
            keyboardType="numbers-and-punctuation"
            style={s.input}
          />
          <Text style={s.unit}>{unit}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${label}`}
          onPress={() => change(step)}
          style={s.button}>
          <Ionicons name="add" size={22} color={c.primary} />
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', color: c.ink },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    width: 48,
    height: 50,
    borderRadius: 14,
    backgroundColor: c.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    minWidth: 50,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.background,
    borderRadius: 14,
  },
  input: {
    flex: 1,
    minWidth: 24,
    fontSize: 20,
    fontWeight: '600',
    color: c.ink,
    paddingVertical: 10,
    textAlign: 'center',
  },
  unit: { fontSize: 11, color: c.muted },
});
