import { Ionicons as NativeIcon } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

// Icons decorate controls; their containing button or adjacent text provides the label.
function DecorativeIcon(props: ComponentProps<typeof NativeIcon>) {
  return <NativeIcon {...props} accessible={false} aria-hidden importantForAccessibility="no" />;
}

export default Object.assign(DecorativeIcon, { glyphMap: NativeIcon.glyphMap });
