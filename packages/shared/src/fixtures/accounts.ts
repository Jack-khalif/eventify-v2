import type { Account, OrganizerApplication } from '../schemas';

/** Sample sign-ins, one per kind of user. The mock API accepts any of these emails. */
export const accounts: Account[] = [
  {
    id: 'acc_amani',
    name: 'Amani Wanjiru',
    email: 'organizer@eventify.test',
    role: 'organizer',
    organizerId: 'org_amani',
    agentId: null,
  },
  {
    id: 'acc_mizizi',
    name: 'Nyandeng Akol',
    email: 'pending@eventify.test',
    role: 'organizer',
    organizerId: 'org_mizizi',
    agentId: null,
  },
  {
    id: 'acc_lens',
    name: 'Brian Otieno',
    email: 'suspended@eventify.test',
    role: 'organizer',
    organizerId: 'org_lens',
    agentId: null,
  },
  {
    id: 'acc_grace',
    name: 'Grace Achieng',
    email: 'agent@eventify.test',
    role: 'agent',
    organizerId: null,
    agentId: 'agent_grace',
  },
  {
    id: 'acc_admin',
    name: 'Naomi Kiptoo',
    email: 'admin@eventify.test',
    role: 'super_admin',
    organizerId: null,
    agentId: null,
  },
];

export const organizerApplications: OrganizerApplication[] = [
  {
    organizerId: 'org_mizizi',
    contactName: 'Nyandeng Akol',
    email: 'pending@eventify.test',
    about:
      'We are a collective of painters and printmakers in Juba. We run open studio days and small exhibitions, about one a month.',
    appliedAt: '2026-09-24T09:30:00+03:00',
  },
];
