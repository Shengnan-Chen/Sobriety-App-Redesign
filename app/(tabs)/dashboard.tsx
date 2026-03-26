import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'; 

const games = [
  { id: 1, name: 'Visual Pursuit', category: 'OCULUR ASSESSMENT', time: '2-5 min', icon: 'eye-outline', color: '#3B82F6' },
  { id: 2, name: 'Walk and Turn', category: 'PSYCHOMOTOR', time: '1-2 min', icon: 'walk-outline', color: '#8B5CF6' },
  { id: 3, name: 'Single Leg Stand', category: 'BALANCE CONTROL', time: '30 sec', icon: 'person-outline', color: '#06B6D4' },
  { id: 4, name: 'Choice Reaction', category: 'COGNITIVE', time: '1 min', icon: 'timer-outline', color: '#8B5CF6' },
  { id: 5, name: 'DSST', category: 'COGNITIVE', time: '2 min', icon: 'brain-outline', color: '#8B5CF6' },
  { id: 6, name: 'Tongue Twisters', category: 'LINGUISTIC', time: '1 min', icon: 'chatbox-outline', color: '#06B6D4' },
  { id: 7, name: 'Typing Challenge', category: 'MOTOR SKILLS', time: '2 min', icon: 'rocket-outline', color: '#10B981' },
  { id: 8, name: 'Stroop Naming', category: 'COGNITIVE', time: '30 sec', icon: 'text-outline', color: '#3B82F6' },
    { id: 9, name: 'Trail Task', category: 'COGNITIVE', time: '2 min', icon: 'trail-sign-outline', color: '#f63bf6' },
];

export default function Dashboard() {
  const router = useRouter(); 

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity>
          <Ionicons name="person-circle-outline" size={32} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {games.map((game) => (
            <TouchableOpacity 
              key={game.id} 
              style={styles.card}
              onPress={() => {
                router.push({
                  pathname: `/(tabs)/game-details`,
                  params: {
                    name: game.name,
                    category: game.category,
                    time: game.time,
                    icon: game.icon,
                    color: game.color,
                  },
                });
              }}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${game.color}15` }]}>
                <Ionicons name={game.icon as any} size={28} color={game.color} />
              </View>
              <Text style={styles.gameName}>{game.name}</Text>
              <Text style={styles.gameCategory}>{game.category}</Text>
              <View style={styles.timeContainer}>
                <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                <Text style={styles.timeText}>{game.time}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gameName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  gameCategory: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
  },
});