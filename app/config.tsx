import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import Ionicons from '@/components/Icon';
import { useRouter } from 'expo-router';
import { useRobot } from '@/src/hooks/useRobot';
import { useConnection } from '@/src/hooks/useConnection';
import { sendWithTimeout } from '@/src/services/bluetooth';
import { Action, Card, Notice, PageTitle, ui } from '@/components/ui';
import { palette as c } from '@/src/theme';

type Field = {
  key: string;
  label: string;
  hint: string;
  unit: string;
  max: number;
  step: number;
  initial: string;
};
const fields: Field[] = [
  {
    key: 'PWM_BASE',
    label: 'Potência de busca',
    hint: 'Velocidade ao procurar o oponente.',
    unit: 'PWM',
    max: 1599,
    step: 50,
    initial: '1300',
  },
  {
    key: 'PWM_MAX_DELTA',
    label: 'Aceleração',
    hint: 'Quanto a potência aumenta a cada ciclo.',
    unit: 'PWM',
    max: 255,
    step: 1,
    initial: '8',
  },
  {
    key: 'BREAK_TIME_1',
    label: 'Freio · sensor central',
    hint: 'Pausa ao detectar com o sensor central.',
    unit: 'ms',
    max: 65535,
    step: 50,
    initial: '250',
  },
  {
    key: 'BREAK_TIME_3',
    label: 'Freio · três sensores',
    hint: 'Pausa quando o oponente está centralizado.',
    unit: 'ms',
    max: 65535,
    step: 50,
    initial: '250',
  },
  {
    key: 'TIME_BEFORE_MOVING',
    label: 'Espera inicial',
    hint: 'Tempo antes de começar a busca.',
    unit: 'ms',
    max: 65535,
    step: 100,
    initial: '1500',
  },
  {
    key: 'VARIANCIA',
    label: 'Variação da estratégia A',
    hint: '0: curto · 1: médio · 2: fundo da arena.',
    unit: '',
    max: 2,
    step: 1,
    initial: '2',
  },
];

