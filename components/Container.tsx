import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ContainerProps {
  children: React.ReactNode;
}

export const Container: React.FC<ContainerProps> = ({ children }) => {
  return (
    <SafeAreaView className="flex flex-1">
      <View className={styles.container}>{children}</View>
    </SafeAreaView>
  );
};

const styles = {
  container: 'flex flex-1 p-4',
};
