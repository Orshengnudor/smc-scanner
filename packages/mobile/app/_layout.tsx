import { Tabs } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#000000" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#050505',
              borderTopColor: '#1e1e1e',
              borderTopWidth: 1,
              height: 56,
              paddingBottom: 6,
            },
            tabBarActiveTintColor: '#00ff88',
            tabBarInactiveTintColor: '#555555',
            tabBarLabelStyle: {
              fontFamily: 'System',
              fontSize: 10,
              letterSpacing: 0.5,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'CHARTS',
              tabBarIcon: ({ color }) => (
                <Ionicons name="bar-chart-outline" size={20} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="scanner"
            options={{
              title: 'SCANNER',
              tabBarIcon: ({ color }) => (
                <Ionicons name="scan-outline" size={20} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'SETTINGS',
              tabBarIcon: ({ color }) => (
                <Ionicons name="settings-outline" size={20} color={color} />
              ),
            }}
          />
        </Tabs>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
