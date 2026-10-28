// Aion 2 classes. Icons are original line drawings (stroke paths, viewBox 0 0 24 24),
// not the game's official icons.
export const NEUTRAL_COLOR = '#e8b85a';

export const CLASSES = [
  { id: 'asesino', name: 'Asesino', color: '#b79cff',
    icon: 'M20 4 L17.6 8.8 L10.4 16 L8 13.6 L15.2 6.4 Z M6 12.5 L11.5 18 M9 15 L5 19 M3.8 18.2 L5.8 20.2 M4 4 L6.4 8.8 L13.6 16 L16 13.6 L8.8 6.4 Z M18 12.5 L12.5 18 M15 15 L19 19 M20.2 18.2 L18.2 20.2' },
  { id: 'gladiador', name: 'Gladiador', color: '#e0924a',
    icon: 'M12 2 L14.5 5 V15 H9.5 V5 Z M6.5 15 H17.5 M12 15 V20 M10 22 H14' },
  { id: 'templario', name: 'Templario', color: '#d9c27a',
    icon: 'M12 3 L19 6 V11 C19 16 15.5 19.5 12 21 C8.5 19.5 5 16 5 11 V6 Z M12 7 V17 M8.5 11 H15.5' },
  { id: 'arquero', name: 'Arquero', color: '#8fd18b',
    icon: 'M6 3 C14 6 14 18 6 21 M6 3 V21 M3 12 H20 M17 9 L20 12 L17 15' },
  { id: 'hechicero', name: 'Hechicero', color: '#ff7d7d',
    icon: 'M12 3 C15 8 18 10 18 14 A6 6 0 0 1 6 14 C6 10 9 9 12 3 Z M12 12 C13.5 14 14 15 14 16 A2 2 0 0 1 10 16 C10 15 10.5 14 12 12 Z' },
  { id: 'espiritista', name: 'Espiritista', color: '#6fd6d0',
    icon: 'M12 4 A8 8 0 1 1 4 12 M12 8 A4 4 0 1 1 8 12 M4 12 A4 4 0 0 1 12 8' },
  { id: 'clerigo', name: 'Clérigo', color: '#fff2c4',
    icon: 'M12 9 V22 M9 22 H15 M12 2 A3.5 3.5 0 1 1 12 9 A3.5 3.5 0 1 1 12 2 M7 5.5 H5 M19 5.5 H17' },
  { id: 'cantor', name: 'Cantor', color: '#ffb3e1',
    icon: 'M8 18 A2 2 0 1 1 8 17.9 M8 18 V5 L18 3 V15 M18 15 A2 2 0 1 1 18 14.9' },
];

const byId = new Map(CLASSES.map(c => [c.id, c]));
export function classById(id) {
  return byId.get(id) ?? null;
}
