import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';

// Project Infinity brand ramp, centred on violet #7C3AED (shade 80)
const brand: BrandVariants = {
  10: '#0A0418',
  20: '#160A33',
  30: '#22104F',
  40: '#2E156B',
  50: '#3B1B88',
  60: '#4920A6',
  70: '#5B25C6',
  80: '#7C3AED',
  90: '#8B50F0',
  100: '#9966F2',
  110: '#A77CF4',
  120: '#B592F6',
  130: '#C3A8F8',
  140: '#D1BEFA',
  150: '#E0D4FC',
  160: '#EFE9FE',
};

const base = {
  fontFamilyBase: "'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif",
  borderRadiusMedium: '8px',
  borderRadiusLarge: '12px',
  borderRadiusXLarge: '16px',
};

export const lightTheme: Theme = {
  ...createLightTheme(brand),
  ...base,
  colorNeutralBackground1: '#FFFFFF',
  colorNeutralBackground2: '#F6F7FB',
};

export const darkTheme: Theme = {
  ...createDarkTheme(brand),
  ...base,
  // Deep navy canvas; surfaces are translucent glass on top of it
  colorNeutralBackground1: 'rgba(22, 24, 41, 0.72)',
  colorNeutralBackground2: '#0A0A1F',
  colorNeutralBackground3: 'rgba(255, 255, 255, 0.04)',
  colorNeutralBackground1Hover: 'rgba(255, 255, 255, 0.06)',
  colorNeutralBackground1Pressed: 'rgba(255, 255, 255, 0.09)',
  colorNeutralStroke1: 'rgba(255, 255, 255, 0.14)',
  colorNeutralStroke2: 'rgba(255, 255, 255, 0.09)',
  colorNeutralStroke3: 'rgba(255, 255, 255, 0.06)',
  colorBrandForeground1: '#A5A2F7',
  colorBrandForeground2: '#C1C0F9',
  colorBrandBackground: '#5B52F0',
  colorBrandBackgroundHover: '#6B63F3',
  colorBrandBackgroundPressed: '#4F46E5',
  colorNeutralForeground2: '#C7CBE0',
  colorNeutralForeground3: '#8E93B0',
};
