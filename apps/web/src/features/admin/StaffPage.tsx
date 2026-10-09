import { addStaffRequestSchema, type AdminRole, type StaffRow } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card, Dialog, SelectField, Tag, TextField } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { QueryView } from './QueryView';
import { useAddStaff, useRemoveStaff, useStaff } from './useAdmin';

const ROLE_LABEL: Record<AdminRole, string> = { super_admin: 'Super Admin', agent: 'Agent' };

/** /admin/staff: who can open the admin portal. Super Admin only. */
export function StaffPage() {
  useDocumentTitle('Staff');
  const query = useStaff();
  const [leaving, setLeaving] = useState<StaffRow | null>(null);
  return (
    <AdminPage title="Staff" width="max-w-[900px]">
      <QueryView query={query} label="staff">
        {(rows) => (
          <>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {rows.map((s) => (
                <li key={s.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-extrabold">{s.name || s.email}</span>
                      <span className="text-xs break-all text-muted">
                        {s.email}
                        {s.role === 'agent' &&
                          ` · ${s.organizers} organizer${s.organizers === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone="accent">{ROLE_LABEL[s.role]}</Tag>
                      <Tag tone={s.twoStep ? 'good' : 'neutral'}>
                        {s.twoStep ? 'Two-step on' : 'Two-step off'}
                      </Tag>
                      <Button variant="outline" size="sm" onClick={() => setLeaving(s)}>
                        Remove
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <AddStaff />
          </>
        )}
      </QueryView>
      {leaving && <RemoveDialog person={leaving} onClose={() => setLeaving(null)} />}
    </AdminPage>
  );
}

function AddStaff() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('agent');
  const [error, setError] = useState<string>();
  const add = useAddStaff();

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const req = addStaffRequestSchema.safeParse({ email, name, role });
    if (!req.success) return setError(req.error.issues[0]?.message ?? 'Check the details.');
    setError(undefined);
    add.mutate(req.data, {
      onSuccess: () => {
        setEmail('');
        setName('');
      },
    });
  };

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <h2 className="m-0 text-lg">Add someone</h2>
        <p className="m-0 text-sm text-muted">
          They sign in with this email address and the code we send to it. Agents see only the
          organizers assigned to them; Super Admins see and can change everything.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={(ev) => setName(ev.target.value)} />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
          />
        </div>
        <SelectField
          label="Access"
          value={role}
          onChange={(ev) => setRole(ev.target.value as AdminRole)}
          className="sm:max-w-[280px]"
        >
          <option value="agent">Agent</option>
          <option value="super_admin">Super Admin</option>
        </SelectField>
        {(error ?? add.error?.message) && (
          <p role="alert" className="m-0 text-sm text-danger">
            {error ?? add.error?.message}
          </p>
        )}
        <Button type="submit" className="self-start" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Give access'}
        </Button>
      </form>
    </Card>
  );
}

function RemoveDialog({ person, onClose }: { person: StaffRow; onClose: () => void }) {
  const remove = useRemoveStaff();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remove ${person.name || person.email}?`}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => remove.mutate(person.id, { onSuccess: onClose })}
            disabled={remove.isPending}
          >
            {remove.isPending ? 'Removing…' : 'Remove access'}
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm">
        They are signed out everywhere straight away and can no longer open the admin portal.
        {person.role === 'agent' && person.organizers > 0 && (
          <>
            {' '}
            Their {person.organizers} organizer{person.organizers === 1 ? '' : 's'} will have no
            agent until you assign one.
          </>
        )}
      </p>
      {remove.error && (
        <p role="alert" className="m-0 mt-3 text-sm text-danger">
          {remove.error.message}
        </p>
      )}
    </Dialog>
  );
}
