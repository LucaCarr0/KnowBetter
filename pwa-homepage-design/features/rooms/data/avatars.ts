// Kenney Animal Pack Remastered, PNG/Round. See public/avatars/kenney/README.md.
export const avatars = [
  { id: 'panda', label: 'Panda', src: '/avatars/kenney/panda.png' },
  { id: 'frog', label: 'Frog', src: '/avatars/kenney/frog.png' },
  { id: 'dog', label: 'Dog', src: '/avatars/kenney/dog.png' },
  { id: 'rabbit', label: 'Rabbit', src: '/avatars/kenney/rabbit.png' },
  { id: 'owl', label: 'Owl', src: '/avatars/kenney/owl.png' },
  { id: 'sloth', label: 'Sloth', src: '/avatars/kenney/sloth.png' },
  { id: 'bear', label: 'Bear', src: '/avatars/kenney/bear.png' },
  { id: 'penguin', label: 'Penguin', src: '/avatars/kenney/penguin.png' },
  { id: 'narwhal', label: 'Narwhal', src: '/avatars/kenney/narwhal.png' },
  { id: 'elephant', label: 'Elephant', src: '/avatars/kenney/elephant.png' },
  { id: 'giraffe', label: 'Giraffe', src: '/avatars/kenney/giraffe.png' },
  { id: 'monkey', label: 'Monkey', src: '/avatars/kenney/monkey.png' },
  { id: 'buffalo', label: 'Buffalo', src: '/avatars/kenney/buffalo.png' },
  { id: 'chick', label: 'Chick', src: '/avatars/kenney/chick.png' },
  { id: 'chicken', label: 'Chicken', src: '/avatars/kenney/chicken.png' },
  { id: 'cow', label: 'Cow', src: '/avatars/kenney/cow.png' },
  { id: 'crocodile', label: 'Crocodile', src: '/avatars/kenney/crocodile.png' },
  { id: 'duck', label: 'Duck', src: '/avatars/kenney/duck.png' },
  { id: 'goat', label: 'Goat', src: '/avatars/kenney/goat.png' },
  { id: 'gorilla', label: 'Gorilla', src: '/avatars/kenney/gorilla.png' },
  { id: 'hippo', label: 'Hippo', src: '/avatars/kenney/hippo.png' },
  { id: 'horse', label: 'Horse', src: '/avatars/kenney/horse.png' },
  { id: 'moose', label: 'Moose', src: '/avatars/kenney/moose.png' },
  { id: 'parrot', label: 'Parrot', src: '/avatars/kenney/parrot.png' },
  { id: 'pig', label: 'Pig', src: '/avatars/kenney/pig.png' },
  { id: 'rhino', label: 'Rhino', src: '/avatars/kenney/rhino.png' },
  { id: 'snake', label: 'Snake', src: '/avatars/kenney/snake.png' },
  { id: 'walrus', label: 'Walrus', src: '/avatars/kenney/walrus.png' },
  { id: 'whale', label: 'Whale', src: '/avatars/kenney/whale.png' },
  { id: 'zebra', label: 'Zebra', src: '/avatars/kenney/zebra.png' },
] as const

export type AvatarId = (typeof avatars)[number]['id']
export const DEFAULT_AVATAR_ID: AvatarId = 'panda'

// Old emoji choices may still exist in guest preferences and saved rooms.
const legacyAvatarIds: Readonly<Record<string, AvatarId>> = {
  fox: 'dog',
  tiger: 'bear',
  unicorn: 'narwhal',
  octopus: 'whale',
}

export function normalizeAvatarId(value: unknown): AvatarId | undefined {
  if (typeof value !== 'string') return undefined
  const avatar = avatars.find((item) => item.id === value)
  if (avatar) return avatar.id
  return Object.hasOwn(legacyAvatarIds, value) ? legacyAvatarIds[value] : undefined
}

export function getAvatar(id: string) {
  const normalized = normalizeAvatarId(id) ?? DEFAULT_AVATAR_ID
  return avatars.find((avatar) => avatar.id === normalized) ?? avatars[0]
}
