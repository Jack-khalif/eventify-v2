import type { Account, OrganizerApplication } from '../schemas';

/** Sample sign-ins, one per kind of user. The mock API accepts any of these phones. */
export const accounts: Account[] = [
  {
    id: 'acc_amani',
    name: 'Amani Wanjiru',
    phone: '+254700000001',
    role: 'organizer',
    organizerId: 'org_amani',
    agentId: null,
  },
  {
    id: 'acc_mizizi',
    name: 'Nyandeng Akol',
    phone: '+254700000002',
    role: 'organizer',
    organizerId: 'org_mizizi',
    agentId: null,
  },
  {
    id: 'acc_lens',
    name: 'Brian Otieno',
    phone: '+254700000003',
    role: 'organizer',
    organizerId: 'org_lens',
    agentId: null,
  },
  {
    id: 'acc_grace',
    name: 'Grace Achieng',
    phone: '+254700000010',
    role: 'agent',
    organizerId: null,
    agentId: 'agent_grace',
  },
  {
    id: 'acc_admin',
    name: 'Naomi Kiptoo',
    phone: '+254700000020',
    role: 'super_admin',
    organizerId: null,
    agentId: null,
  },
];

export const organizerApplications: OrganizerApplication[] = [
  {
    organizerId: 'org_mizizi',
    contactName: 'Nyandeng Akol',
    phone: '+254700000002',
    about:
      'We are a collective of painters and printmakers in Juba. We run open studio days and small exhibitions, about one a month.',
    appliedAt: '2026-09-24T09:30:00+03:00',
  },
];
