import {
  CATEGORY_TONE,
  DEFAULT_RATE_BPS,
  RESERVED_HANDLES,
  slugify,
  toEatIso,
  type Organizer,
  type OrganizerApplication,
  type OrganizerApplicationRequest,
  type OrganizerStatus,
} from '@eventify/shared';
import { organizerApplications, organizers as sampleOrganizers } from '@eventify/shared/fixtures';

/**
 * In-browser stand-in for the organizers table until the backend exists: the samples, the ones
 * people apply for in this browser, and the status an admin has since given each.
 */

type Db = {
  created: Organizer[];
  status: Record<string, OrganizerStatus>;
  applications: OrganizerApplication[];
};

const STORAGE_KEY = 'eventify-mock-organizers';
let db: Db = load();

function initial(): Db {
  return { created: [], status: {}, applications: [...organizerApplications] };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // Storage blocked or corrupt: start from the samples.
  }
  return initial();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Not persisted; fine for a mock.
  }
}

export function resetOrganizers() {
  db = initial();
}

export const allOrganizers = (): Organizer[] =>
  [...sampleOrganizers, ...db.created].map((o) => {
    const status = db.status[o.id];
    return status ? { ...o, status } : o;
  });

export const findOrganizer = (id: string) => allOrganizers().find((o) => o.id === id);

export function setOrganizerStatus(id: string, status: OrganizerStatus) {
  db.status[id] = status;
  save();
}

/** Oldest first. */
export const applications = () =>
  [...db.applications].sort((a, b) => Date.parse(a.appliedAt) - Date.parse(b.appliedAt));

function uniqueHandle(name: string, ownId?: string) {
  const base = slugify(name).slice(0, 36).replace(/-$/, '') || 'organizer';
  const taken = new Set([
    ...RESERVED_HANDLES,
    ...allOrganizers()
      .filter((o) => o.id !== ownId)
      .map((o) => o.handle),
  ]);
  let handle = base.length < 2 ? `${base}-events` : base;
  for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`;
  return handle;
}

/**
 * Record an application: a new organizer, or (for a declined one applying again) the same
 * organizer with the new details. Either way it waits as "pending".
 */
export function submitApplication(
  req: OrganizerApplicationRequest,
  phone: string,
  existingId: string | null,
  now = Date.now(),
): Organizer {
  const id = existingId ?? `org_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const organizer: Organizer = {
    id,
    handle: uniqueHandle(req.organizerName, id),
    name: req.organizerName,
    type: req.type,
    verified: false,
    bio: '',
    bannerTone: CATEGORY_TONE[req.category],
    city: req.city,
    category: req.category,
    agentId: null,
    rateBps: DEFAULT_RATE_BPS,
    status: 'pending',
    payoutMethod: req.payoutMethod,
  };
  db.created = [...db.created.filter((o) => o.id !== id), organizer];
  db.status[id] = 'pending';
  db.applications = [
    ...db.applications.filter((a) => a.organizerId !== id),
    {
      organizerId: id,
      contactName: req.contactName,
      phone,
      about: req.about,
      appliedAt: toEatIso(now),
    },
  ];
  save();
  return organizer;
}