export default function ConfigScreen() {
  const router = useRouter();
  const connection = useConnection();
  const { telemetry, isRealTime, setIsRealTime, getSensors, error: sensorError } = useRobot();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.key, field.initial]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const sensorLabels = ['LE', 'CE', 'C', 'CD', 'LD'];
  const valid = (field: Field) =>
    /^\d+$/.test(values[field.key]) && Number(values[field.key]) <= field.max;
  const change = (field: Field, delta: number) =>
    setValues((current) => ({
      ...current,
      [field.key]: String(
        Math.max(0, Math.min(field.max, (Number(current[field.key]) || 0) + delta))
      ),
    }));

  const submit = async (selected: Field[]) => {
    const invalid = selected.find((field) => !valid(field));
    if (invalid) {
      setFeedback({
        message: `${invalid.label}: informe um número inteiro de 0 a ${invalid.max}.`,
        error: true,
      });
      return;
    }
    setBusy(selected.length > 1 ? 'all' : selected[0].key);
    setFeedback(null);
    Vibration.vibrate(12);
    try {
      for (const field of selected) {
        const value = Number(values[field.key]);
        await sendWithTimeout(`${field.key} = ${value}`, (line) =>
          field.key === 'VARIANCIA'
            ? line === `VARIANCIA_${value}_OK`
            : new RegExp(`^${field.key}\\s*=\\s*${value}$`).test(line)
        );
      }
      setFeedback({
        message: connection?.demo
          ? 'Configuração simulada na demonstração.'
          : selected.length > 1
            ? 'Configurações confirmadas pelo robô.'
            : `${selected[0].label}: atualização confirmada.`,
        error: false,
      });
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Não foi possível enviar.',
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const renderField = (field: Field) => (
    <View key={field.key} style={s.field}>
      <View style={{ gap: 4 }}>
        <Text style={s.label}>{field.label}</Text>
        <Text style={ui.body}>{field.hint}</Text>
      </View>
      <View style={[ui.row, { gap: 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diminuir ${field.label}`}
          disabled={Boolean(busy)}
          onPress={() => change(field, -field.step)}
          style={s.stepper}>
          <Ionicons name="remove" size={22} color={c.ink} />
        </Pressable>
        <View style={s.inputWrap}>
          <TextInput
            accessibilityLabel={field.label}
            value={values[field.key]}
            onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            keyboardType="number-pad"
            selectTextOnFocus
            editable={!busy}
            style={s.input}
          />
          <Text style={{ color: c.muted, fontSize: 12 }}>{field.unit}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${field.label}`}
          disabled={Boolean(busy)}
          onPress={() => change(field, field.step)}
          style={s.stepper}>
          <Ionicons name="add" size={22} color={c.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enviar ${field.label}`}
          disabled={!connection || Boolean(busy)}
          onPress={() => void submit([field])}
          style={[
            s.stepper,
            { backgroundColor: c.primaryLight, opacity: !connection || busy ? 0.4 : 1 },
          ]}>
          <Ionicons name="arrow-up" size={22} color={c.primary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={ui.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
        <PageTitle
          eyebrow="Encontre o ponto certo"
          title="Ajustes do robô."
          description="Calibre o movimento e acompanhe os sensores."
        />
        {!connection && (
          <Notice>
            Conecte o robô na aba Início para enviar os ajustes. Você pode preparar os valores
            antes.
          </Notice>
        )}
        {connection?.demo && (
          <Notice>Demonstração: as leituras e confirmações são simuladas.</Notice>
        )}
        {feedback && <Notice error={feedback.error}>{feedback.message}</Notice>}
        {sensorError && <Notice error>{sensorError}</Notice>}
        <Card>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <Text style={ui.section}>Sensores</Text>
            <View style={[ui.row, { gap: 6 }]}>
              <Text style={ui.body}>Ao vivo</Text>
              <Switch
                accessibilityLabel="Atualizar sensores a cada segundo"
                disabled={!connection}
                value={isRealTime && Boolean(connection)}
                onValueChange={setIsRealTime}
                trackColor={{ true: c.primary, false: c.line }}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {sensorLabels.map((label, index) => {
              const inactive = index === 4;
              const active =
                !inactive && telemetry !== null && Boolean(telemetry.sensores & (1 << (4 - index)));
              return (
                <View
                  key={label}
                  accessibilityLabel={`${label}: ${inactive ? 'desativado' : !telemetry ? 'sem leitura' : active ? 'detectando' : 'livre'}`}
                  style={[
                    s.sensor,
                    active && { backgroundColor: c.primary, borderColor: c.primary },
                    inactive && { borderStyle: 'dashed', backgroundColor: c.background },
                  ]}>
                  <Text
                    style={{ fontSize: 17, fontWeight: '700', color: active ? '#FFFFFF' : c.ink }}>
                    {label}
                  </Text>
                  <View style={[s.sensorDot, { backgroundColor: active ? c.lime : c.line }]} />
                  <Text style={{ fontSize: 9, color: active ? '#FFFFFF' : c.muted }}>
                    {inactive ? 'OFF' : !telemetry ? '—' : active ? 'ALVO' : 'LIVRE'}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={ui.body}>
            LE → LD: esquerda para direita. O lateral direito está desativado.
          </Text>
          {!isRealTime && (
            <Action
              title="Ler sensores agora"
              icon="scan-outline"
              tone="secondary"
              disabled={!connection}
              onPress={getSensors}
            />
          )}
        </Card>
        <Card>
          <Text style={ui.section}>Movimento</Text>
          <Text style={ui.body}>Ajuste com + e − ou toque no valor para digitar.</Text>
          {fields.slice(0, 2).map(renderField)}
        </Card>
        <Card>
          <Pressable
            accessibilityRole="button"
            aria-expanded={advanced}
            accessibilityState={{ expanded: advanced }}
            onPress={() => setAdvanced(!advanced)}
            style={[ui.row, { minHeight: 48, justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.section}>Tempos e estratégia</Text>
              <Text style={ui.body}>Frenagem, espera e variação de ataque.</Text>
            </View>
            <Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} size={22} color={c.primary} />
          </Pressable>
          {advanced && fields.slice(2).map(renderField)}
        </Card>
        <View style={{ gap: 10 }}>
          <Text style={ui.section}>Ferramentas</Text>
          <Action
            title="Calibrar movimentos e criar estratégia"
            icon="construct-outline"
            tone="secondary"
            onPress={() =>
              router.navigate({
                pathname: '/editar-estrategia',
                params: { id: '', tab: 'calibracao' },
              })
            }
          />
          <Action
            title="Abrir console de comunicação"
            icon="terminal-outline"
            tone="secondary"
            onPress={() => router.navigate('/console')}
          />
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Action
          title={busy ? 'Aguardando confirmação…' : 'Enviar todos os ajustes'}
          icon="cloud-upload-outline"
          busy={Boolean(busy)}
          disabled={!connection}
          onPress={() => void submit(fields)}
        />
        <Text style={s.caption}>Valores preparados no app; envie para aplicar no robô.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  field: { gap: 12, paddingTop: 16, borderTopWidth: 1, borderColor: c.line },
  label: { color: c.ink, fontSize: 15, fontWeight: '700' },
  stepper: {
    width: 46,
    height: 48,
    backgroundColor: c.background,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 13,
    paddingHorizontal: 10,
    gap: 4,
  },
  input: {
    flex: 1,
    minWidth: 30,
    color: c.ink,
    fontSize: 19,
    fontWeight: '600',
    paddingVertical: 10,
    textAlign: 'center',
  },
  sensor: {
    flex: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  sensorDot: { width: 7, height: 7, borderRadius: 4 },
  footer: {
    backgroundColor: c.surface,
    padding: 16,
    borderTopWidth: 1,
    borderColor: c.line,
    gap: 8,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  caption: { fontSize: 11, textAlign: 'center', color: c.muted },
});
