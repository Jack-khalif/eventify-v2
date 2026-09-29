import type { Door, Guest } from '../schemas';

export const doors: Door[] = [
  { id: 'door_main', eventId: 'evt_sauti', name: 'Main Gate' },
  { id: 'door_side', eventId: 'evt_sauti', name: 'Side Gate' },
  { id: 'door_aisha', eventId: 'evt_sauti', name: 'Volunteer — Aisha K.' },
];

export const guests: Guest[] = [
  {
    ticketId: 'tkt_g1',
    code: 'EVT-SAUTI-0412',
    name: 'Amina Otieno',
    phone: '+254712345678',
    tierName: 'Regular',
    checkedInAt: null,
    checkedInDoor: null,
  },
  {
    ticketId: 'tkt_g2',
    code: 'EVT-SAUTI-0087',
    name: 'Brian Momanyi',
    phone: '+254733221009',
    tierName: 'VIP',
    checkedInAt: '2026-10-02T19:24:00+03:00',
    checkedInDoor: 'Main Gate',
  },
  {
    ticketId: 'tkt_g3',
    code: 'EVT-SAUTI-0533',
    name: 'Nyandeng Deng',
    phone: '+211922456781',
    tierName: 'Student',
    checkedInAt: null,
    checkedInDoor: null,
  },
];
