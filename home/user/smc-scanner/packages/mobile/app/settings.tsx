import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const rows = [
    { label: 'DEFAULT SYMBOL', value: 'V10 (1s)' },
    { label: 'DEFAULT HTF', value: '4H' },
    { label: 'DEFAULT LTF', value: '5m' },
    { label: 'API STATUS', value: 'CONNECTED' },
    { label: 'STRATEGY', value: 'SMC / ICT CRT' },
    { label: 'VERSION', value: '1.0.0' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.logo}>SMC▸ SETTINGS</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <View style={styles.card}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>OVERLAY DEFAULTS</Text>
          {['CRT LEVELS', 'FVG ZONES', 'LIQUIDITY SWEEPS', 'MSS / BOS / CHOCH'].map(item => (
            <View key={item} style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>{item}</Text>
              <Text style={[styles.rowValue, { color: '#00ff88' }]}>ON</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Token and overlay preferences can be configured in the web app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
    backgroundColor: '#050505',
  },
  logo: { color: '#00ff88', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  card: { borderWidth: 1, borderColor: '#1e1e1e', backgroundColor: '#050505', marginBottom: 12 },
  sectionLabel: { color: '#444', fontSize: 10, letterSpacing: 1, padding: 12, paddingBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#1e1e1e' },
  rowLabel: { color: '#888', fontSize: 11, letterSpacing: 0.5 },
  rowValue: { color: '#fff', fontSize: 11, fontWeight: '600' },
  note: { color: '#333', fontSize: 10, lineHeight: 16, textAlign: 'center', paddingVertical: 8 },
});
